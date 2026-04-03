# OpenXE MCP Server

Verbinde dein [OpenXE ERP](https://openxe.de/) mit jedem KI-Assistenten -- per [MCP (Model Context Protocol)](https://modelcontextprotocol.io/).

> **69 Tools** | **19 Resources** | **5 Berichte** | **11 Dashboard-KPIs** | Verifiziert gegen OpenXE v1.12

## Was ist das?

Dieser Server verbindet dein OpenXE ERP-System mit lokalen KI-Assistenten wie LM Studio, Ollama, OpenWebUI und anderen MCP-faehigen Clients. Du stellst Fragen auf Deutsch, und der Assistent liest und schreibt automatisch in deinem ERP -- alles lokal, keine Cloud noetig.

**Beispiele:**

- *"Zeig mir alle offenen Auftraege"*
- *"Erstelle einen neuen Kunden: Firma Muster GmbH, Musterstr. 1, 12345 Berlin"*
- *"Wie hoch ist der Umsatz diesen Monat?"*
- *"Welche Rechnungen sind ueberfaellig?"*
- *"Erstelle eine Bestellung bei Lieferant Mueller fuer 100 Schrauben"*

## Voraussetzungen

- **Node.js** Version 20 oder neuer ([Download](https://nodejs.org/))
- **OpenXE** mit aktiviertem API-Zugang
- Ein **KI-Assistent** der MCP unterstuetzt (LM Studio, OpenWebUI, Ollama, etc.)

## Einrichtung

### Schritt 1: API-Benutzer in OpenXE anlegen

1. Melde dich als Admin in OpenXE an
2. Gehe zu **Administration > Einstellungen > Benutzer**
3. Erstelle einen neuen Benutzer (oder verwende einen bestehenden)
4. Setze unter **API > REST-API** ein Passwort
5. Merke dir **Benutzername** und **Passwort**

### Schritt 2: MCP-Server in deinem KI-Assistenten einrichten

Der Server wird automatisch heruntergeladen und gestartet -- du musst nichts installieren. Du brauchst nur drei Angaben:

| Angabe | Beispiel | Beschreibung |
|--------|---------|-------------|
| `OPENXE_URL` | `http://192.168.0.100` | Die Adresse deines OpenXE-Servers |
| `OPENXE_USERNAME` | `api-user` | Der API-Benutzername aus Schritt 1 |
| `OPENXE_PASSWORD` | `mein-passwort` | Das API-Passwort aus Schritt 1 |

#### LM Studio

Ab Version 0.3+. Oeffne **Settings > MCP** und fuege folgendes ein:

**Minimale Konfiguration** (LAN-Betrieb, schneller Einstieg):

```json
{
  "openxe": {
    "command": "npx",
    "args": ["-y", "github:Avatarsia/openxe-mcp-server"],
    "env": {
      "OPENXE_URL": "http://192.168.0.100",
      "OPENXE_USERNAME": "api-user",
      "OPENXE_PASSWORD": "mein-passwort",
      "OPENXE_ALLOW_HTTP": "1"
    }
  }
}
```

**Vollstaendige Konfiguration** (mit allen Optionen):

```json
{
  "openxe": {
    "command": "npx",
    "args": ["-y", "github:Avatarsia/openxe-mcp-server"],
    "env": {
      "OPENXE_URL": "http://192.168.0.100",
      "OPENXE_USERNAME": "api-user",
      "OPENXE_PASSWORD": "mein-passwort",
      "OPENXE_ALLOW_HTTP": "1",
      "OPENXE_MODE": "router",
      "OPENXE_TIMEOUT": "30000",
      "OPENXE_AUDIT_LOG": "1"
    }
  }
}
```

**Was bedeuten die einzelnen Einstellungen?**

| Variable | Wert im Beispiel | Was macht das? |
|----------|-----------------|----------------|
| `OPENXE_URL` | `http://192.168.0.100` | Die IP-Adresse oder URL deines OpenXE-Servers im Netzwerk. |
| `OPENXE_USERNAME` | `api-user` | Der Benutzername, den du in OpenXE unter API angelegt hast. |
| `OPENXE_PASSWORD` | `mein-passwort` | Das dazugehoerige Passwort. |
| `OPENXE_ALLOW_HTTP` | `1` | Unterdrueckt die Sicherheitswarnung bei HTTP-Verbindungen. Im lokalen Netzwerk (LAN) ist HTTP in Ordnung -- die Warnung ist fuer Internetverbindungen gedacht, wo HTTPS Pflicht waere. |
| `OPENXE_MODE` | `router` | Steuert, wie viele Tools das LLM sieht. `router` (Standard) zeigt nur 2 kompakte Tools -- ideal fuer lokale Modelle mit begrenztem Kontextfenster. `full` zeigt alle 69 Tools einzeln. `readonly` erlaubt nur Lesen (kein Erstellen/Bearbeiten/Loeschen). |
| `OPENXE_TIMEOUT` | `30000` | Wie lange der Server maximal auf eine Antwort von OpenXE wartet (in Millisekunden). 30000 = 30 Sekunden. Bei langsamen Servern oder grossen Abfragen auf 60000 erhoehen. |
| `OPENXE_AUDIT_LOG` | `1` | Protokolliert jeden einzelnen Tool-Aufruf (welches Tool, welche Parameter, wann). Nuetzlich zum Nachvollziehen, was das LLM gemacht hat. Sensible Daten (IBAN, PayPal, Passwoerter) werden dabei automatisch maskiert. Das Protokoll erscheint in der Konsole (stderr). |

> **Tipp fuer lokale Modelle:** Verwende den `router`-Modus (Standard). Er reduziert den Token-Verbrauch von ~10.000 auf ~1.500 Tokens fuer die Tool-Definitionen -- das laesst mehr Platz fuer deine eigentliche Frage und die Antwort.

#### OpenWebUI + Ollama

Ab OpenWebUI 0.6+. Unter **Admin > Tools > MCP Servers** eintragen:

- **Command:** `npx`
- **Args:** `-y github:Avatarsia/openxe-mcp-server`
- **Umgebungsvariablen:** `OPENXE_URL`, `OPENXE_USERNAME`, `OPENXE_PASSWORD`

#### Andere MCP-Clients

Jeder Client mit stdio-Transport funktioniert:

```bash
OPENXE_URL=http://dein-openxe-server \
OPENXE_USERNAME=dein-api-user \
OPENXE_PASSWORD=dein-api-passwort \
npx -y github:Avatarsia/openxe-mcp-server
```

### Schritt 3: Testen

Starte deinen KI-Assistenten und frage: *"Zeig mir alle Artikel"*. Wenn Daten kommen, funktioniert alles.

---

## Funktionen

### Was kann der Server?

| Bereich | Lesen | Schreiben | Berichte |
|---------|-------|-----------|----------|
| **Kunden & Lieferanten** | Auflisten, Suchen, Details | Anlegen, Bearbeiten (60+ Felder inkl. Bank, PayPal, SEPA, Dokumentversand) | -- |
| **Artikel** | Auflisten, Details, Preise, Lagerbestand | -- | Lagerwert, Nachbestellbedarf |
| **Auftraege** | Auflisten, Details, Positionen | Anlegen, Bearbeiten, Freigeben | Auftragseingang |
| **Rechnungen** | Auflisten, Details, Positionen | Anlegen, Bearbeiten, Freigeben, Bezahlt markieren | Umsatz, Offene Posten, Altersstruktur |
| **Angebote** | Auflisten, Details | Anlegen, Bearbeiten, In Auftrag wandeln | -- |
| **Lieferscheine** | Auflisten, Details | Anlegen, Bearbeiten | -- |
| **Gutschriften** | Auflisten, Details | Anlegen, Bearbeiten | -- |
| **Bestellungen (Einkauf)** | Auflisten, Details, Positionen | Anlegen, Bearbeiten, Freigeben | Einkaufsvolumen je Lieferant |
| **Einkaufspreise** | Staffelpreise je Lieferant | -- | -- |
| **Abonnements** | Auflisten, Details | Anlegen, Bearbeiten, Loeschen | -- |
| **CRM** | -- | Notizen, Telefonate, E-Mails erfassen | -- |
| **Zeiterfassung** | Status, Wochenuebersicht, Eintraege | Ein-/Ausstempeln, Eintraege CRUD | -- |
| **Tracking** | -- | Sendungsnummern anlegen | -- |
| **Dateien** | Auflisten | Hochladen (base64) | -- |
| **Dashboard** | 11 KPIs (Umsatz, Auftraege, Kunden, Lager, Einkauf) | -- | -- |
| **Berichte** | 5 Reports (Umsatz, Offene Posten, Lager, Beschaffung, Periodenvergleich) | -- | -- |
| **PDF** | Einzeln oder bis zu 20 auf einmal | -- | -- |

### Smart Filters

Alle Listen-Abfragen unterstuetzen clientseitige Filter:

- **where:** `{plz: {startsWith: "2"}}`, `{gesamtsumme: {gt: 100}}`, `{land: {equals: "DE"}}`
- **sort/limit:** Ergebnisse sortieren und begrenzen
- **zeitraum:** `dieser-monat`, `letzter-monat`, `letzte-30-tage`, `Q1-2026`, `2025`
- **status_preset:** `offene-rechnungen`, `nicht-versendet`, `ueberfaellige-rechnungen`, etc.
- **aggregate:** `count`, `sum_feld`, `avg_feld`, `groupBy_feld`
- **format:** `table`, `csv`, `ids`

### Berichte

| Bericht | Beschreibung |
|---------|-------------|
| **Umsatzbericht** | Nach Kunde, Artikel, Monat, Quartal, Jahr oder Projekt -- mit optionaler Margenberechnung |
| **Offene Posten** | Liste, Altersstruktur (0-30/31-60/61-90/90+ Tage), Kreditlimit-Auslastung |
| **Lagerbestand** | Uebersicht, Nachbestellbedarf, Lagerwert (VK) |
| **Beschaffung** | Einkaufsvolumen je Lieferant, offene Bestellungen mit Ueberfaellig-Warnung |
| **Periodenvergleich** | Aktuell vs. Vorperiode (Monat/Quartal/Jahr) fuer Umsatz, Auftraege, Neukunden, Rechnungen |

---

## Konfiguration

### Pflicht-Variablen

| Variable | Beschreibung |
|---|---|
| `OPENXE_URL` | Basis-URL deiner OpenXE-Instanz (z.B. `http://192.168.0.100`) |
| `OPENXE_USERNAME` | API-Benutzername |
| `OPENXE_PASSWORD` | API-Passwort |

### Optionale Variablen

| Variable | Default | Beschreibung |
|---|---|---|
| `OPENXE_API_PATH` | `/api/index.php` | API-Endpunkt-Pfad (nur aendern wenn noetig) |
| `OPENXE_TIMEOUT` | `30000` | Request-Timeout in Millisekunden |
| `OPENXE_MODE` | `router` | `router` (2 Tools, wenig Tokens), `full` (alle einzeln), `readonly` (nur Lesen) |
| `OPENXE_ALLOW_HTTP` | - | Auf `1` setzen um die HTTP-Warnung im LAN zu unterdruecken |
| `OPENXE_AUDIT_LOG` | - | Auf `1` setzen fuer Audit-Logging aller Tool-Aufrufe |

### Sicherheits-Variablen (nur fuer Netzwerk-Betrieb mit `--http`)

| Variable | Default | Beschreibung |
|---|---|---|
| `MCP_AUTH_TOKEN` | - | Bearer-Token fuer HTTP-Zugriff |
| `MCP_HTTP_HOST` | `127.0.0.1` | Bind-Adresse (`0.0.0.0` fuer Netzwerk, nur mit Reverse-Proxy!) |
| `MCP_ALLOWED_ORIGINS` | - | Erlaubte Origins (kommagetrennt, DNS-Rebinding-Schutz) |

---

## Haeufige Probleme

### Der KI-Assistent findet keine Daten

- Pruefe ob die OpenXE-URL erreichbar ist: `curl http://dein-openxe-server/api/index.php`
- Pruefe ob Benutzername und Passwort stimmen
- Pruefe ob die Umgebungsvariablen korrekt gesetzt sind

### Authentifizierung schlaegt fehl

- OpenXE nutzt **HTTP Digest Auth** -- der Benutzer braucht ein Passwort unter **API > REST-API**
- Sonderzeichen im Passwort koennen Probleme mit Umgebungsvariablen verursachen

### Timeout bei grossen Abfragen

- Erhoehe `OPENXE_TIMEOUT` (z.B. auf `60000` fuer 60 Sekunden)
- Verwende spezifischere Abfragen statt *"zeig mir alles"*

### Leere Ergebnisse bei Bestellungen

- Bestellungen (Einkauf) sind nicht ueber die REST v1 API verfuegbar -- der MCP-Server nutzt automatisch die Legacy API als Fallback
- Wenn trotzdem leer: pruefe ob Bestellungen in OpenXE existieren

---

## Sicherheit

### Lokaler Betrieb (Standard)

Im Normalfall laeuft der Server als Subprocess deines KI-Assistenten (stdio-Transport). Dabei werden **keine Netzwerkports geoeffnet** -- die Kommunikation laeuft ueber Pipes. Fuer den Betrieb im lokalen Netzwerk sind keine zusaetzlichen Einstellungen noetig.

### Read-Only Modus

Wenn du nur Daten lesen moechtest (kein Erstellen/Bearbeiten/Loeschen):

```bash
OPENXE_MODE=readonly
```

### Netzwerk-Betrieb (--http)

Nur wenn du den Server als eigenstaendigen Netzwerkdienst betreiben willst:

```bash
MCP_AUTH_TOKEN=dein-token npx -y github:Avatarsia/openxe-mcp-server -- --http
```

- Bindet standardmaessig nur auf `127.0.0.1` (nicht von aussen erreichbar)
- Mit `MCP_HTTP_HOST=0.0.0.0` von aussen erreichbar -- **nur hinter einem Reverse-Proxy mit HTTPS verwenden!**

### Tool Annotations

Alle Tools tragen MCP-Annotations (readOnlyHint, destructiveHint, idempotentHint). Dein KI-Client kann damit automatisch vor kritischen Aktionen warnen.

---

## Fuer Entwickler

### Konfiguration via .env-Datei

Der Server unterstuetzt eine `.env`-Datei im Projektverzeichnis. Kopiere `.env.example` und passe die Werte an:

```bash
cp .env.example .env
```

Die `.env`-Datei wird **nicht** nach Git committed (steht in `.gitignore`). Umgebungsvariablen die direkt gesetzt werden (z.B. ueber die MCP-Client-Konfiguration) haben Vorrang vor `.env`.

### Projektstruktur

```
src/
  index.ts          # MCP-Server Einstiegspunkt (laedt dotenv)
  config.ts         # Umgebungsvariablen (Zod-validiert)
  client/           # HTTP Digest Auth Client fuer OpenXE
  tools/            # Tool Handler (Schreiben via Legacy API)
    report-tools.ts # 5 Berichts-Tools
    procurement-tools.ts # Beschaffung (Bestellungen)
    document-tools.ts    # Belege CRUD + Konvertierung
    address-tools.ts     # Adressen mit Feld-Normalisierung
    ...
  resources/        # Resource Handler (Lesen via REST v1)
  schemas/          # Zod-Schemas fuer Eingabe-Validierung
  utils/            # Smart Filters, Pagination, Aggregation
tests/              # 369 Unit-Tests (Vitest)
docs/
  api-reference/    # Verifizierte OpenXE API-Dokumentation
  llm/              # LLM-optimierte Kurzreferenz
```

### Lokal entwickeln

```bash
git clone https://github.com/Avatarsia/openxe-mcp-server.git
cd openxe-mcp-server
npm install
cp .env.example .env     # Dann Werte anpassen
npm run build
npm test
npm start
```

Der Server laedt automatisch eine `.env`-Datei aus dem Projektverzeichnis (via [dotenv](https://www.npmjs.com/package/dotenv)). Alternativ koennen die Variablen weiterhin direkt als Umgebungsvariablen oder ueber die MCP-Client-Konfiguration gesetzt werden — `.env` hat die niedrigste Prioritaet.

### API-Dokumentation

Verifizierte Dokumentation im Verzeichnis `docs/api-reference/`:

- **AUTH.md** -- HTTP Digest Authentifizierung, 96 Permissions
- **LEGACY-API.md** -- 120+ Legacy API Endpoints (Schreiben)
- **REST-V1-STAMMDATEN.md** -- Artikel, Adressen, Kategorien, etc.
- **REST-V1-BELEGE.md** -- Auftraege, Rechnungen, Lieferscheine, etc.
- **REST-V1-SONSTIGE.md** -- Abos, CRM, Tracking, Dateien, etc.
- **SPEZIAL-APIS.md** -- Shop-Import, OpenTRANS, Mobile API

---

## Bekannte Einschraenkungen

| Problem | Ursache | Workaround |
|---------|---------|------------|
| `BelegEdit` (alle Typen) crasht mit 500 | Server-Bug in OpenXE v1.12 | Edit-Tools angelegt, funktionieren auf neueren Versionen |
| Lieferadressen REST v1 komplett 500 | PHP 8.x Signatur-Bug ([#249](https://github.com/OpenXE-org/OpenXE/issues/249)) | Legacy-API-Fallback fuer Create/Edit |
| Bestellungen nicht via REST v1 | Kein Endpoint registriert | Automatischer Legacy-API-Fallback |
| Einkaufspreise nicht via REST v1 | Include nicht registriert ([#252](https://github.com/OpenXE-org/OpenXE/issues/252)) | Legacy ArtikelGet als Fallback |
| Gruppen nicht via API nutzbar | REST v1 404, Legacy XML-Bug | Issue geplant |
| Mobile Dashboard API (16 KPIs) | Permission fehlt in UI ([#254](https://github.com/OpenXE-org/OpenXE/issues/254)) | Eigene Dashboard-KPIs als Ersatz |
| Report-Templates nicht via API erstellbar | Kein POST /v1/reports Endpoint ([#254](https://github.com/OpenXE-org/OpenXE/issues/254)) | JSON-Template lokal generieren, in UI importieren |
| Protokoll fehlt bei API-Weiterfuehren | [#244](https://github.com/OpenXE-org/OpenXE/issues/244) | -- |
| Datei-Upload ignoriert stichwoerter | [#245](https://github.com/OpenXE-org/OpenXE/issues/245), PR [#246](https://github.com/OpenXE-org/OpenXE/pull/246) | -- |
| Tracking in falscher Tabelle | [#247](https://github.com/OpenXE-org/OpenXE/issues/247), PR [#248](https://github.com/OpenXE-org/OpenXE/pull/248) | -- |

## Lizenz

MIT -- siehe [LICENSE](LICENSE).
