# OpenXE MCP Server

Verbinde dein [OpenXE ERP](https://openxe.de/) mit deinem KI-Assistenten -- per [MCP (Model Context Protocol)](https://modelcontextprotocol.io/).

> **37+ Tools** zum Erstellen und Bearbeiten von ERP-Daten | **19 Resources** zum Lesen von Artikeln, Auftraegen, Rechnungen, Lagerbestaenden u.v.m. | **Verifiziert** gegen eine live OpenXE v1.12 Instanz

## Was ist das?

Dieser MCP-Server macht dein OpenXE ERP fuer jeden MCP-faehigen KI-Assistenten zugaenglich -- ob Claude, ChatGPT, Ollama, LM Studio oder andere. Dein KI-Assistent versteht deine Anfrage, waehlt automatisch die passenden Tools und fuehrt sie gegen deine OpenXE-Instanz aus.

## Schnellstart (ein Befehl)

Fuer **Claude Code**:
```bash
claude mcp add -s user \
  -e OPENXE_URL=http://dein-openxe-server \
  -e OPENXE_USERNAME=dein-api-user \
  -e OPENXE_PASSWORD=dein-api-passwort \
  openxe -- npx -y github:Avatarsia/openxe-mcp-server
```

Fuer **Claude Desktop** (in die Config-Datei einfuegen):
```json
{
  "mcpServers": {
    "openxe": {
      "command": "npx",
      "args": ["-y", "github:Avatarsia/openxe-mcp-server"],
      "env": {
        "OPENXE_URL": "http://dein-openxe-server",
        "OPENXE_USERNAME": "dein-api-user",
        "OPENXE_PASSWORD": "dein-api-passwort"
      }
    }
  }
}
```

Fuer **andere MCP-Clients** (OpenWebUI, LM Studio, etc.):
```bash
npx -y github:Avatarsia/openxe-mcp-server
```
Mit Umgebungsvariablen `OPENXE_URL`, `OPENXE_USERNAME`, `OPENXE_PASSWORD`.

## Voraussetzungen

- Node.js >= 20
- Eine OpenXE-Instanz mit aktiviertem API-Zugang

## API-Benutzer in OpenXE anlegen

Bevor du loslegst, brauchst du einen API-Benutzer in OpenXE:

1. Melde dich als Admin in OpenXE an
2. Gehe zu **Administration > Einstellungen > Benutzer**
3. Erstelle einen neuen Benutzer (oder verwende einen bestehenden)
4. Setze unter **API > REST-API** ein Passwort
5. Merke dir Benutzername und Passwort -- die brauchst du fuer die Konfiguration

## Einrichtung

### Claude Code

```bash
claude mcp add -s user \
  -e OPENXE_URL=http://dein-openxe-server \
  -e OPENXE_USERNAME=dein-api-user \
  -e OPENXE_PASSWORD=dein-api-passwort \
  openxe -- npx -y github:Avatarsia/openxe-mcp-server
```

### Claude Desktop

Fuege folgendes in deine Claude Desktop Config ein (meist unter `~/.config/claude/claude_desktop_config.json` bzw. `%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "openxe": {
      "command": "npx",
      "args": ["-y", "github:Avatarsia/openxe-mcp-server"],
      "env": {
        "OPENXE_URL": "http://dein-openxe-server",
        "OPENXE_USERNAME": "dein-api-user",
        "OPENXE_PASSWORD": "dein-api-passwort"
      }
    }
  }
}
```

### OpenWebUI + Ollama

OpenWebUI unterstuetzt MCP-Server ab Version 0.6+. Trage den Server unter **Admin > Tools > MCP Servers** ein:

- **Command:** `npx`
- **Args:** `-y github:Avatarsia/openxe-mcp-server`
- **Umgebungsvariablen:** `OPENXE_URL`, `OPENXE_USERNAME`, `OPENXE_PASSWORD`

### LM Studio

LM Studio unterstuetzt MCP ab Version 0.3+. Konfiguration unter **Settings > MCP**:

```json
{
  "openxe": {
    "command": "npx",
    "args": ["-y", "github:Avatarsia/openxe-mcp-server"],
    "env": {
      "OPENXE_URL": "http://dein-openxe-server",
      "OPENXE_USERNAME": "dein-api-user",
      "OPENXE_PASSWORD": "dein-api-passwort"
    }
  }
}
```

### Andere MCP-Clients

Jeder MCP-Client, der stdio-Transport unterstuetzt, kann diesen Server nutzen. Starte ihn mit:

```bash
OPENXE_URL=http://dein-openxe-server \
OPENXE_USERNAME=dein-api-user \
OPENXE_PASSWORD=dein-api-passwort \
npx -y github:Avatarsia/openxe-mcp-server
```

### Direkte Nutzung als TypeScript-Library

Falls du den Server lokal klonen und anpassen moechtest:

```bash
git clone https://github.com/Avatarsia/openxe-mcp-server.git
cd openxe-mcp-server
npm install
npm run build
npm start
```

## Konfiguration

Der Server liest seine Konfiguration aus Umgebungsvariablen:

| Variable | Pflicht | Default | Beschreibung |
|---|---|---|---|
| `OPENXE_URL` | Ja | - | Basis-URL der OpenXE-Instanz (z.B. `http://192.168.0.143`) |
| `OPENXE_USERNAME` | Ja | - | API-Benutzername |
| `OPENXE_PASSWORD` | Ja | - | API-Passwort |
| `OPENXE_API_PATH` | Nein | `/api/index.php` | API-Endpunkt-Pfad |
| `OPENXE_TIMEOUT` | Nein | `30000` | Request-Timeout in ms |

## Erste Schritte

Sobald der Server laeuft, kannst du deinen KI-Assistenten direkt auf Deutsch ansprechen:

- *"Zeig mir alle offenen Auftraege"*
- *"Wie viele Artikel haben wir auf Lager?"*
- *"Erstelle einen neuen Kunden: Firma Muster GmbH, Musterstr. 1, 12345 Berlin"*
- *"Was wurde letzte Woche fakturiert?"*

Dein KI-Assistent waehlt automatisch die passenden Tools und Resources aus.

## Verfuegbare Funktionen

### Resources (Lesen)

| Resource | Beschreibung |
|---|---|
| Artikel | Artikelstammdaten, Preise, Lagerbestaende |
| Adressen | Kunden, Lieferanten, Kontakte |
| Auftraege | Auftragskoepfe und -positionen |
| Rechnungen | Rechnungskoepfe und -positionen |
| Lieferscheine | Lieferscheinkoepfe und -positionen |
| Gutschriften | Gutschriftskoepfe und -positionen |
| Angebote | Angebotskoepfe und -positionen |
| Bestellungen | Bestellkoepfe und -positionen |
| Produktion | Stuecklisten |
| Lager | Lagerbestaende, Lagerorte |
| Tracking | Sendungsverfolgung |

### Tools (Schreiben)

| Tool | Beschreibung |
|---|---|
| Belege erstellen | Auftraege, Rechnungen, Lieferscheine, Gutschriften, Angebote, Bestellungen |
| Belege bearbeiten | Positionen hinzufuegen, Status aendern |
| Adressen | Kunden/Lieferanten anlegen und bearbeiten |
| Artikel | Artikelstammdaten bearbeiten |
| Abos | Wiederkehrende Auftraege verwalten |
| Zeiterfassung | Stechuhr (kommen/gehen/Pause), Zeiteintraege CRUD, Wochen-Uebersicht |

## Haeufige Probleme

### Dein KI-Assistent kann nicht auf OpenXE zugreifen

- Pruefe ob die OpenXE-URL erreichbar ist (`curl http://dein-openxe-server/api/index.php`)
- Pruefe ob der API-Benutzer korrekt eingerichtet ist
- Pruefe ob die Umgebungsvariablen gesetzt sind

### Authentifizierung schlaegt fehl

- OpenXE nutzt HTTP Digest Auth -- stelle sicher, dass der Benutzer unter **API > REST-API** ein Passwort hat
- Benutzername und Passwort duerfen keine Sonderzeichen enthalten, die Probleme mit Umgebungsvariablen verursachen

### Timeout bei grossen Abfragen

- Erhoehe `OPENXE_TIMEOUT` (Default: 30000ms)
- Verwende spezifischere Abfragen statt "zeig mir alles"

## Wichtige Hinweise

- **Backup:** Erstelle immer ein Backup, bevor du Schreiboperationen auf Produktivsystemen ausfuehrst
- **Testinstanz:** Teste neue Workflows zuerst auf einer Testinstanz
- **API-Berechtigungen:** Der API-Benutzer hat vollen Zugriff -- schraenke ihn bei Bedarf ein
- **Keine Loesch-Operationen:** Der Server unterstuetzt bewusst keine Loesch-Operationen, um versehentlichen Datenverlust zu vermeiden
- **Datei-Upload braucht x-www-form-urlencoded:** Der Endpoint POST /v1/dateien akzeptiert kein JSON. Felder: dateiname, titel, file_content (base64-encoded). Download via /v1/dateien/{id}/base64 oder /download.
- **Tracking braucht verknuepften Lieferschein:** Der Lieferschein muss mit einem Auftrag verknuepft sein, sonst Fehler "Order not found". Pflichtfelder: tracking, lieferschein (Belegnummer als String, nicht ID), gewicht, anzahlpakete, versendet_am (YYYY-MM-DD).

## Projektstruktur

```
src/
  index.ts          # MCP-Server Einstiegspunkt
  config.ts         # Umgebungsvariablen-Parsing (Zod)
  client/           # HTTP Digest Auth Client fuer OpenXE
  tools/            # MCP Tool Handler (Schreiben via Legacy API)
  resources/        # MCP Resource Handler (Lesen via REST v1)
  schemas/          # Zod-Schemas fuer Request-Validierung
tests/
  client/           # HTTP-Client Unit-Tests
  tools/            # Tool-Handler Tests
  resources/        # Resource-Handler Tests
  integration/      # Integration-Test Stubs
docs/
  api-reference/    # Verifizierte OpenXE API-Dokumentation
  llm/              # LLM-optimierte API-Referenz
```

## API-Dokumentation

Das Verzeichnis `docs/api-reference/` enthaelt verifizierte API-Dokumentation:

- **AUTH.md** -- HTTP Digest Authentifizierung
- **LEGACY-API.md** -- Legacy Write API (genutzt von Tools)
- **REST-V1-STAMMDATEN.md** -- Stammdaten-Endpunkte
- **REST-V1-BELEGE.md** -- Beleg-Endpunkte (Auftraege, Rechnungen, etc.)
- **REST-V1-SONSTIGE.md** -- Sonstige REST-Endpunkte
- **SPEZIAL-APIS.md** -- Spezial-API-Endpunkte

Alle Dokumente wurden gegen eine live OpenXE v1.12 Instanz verifiziert.

## Lizenz

MIT -- siehe [LICENSE](LICENSE).
