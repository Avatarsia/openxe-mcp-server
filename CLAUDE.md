# OpenXE MCP Server

## Stack
- TypeScript, Node.js, MCP SDK
- Zod fuer Config-Validierung
- Vitest fuer Tests (416 passed, 17 skipped)
- Git: github.com/Avatarsia/openxe-mcp-server, Branch `master`

## Konfiguration
- `.env` Datei im Projektroot (via dotenv, automatisch geladen)
- Env-Variablen ueberschreiben .env
- `.env` ist in .gitignore — NIE committen

## Architektur
- Dual API: REST v1 (Reads) + Legacy API (Writes)
- 3 Modi: `router` (2 kompakte Tools), `full` (69 Tools), `readonly`
- `router` ist Standard — ideal fuer lokale LLMs mit begrenztem Context

## Entwicklung
- `npm run build` nach jeder Aenderung an src/
- `npx vitest run` fuer Tests
- `npm start` zum Starten (liest .env automatisch)

## Wichtige Regeln
- Keine Credentials in Code oder Skill-Dateien hardcoden
- `.env.example` aktuell halten wenn neue Env-Vars dazukommen
- HTTP Digest Auth — kein Bearer/API-Key Support in OpenXE
- Alle Tool-Aenderungen muessen Tests haben
