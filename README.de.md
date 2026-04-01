# OpenXE MCP Server -- Installationsanleitung (Deutsch)

> Verbinde dein OpenXE ERP-System mit Claude (KI-Assistent), sodass du per Chat Kunden anlegen, Auftraege erstellen, Rechnungen schreiben und Lagerbestaende pruefen kannst.

---

## Inhaltsverzeichnis

1. [Was ist das?](#was-ist-das)
2. [Voraussetzungen](#voraussetzungen)
3. [API-Benutzer in OpenXE anlegen](#api-benutzer-in-openxe-anlegen)
4. [Installation](#installation)
5. [Konfiguration](#konfiguration)
6. [Einrichtung in Claude Desktop](#einrichtung-in-claude-desktop)
7. [Einrichtung in Claude Code](#einrichtung-in-claude-code)
8. [Erste Schritte](#erste-schritte)
9. [Verfuegbare Funktionen](#verfuegbare-funktionen)
10. [Haeufige Probleme](#haeufige-probleme)
11. [Wichtige Hinweise](#wichtige-hinweise)

---

## Was ist das?

Dieses Programm ist eine **Bruecke** zwischen deinem OpenXE ERP-System (Warenwirtschaft) und Claude, dem KI-Assistenten von Anthropic.

**Was bedeutet das konkret?** Du kannst Claude in natuerlicher Sprache bitten, Dinge in deinem ERP zu tun -- zum Beispiel:

- "Zeig mir alle offenen Auftraege von Kunde Mueller"
- "Leg einen neuen Kunden an: Max Mustermann, Musterstrasse 1, 12345 Berlin"
- "Erstell eine Rechnung fuer Auftrag 10042"
- "Wie viel Filament haben wir noch auf Lager?"

Claude versteht deine Anfrage, greift ueber diesen MCP-Server auf OpenXE zu und fuehrt die Aktion aus -- oder zeigt dir die gewuenschten Daten an.

**MCP** steht fuer "Model Context Protocol". Das ist ein Standard, ueber den KI-Assistenten wie Claude auf externe Systeme zugreifen koennen. Du musst die technischen Details nicht verstehen -- folge einfach dieser Anleitung.

---

## Voraussetzungen

Bevor du loslegst, brauchst du drei Dinge:

### 1. Node.js (Version 20 oder neuer)

**Was ist Node.js?** Eine Laufzeitumgebung, die JavaScript-Programme ausfuehren kann. Unser MCP-Server ist in JavaScript/TypeScript geschrieben und braucht Node.js zum Laufen.

**So pruefst du, ob Node.js installiert ist:**

```bash
node --version
```

Wenn eine Versionsnummer wie `v20.x.x` oder hoeher erscheint, bist du startklar. Falls nicht, lade Node.js von [nodejs.org](https://nodejs.org/) herunter und installiere die LTS-Version (= Langzeitversion, empfohlen).

### 2. OpenXE ERP-System

Du brauchst ein laufendes OpenXE (mindestens Version 1.12) mit Netzwerkzugang. Du musst die **URL** deiner OpenXE-Installation kennen, z.B. `http://192.168.0.143` oder `https://erp.deinefirma.de`.

### 3. Claude Desktop oder Claude Code

- **Claude Desktop**: Die Desktop-App von Anthropic. Download unter [claude.ai/download](https://claude.ai/download). Du brauchst ein Claude Pro- oder Team-Abo.
- **Claude Code**: Die Kommandozeilen-Version von Claude fuer Entwickler. Installation: `npm install -g @anthropic-ai/claude-code`

Du brauchst mindestens eines von beiden.

---

## API-Benutzer in OpenXE anlegen

Damit Claude auf dein ERP zugreifen kann, brauchst du einen speziellen API-Benutzer in OpenXE. Dieser Benutzer ist **kein normaler Login** -- er wird nur fuer die Programm-Schnittstelle (API) verwendet.

### Schritt fuer Schritt:

1. **Melde dich in OpenXE an** als Administrator
2. **Navigiere zu:** Administration > Einstellungen > API-Accounts
3. **Klicke auf "Neuer API-Account"**
4. **Fuelle die Felder aus:**
   - **Remotedomain** (= Benutzername): Waehle einen Namen, z.B. `claude_api`
   - **Initkey** (= Passwort): Vergib ein sicheres Passwort, z.B. `MeinSicheresPasswort123!`
   - **Aktiv**: Ja / Haekchen setzen
5. **Berechtigungen setzen**: Unter `permissions` muessen die gewuenschten Rechte als JSON-Array stehen. Fuer vollen Zugriff:
   ```json
   ["*"]
   ```
   Oder fuer eingeschraenkten Zugriff eine Liste wie:
   ```json
   ["list_addresses", "create_order", "view_article", "list_orders"]
   ```
6. **Speichern**

> **Tipp:** Notiere dir Remotedomain und Initkey -- du brauchst beides gleich bei der Konfiguration.

---

## Installation

### Schritt 1: Quellcode herunterladen

**Was passiert hier?** Du laedst den Programmcode von GitHub (einer Plattform fuer Softwareprojekte) auf deinen Computer herunter.

Oeffne ein Terminal (Windows: PowerShell oder Git Bash, Mac: Terminal, Linux: Terminal) und fuehre aus:

```bash
git clone https://github.com/3DPartner/openxe-mcp-server.git
```

> **`git clone`** = Lade eine Kopie des Projekts von GitHub herunter. Falls du `git` nicht installiert hast, kannst du es von [git-scm.com](https://git-scm.com/) herunterladen. Alternativ kannst du das Projekt auch als ZIP von GitHub herunterladen und entpacken.

### Schritt 2: In das Projektverzeichnis wechseln

```bash
cd openxe-mcp-server
```

> **`cd`** = "change directory" = Wechsle in den angegebenen Ordner.

### Schritt 3: Abhaengigkeiten installieren

```bash
npm install
```

> **`npm install`** = Lade alle Programmbibliotheken herunter, die der MCP-Server zum Funktionieren braucht. `npm` ist der Paketmanager von Node.js und wird automatisch mit Node.js installiert. Dieser Schritt kann 1-2 Minuten dauern.

### Schritt 4: Programm kompilieren

```bash
npm run build
```

> **`npm run build`** = Wandle den TypeScript-Quellcode in ausfuehrbares JavaScript um. TypeScript ist eine Programmiersprache, die erst "uebersetzt" werden muss.

### Schritt 5: Pruefen ob alles funktioniert (optional)

```bash
npm test
```

> **`npm test`** = Fuehre die eingebauten Tests aus. Wenn alles gruen ist bzw. "passed" steht, ist die Installation erfolgreich. Falls Tests fehlschlagen, die sich auf eine Netzwerkverbindung beziehen, ist das normal -- die brauchen eine laufende OpenXE-Instanz.

---

## Konfiguration

Der MCP-Server braucht 4 Informationen, um sich mit deinem OpenXE zu verbinden. Diese werden als **Umgebungsvariablen** (= Einstellungen, die Programme aus der Systemumgebung lesen) uebergeben:

| Variable | Pflicht? | Beschreibung | Beispiel |
|---|---|---|---|
| `OPENXE_URL` | Ja | Die Web-Adresse deines OpenXE | `http://192.168.0.143` |
| `OPENXE_USERNAME` | Ja | Der API-Benutzername (Remotedomain) | `claude_api` |
| `OPENXE_PASSWORD` | Ja | Das API-Passwort (Initkey) | `MeinSicheresPasswort123!` |
| `OPENXE_API_PATH` | Nein | API-Pfad (nur aendern falls noetig) | `/api/index.php` (Standard) |

> **Wichtig:** Ersetze die Beispielwerte durch deine echten Daten!

---

## Einrichtung in Claude Desktop

### Schritt 1: Konfigurationsdatei finden

Die Konfigurationsdatei von Claude Desktop liegt hier:

- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
  - Das ist meistens: `C:\Users\DEIN_NAME\AppData\Roaming\Claude\claude_desktop_config.json`
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`

Falls die Datei noch nicht existiert, erstelle sie einfach.

### Schritt 2: Konfiguration eintragen

Oeffne die Datei mit einem Texteditor (z.B. Notepad, VS Code) und trage folgendes ein. **Ersetze die Pfade und Zugangsdaten durch deine eigenen!**

```json
{
  "mcpServers": {
    "openxe": {
      "command": "npx",
      "args": ["tsx", "C:/Pfad/zu/openxe-mcp-server/src/index.ts"],
      "env": {
        "OPENXE_URL": "http://192.168.0.143",
        "OPENXE_USERNAME": "claude_api",
        "OPENXE_PASSWORD": "MeinSicheresPasswort123!"
      }
    }
  }
}
```

**Was bedeuten die einzelnen Zeilen?**

- `"command": "npx"` -- Das Programm, das den Server startet (npx ist ein Node.js-Werkzeug)
- `"args": ["tsx", "...index.ts"]` -- Die Datei, die ausgefuehrt werden soll. **Aendere den Pfad** auf den Ort, wo du das Projekt gespeichert hast!
- `"env"` -- Die Umgebungsvariablen mit deinen OpenXE-Zugangsdaten

> **Tipp fuer Windows:** Verwende in JSON-Dateien Schraegstriche `/` statt Backslashes `\` in Pfaden, also z.B. `C:/Users/Max/openxe-mcp-server/src/index.ts`

### Schritt 3: Claude Desktop neu starten

Schliesse Claude Desktop komplett (auch aus dem System-Tray) und starte es neu. Der MCP-Server wird beim Start automatisch geladen.

### Schritt 4: Pruefen ob es funktioniert

In Claude Desktop solltest du jetzt ein Werkzeug-Symbol (Hammer-Icon) sehen. Klicke darauf -- dort sollten die OpenXE-Tools aufgelistet sein. Schreibe als Test:

> "Zeig mir die ersten 5 Adressen aus OpenXE"

Wenn Daten erscheinen, funktioniert alles!

---

## Einrichtung in Claude Code

### Schritt 1: MCP-Server hinzufuegen

Oeffne ein Terminal und fuehre aus:

```bash
claude mcp add openxe -- npx tsx /Pfad/zu/openxe-mcp-server/src/index.ts
```

> Ersetze `/Pfad/zu/` durch den tatsaechlichen Pfad, z.B. `C:/Users/Max/openxe-mcp-server/src/index.ts`

### Schritt 2: Umgebungsvariablen setzen

Bevor du Claude Code startest, musst du die Zugangsdaten in deinem Terminal setzen:

**Linux/macOS:**
```bash
export OPENXE_URL="http://192.168.0.143"
export OPENXE_USERNAME="claude_api"
export OPENXE_PASSWORD="MeinSicheresPasswort123!"
```

**Windows (PowerShell):**
```powershell
$env:OPENXE_URL = "http://192.168.0.143"
$env:OPENXE_USERNAME = "claude_api"
$env:OPENXE_PASSWORD = "MeinSicheresPasswort123!"
```

**Windows (Git Bash / CMD):**
```bash
set OPENXE_URL=http://192.168.0.143
set OPENXE_USERNAME=claude_api
set OPENXE_PASSWORD=MeinSicheresPasswort123!
```

> **Tipp:** Trage diese Zeilen in deine Shell-Konfiguration ein (z.B. `~/.bashrc` oder `~/.zshrc`), damit sie bei jedem Terminalstart automatisch gesetzt werden.

### Schritt 3: Claude Code starten

```bash
claude
```

Jetzt kannst du direkt loslegen und mit OpenXE arbeiten!

---

## Erste Schritte

Hier sind ein paar Beispiel-Anfragen, die du an Claude stellen kannst:

### Kunden & Adressen
- "Zeig mir alle Kunden aus Deutschland"
- "Suche den Kunden mit der Kundennummer K10001"
- "Leg einen neuen Kunden an: Firma Beispiel GmbH, Musterweg 5, 80331 Muenchen"
- "Aendere die E-Mail-Adresse von Kunde 42 auf info@beispiel.de"

### Artikel & Lager
- "Welche Artikel haben wir im Sortiment?"
- "Zeig mir Artikel 15 mit Preisen und Lagerbestand"
- "Wie viel PLA-Filament ist noch auf Lager?"

### Auftraege & Rechnungen
- "Erstelle einen Auftrag fuer Kunde K10001 ueber 5x Artikel A1001 zu je 29,90 EUR"
- "Zeig mir alle offenen Auftraege"
- "Wandle Auftrag 1234 in eine Rechnung um"
- "Erstelle einen Lieferschein fuer Auftrag 1234"
- "Markiere Rechnung 5678 als bezahlt"

### Sonstiges
- "Zeig mir die letzten 10 Angebote"
- "Erstelle eine Trackingnummer DHL123456 fuer Lieferschein 42"
- "Welche Versandarten gibt es?"

---

## Verfuegbare Funktionen

### Daten lesen (Resources)

| Funktion | Beschreibung |
|----------|-------------|
| Adressen/Kunden | Alle Adressen auflisten oder einzelne per ID abrufen |
| Lieferadressen | Lieferadressen zu einem Kunden anzeigen |
| Artikel | Artikel mit Preisen, Lagerbestand und Dateien |
| Artikelkategorien | Kategorien/Warengruppen auflisten |
| Gruppen | Adress- und Artikelgruppen |
| Steuersaetze | Verfuegbare Steuersaetze |
| Zahlungsweisen | Zahlungsmethoden auflisten |
| Versandarten | Versandoptionen anzeigen |
| Laender | Laenderliste mit ISO-Codes |
| Eigenschaften | Artikeleigenschaften |
| Angebote | Angebote mit Positionen und Protokoll |
| Auftraege | Auftraege mit Positionen und Protokoll |
| Rechnungen | Rechnungen mit Positionen und Protokoll |
| Lieferscheine | Lieferscheine mit Positionen und Protokoll |
| Gutschriften | Gutschriften mit Positionen und Protokoll |
| Lagerchargen | Lagerbestaende nach Chargen |
| Lager-MHD | Lagerbestaende nach Mindesthaltbarkeit |
| Trackingnummern | Sendungsverfolgungsnummern |
| Abo-Artikel | Wiederkehrende Bestellungen |
| CRM-Dokumente | Notizen, E-Mails, Telefonprotokolle |
| Wiedervorlagen | Erinnerungen und Aufgaben |
| Dateien | Hochgeladene Dateien und Dokumente |

### Daten schreiben (Tools)

| Funktion | Beschreibung |
|----------|-------------|
| Adresse erstellen | Neuen Kunden oder Lieferanten anlegen |
| Adresse bearbeiten | Bestehende Adresse aendern |
| Lieferadresse erstellen | Lieferadresse zu einem Kunden hinzufuegen |
| Lieferadresse bearbeiten | Lieferadresse aendern |
| Lieferadresse loeschen | Lieferadresse entfernen |
| Auftrag erstellen | Neuen Auftrag anlegen |
| Angebot erstellen | Neues Angebot erstellen |
| Rechnung erstellen | Neue Rechnung erstellen |
| Lieferschein erstellen | Neuen Lieferschein erstellen |
| Gutschrift erstellen | Neue Gutschrift erstellen |
| Auftrag freigeben | Auftrag zur Bearbeitung freigeben |
| Rechnung freigeben | Rechnung finalisieren |
| Angebot in Auftrag | Angebot in einen Auftrag umwandeln |
| Auftrag in Rechnung | Auftrag in Rechnung umwandeln (erstellt auch Lieferschein) |
| PDF abrufen | PDF eines Belegs herunterladen |
| Rechnung als bezahlt markieren | Zahlungseingang verbuchen |
| Entwurfsrechnung loeschen | Noch nicht freigegebene Rechnung loeschen |
| Trackingnummer erstellen | Sendungsverfolgung hinzufuegen |
| CRM-Dokument erstellen | Notiz, E-Mail oder Telefonprotokoll anlegen |
| Abo-Artikel erstellen | Wiederkehrende Bestellung einrichten |
| Wiedervorlage erstellen | Erinnerung/Aufgabe anlegen |
| Datei hochladen | Datei an einen Datensatz anhaengen |

---

## Haeufige Probleme

### "Connection refused" oder "ECONNREFUSED"

**Ursache:** Claude kann dein OpenXE nicht erreichen.

**Loesungen:**
- Pruefe ob die URL in `OPENXE_URL` korrekt ist
- Pruefe ob OpenXE laeuft (oeffne die URL im Browser)
- Wenn OpenXE auf einem anderen Rechner laeuft: Ist der Port (meist 80 oder 443) in der Firewall freigegeben?

### "401 Unauthorized" oder "Authentication failed"

**Ursache:** Die Zugangsdaten stimmen nicht.

**Loesungen:**
- Pruefe `OPENXE_USERNAME` und `OPENXE_PASSWORD`
- Der Benutzername ist die **Remotedomain** aus dem API-Account, nicht dein Login-Name
- Das Passwort ist der **Initkey**, nicht dein Login-Passwort
- Ist der API-Account auf "Aktiv" gesetzt?

### "403 Forbidden" oder "Permission denied"

**Ursache:** Der API-Benutzer hat nicht genuegend Rechte.

**Loesung:** Pruefe die Berechtigungen des API-Accounts in OpenXE. Fuer vollen Zugriff setze `["*"]` als Permissions.

### Claude zeigt keine OpenXE-Tools an

**Loesungen:**
- Hast du Claude Desktop nach der Konfigurationsaenderung komplett neu gestartet?
- Ist die JSON-Datei syntaktisch korrekt? (Kein Komma am Ende, alle Klammern geschlossen)
- Stimmt der Pfad zur `index.ts`-Datei?
- Fuehre im Projektordner `npm run build` aus -- wurde erfolgreich kompiliert?

### "OPENXE_URL is required" oder aehnliche Fehlermeldung

**Ursache:** Die Umgebungsvariablen sind nicht gesetzt.

**Loesungen:**
- Bei Claude Desktop: Stehen die Variablen im `"env"`-Block der Konfiguration?
- Bei Claude Code: Hast du die `export`-Befehle im selben Terminal ausgefuehrt, in dem du `claude` startest?

### Timeout-Fehler

**Ursache:** OpenXE antwortet zu langsam.

**Loesung:** Du kannst das Timeout erhoehen, indem du `OPENXE_TIMEOUT` auf einen hoeheren Wert setzt (z.B. `60000` fuer 60 Sekunden). Standard sind 30 Sekunden.

### Positionen im PDF haben falsche Schriftgroesse

**Ursache:** Du hast `bezeichnung` in den Auftragspositionen mitgeschickt.

**Loesung:** Schicke in den Positionen nur `nummer`, `menge` und `preis` -- die Bezeichnung wird automatisch aus den Artikelstammdaten uebernommen.

---

## Wichtige Hinweise

### Sicherheit

- **Teile deine API-Zugangsdaten niemals oeffentlich** (z.B. nicht in Git-Repositories, nicht in Chatverlaeufen)
- Der API-Benutzer hat **direkten Zugriff auf dein ERP** -- verwende im Zweifelsfall eingeschraenkte Berechtigungen
- Wenn du den Server nicht mehr brauchst, **deaktiviere den API-Account** in OpenXE

### Datenintegritaet

- Claude kann **echte Daten in deinem ERP aendern** -- teste neue Ablaeufe zuerst mit unwichtigen Testdaten
- **Freigegebene Rechnungen koennen nicht geloescht werden** -- nur Entwuerfe (ohne Belegnummer) lassen sich entfernen
- Bei der Kundennummer immer `NEU` setzen lassen, damit das System eine eindeutige Nummer vergibt

### Technische Details

- Der Server kommuniziert ueber **HTTP Digest Authentication** mit OpenXE
- **Lesezugriffe** (Daten anzeigen) nutzen die REST v1 API
- **Schreibzugriffe** (Daten anlegen/aendern) nutzen die Legacy API (weil REST v1 POST/PUT bei einigen Endpunkten fehlerhaft ist)
- Die Positionsliste bei Auftraegen hat ein spezielles Format: `{artikelliste: {position: [{nummer, menge, preis}]}}`

### Updates

Um den MCP-Server zu aktualisieren:

```bash
cd openxe-mcp-server
git pull
npm install
npm run build
```

Danach Claude Desktop neu starten.

---

## Hilfe & Support

- **GitHub Issues:** Erstelle ein Issue im [GitHub-Repository](https://github.com/3DPartner/openxe-mcp-server/issues)
- **OpenXE Dokumentation:** [openxe.de](https://openxe.de)
- **MCP Protokoll:** [modelcontextprotocol.io](https://modelcontextprotocol.io)

---

*Diese Anleitung wurde fuer OpenXE v1.12 und den OpenXE MCP Server erstellt.*
