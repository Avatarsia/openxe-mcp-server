# OpenXE MCP Server

## Stack
- TypeScript, Node.js, MCP SDK
- Zod fuer Config-Validierung
- Vitest fuer Tests (565 passed, 17 skipped)
- Git: github.com/Avatarsia/openxe-mcp-server, Branch `master`

## Konfiguration
- `.env` Datei im Projektroot (via dotenv, automatisch geladen)
- Env-Variablen ueberschreiben .env
- `.env` ist in .gitignore — NIE committen
- `OPENXE_API_PATH` optional: unset = Auto-Detection (probiert `/api/index.php`, `/www/api/index.php`, `/api`; eager beim Start + lazy beim 1. Request; Self-Healing bei Apache-HTML-403/404 mit genau einem Retry). Explizit gesetzt = Detection + Self-Healing aus. Leerer Wert = unset
- Produktionsserver: `http://10.20.0.40` (Repo-Root-Layout, API unter `/www/api/index.php`)

## Architektur
- Dual API: REST v1 (Reads) + Legacy API (Writes)
- 3 Modi: `router` (2 kompakte Tools), `full` (69 Tools), `readonly`
- `router` ist Standard — ideal fuer lokale LLMs mit begrenztem Context

## Entwicklung
- `npm run build` nach jeder Aenderung an src/
- `npx vitest run` fuer Tests
- `npm start` zum Starten (liest .env automatisch)

## Beleg-Erstellung (Robustheit — create-order/quote/invoice/credit-note)
- **Input-Coercion**: `adresse`, `menge`, `preis` und Beleg-IDs sind `z.coerce.number()` — String-Eingaben (`"2773"`, `"28.00"`) werden akzeptiert und gecastet. Lokale LLMs schicken Zahlen oft als String.
- **`where`-Kurzform**: `{feld: "wert"}` wird zu `{feld: {equals: "wert"}}` normalisiert (read-tools + document-read-tools).
- **Idempotenz-Guard**: identischer create-Aufruf (Key aus adresse+kundennummer+artikelliste) innerhalb 120s gibt den Cache-Treffer zurueck, KEIN zweiter Beleg. Reset via `resetIdempotencyCache()` (Tests).
- **Post-Error-Verify (OpenXE Issue #18)**: OpenXE 7499 ist ein False Negative — der Beleg wird VOR dem Fehler persistiert (keine Transaktion). Nach jedem `OpenXEApiError` auf create wird verifiziert (`GET /v1/belege/{path}` nach kundennummer + 5-Min-Fenster) und ein definitives Outcome zurueckgegeben (created/none/unknown) — NIE ein plain-retryable Fehler. Verhindert die Duplikat-Kaskade.
- Server-Fix (Transaktion + Trace-Log) ist als OpenXE-Issue #18 dokumentiert, NICHT im MCP behebbar.

## Wichtige Regeln
- Keine Credentials in Code oder Skill-Dateien hardcoden
- `.env.example` aktuell halten wenn neue Env-Vars dazukommen
- HTTP Digest Auth — kein Bearer/API-Key Support in OpenXE
- Alle Tool-Aenderungen muessen Tests haben
