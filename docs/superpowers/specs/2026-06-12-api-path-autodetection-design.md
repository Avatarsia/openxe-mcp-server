# Design: API-Pfad Auto-Detection + Self-Healing

**Datum:** 2026-06-12
**Status:** Entwurf (vom User freigegeben, Umsetzung ausstehend)

## Problem

Der MCP-Server haengt den REST-Pfad fix als `OPENXE_API_PATH` (Default `/api/index.php`) an `OPENXE_URL` an. OpenXE-Installationen unterscheiden sich aber im Apache-Layout:

- DocumentRoot = `www/`-Verzeichnis → API unter `/api/index.php/...`
- DocumentRoot = Repo-Root (offizielle INSTALL.md) → API unter `/www/api/index.php/...`
- Setup mit Rewrite-Rules → API unter `/api/...`

Beim falschen Pfad blockt die OpenXE-generierte `.htaccess` (`<FilesMatch "."> Deny from all`) mit einer Apache-403-HTML-Seite, der Client wirft `OpenXEApiError 7499: HTTP 403 with unparseable body` — ohne Hinweis auf die Ursache.

## Ziel

Der MCP-Server findet den korrekten API-Pfad selbststaendig und laeuft auf jeder Maschine ohne `OPENXE_API_PATH`-Konfiguration. Schlaegt die Erkennung fehl, erklaert die Fehlermeldung praezise, was getestet wurde und was zu tun ist.

## Design

### 1. Config (`src/config.ts`)

- `OPENXE_API_PATH` verliert seinen Default und wird optional.
- Gesetzt → fixer Pfad, Auto-Detection vollstaendig deaktiviert (Override fuer Spezial-Setups).
- Nicht gesetzt → Auto-Detection aktiv.

### 2. Neues Modul `src/client/api-path-detector.ts`

- `detectApiPath(baseUrl, fetchFn, timeout): Promise<string>`
- Probt Kandidaten in fester Reihenfolge:
  1. `/api/index.php`
  2. `/www/api/index.php`
  3. `/api`
- Probe = `GET <baseUrl><kandidat>/v1/adressen?limit=1` **ohne Credentials**.
- Treffer-Kriterium (eines genuegt):
  - HTTP 401 mit `WWW-Authenticate: Digest`-Header (kommt nur von der echten OpenXE-API)
  - HTTP 200 mit JSON-Content-Type
- Kein Treffer → `ApiPathDetectionError` (siehe Fehlermeldungen).

### 3. `OpenXEClient` — Lifecycle (`src/client/openxe-client.ts`)

- Cache `apiPath: string | null` + geteilte `detectionPromise` — parallele Requests loesen genau eine Probe-Serie aus.
- **Eager:** Detection beim Serverstart anstossen; Fehler (z.B. OpenXE offline) wird nur als stderr-Warnung geloggt — der MCP-Start schlaegt nie deswegen fehl.
- **Lazy-Fallback:** Ist beim ersten echten Request noch kein Pfad ermittelt, wird die Detection dort (erneut) ausgefuehrt.
- **Self-Healing:** Scheitert ein Request mit 403/404 + unparseable Body (HTML statt JSON):
  - Cache invalidieren, Detection erneut ausfuehren.
  - Nur wenn der neue Pfad vom alten abweicht: urspruenglichen Request genau **einmal** wiederholen.
  - Gleicher Pfad → Original-Fehler werfen (kein Retry).
  - Max. 1 Re-Detection pro Request (Loop-Schutz).
  - Echte Berechtigungs-403 (JSON-Error-Body von OpenXE) triggert **keine** Re-Detection.
- Writes werden nie als Probe verwendet — die Probe ist immer der credential-freie GET aus dem Detector.

### 4. Fehlermeldungen

Alle Meldungen Englisch (konsistent mit bestehenden Client-Fehlern), maschinen- und LLM-lesbar, immer mit konkreter Handlungsanweisung.

**`ApiPathDetectionError`** (alle Kandidaten gescheitert):

```
OpenXE API path detection failed for http://10.20.0.40 — no candidate responded like an OpenXE API:
  /api/index.php      -> HTTP 403 (HTML error page — Apache blocked the request)
  /www/api/index.php  -> HTTP 404
  /api                -> HTTP 403 (HTML error page — Apache blocked the request)
Check: (1) Is OPENXE_URL correct? (2) Is the OpenXE REST API module enabled?
(3) Set OPENXE_API_PATH manually if your install uses a custom layout.
```

- Pro Kandidat: HTTP-Status + Body-Klassifikation (`HTML error page`, `JSON`, `empty`, `unknown`).

**Server nicht erreichbar** (ECONNREFUSED / Timeout / DNS):

```
OpenXE at http://10.20.0.40 is unreachable (connection refused).
Check: server running? IP/port correct in OPENXE_URL? Firewall?
```

**403 nach erfolgloser Re-Detection** (Self-Healing fand keinen besseren Pfad):

```
HTTP 403 with non-JSON body from <url> — Apache is blocking this path.
API path re-detection found no working alternative (tried: /api/index.php, /www/api/index.php, /api).
The previously working path may have been blocked server-side (.htaccess / vhost config).
```

- Ersetzt die bisherige nackte Meldung `HTTP 403 with unparseable body` ueberall dort, wo der Body als HTML klassifiziert wurde.

### 5. Logging

- Ausschliesslich stderr (`console.error`) — stdout ist der MCP-Protokollkanal.
- Erkannter Pfad wird einmalig geloggt: `OpenXE API path detected: /www/api/index.php`.
- Start-Detection-Fehler: `API path detection at startup failed (<grund>) — will retry on first request.`

### 6. Tests (Vitest, gemockter fetch)

- Detection findet Pfad fuer jedes der drei Layouts.
- 401 + `WWW-Authenticate: Digest` als Erfolgssignal; 403-HTML als Fehlschlag.
- Explizit gesetztes `OPENXE_API_PATH` → null Probe-Requests.
- Offline beim Start → Start ok, Lazy-Detection beim ersten Request.
- Self-Healing: Pfadwechsel → genau 1 Retry; gleicher Pfad → Original-Fehler; Berechtigungs-403 (JSON) → keine Re-Detection; kein Endlos-Loop.
- Alle Kandidaten scheitern → `ApiPathDetectionError` enthaelt alle getesteten Pfade + Status.
- Parallele erste Requests → genau eine Probe-Serie.

### 7. Doku

- `.env.example`: `OPENXE_API_PATH` als optional markieren, Auto-Detection-Verhalten beschreiben.
- README: Abschnitt zur Auto-Detection (Kandidatenliste, Override).

## Nicht-Ziele

- Kein Persistieren des erkannten Pfads in `.env` (nur Prozess-Cache + Log).
- Keine Detection weiterer Layouts ueber die drei Kandidaten hinaus.
- Keine Aenderung der Legacy-API-Pfadlogik ausser dem gemeinsamen Basis-Pfad.
