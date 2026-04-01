# OpenXE REST API v1 — Stammdaten (Master Data)

> **Status:** Verifiziert gegen Quellcode (Stand: 2026-03-31)
>
> Dieses Dokument beschreibt alle REST v1 Stammdaten-Ressourcen mit saemtlichen Filtern, Sortierungen, Feldern, Includes und Validierungsregeln. Abweichungen, Bugs und Einschraenkungen sind explizit dokumentiert.

---

## Inhaltsverzeichnis

1. [Allgemeines](#allgemeines)
2. [Adressen](#1-adressen)
3. [Lieferadressen](#2-lieferadressen)
4. [Adresstypen](#3-adresstypen)
5. [Artikel](#4-artikel)
6. [Artikelkategorien](#5-artikelkategorien)
7. [Gruppen](#6-gruppen)
8. [Eigenschaften](#7-eigenschaften)
9. [Eigenschaftenwerte](#8-eigenschaftenwerte)
10. [Steuersaetze](#9-steuersaetze)
11. [Zahlungsweisen](#10-zahlungsweisen)
12. [Versandarten](#11-versandarten)
13. [Laender](#12-laender)

---

## Allgemeines

### Basis-URL

```
https://<host>/api/v1/<resource>
```

### Authentifizierung

Alle Anfragen erfordern einen gueltigen API-Key als Bearer Token oder Query-Parameter (`api_key`).

### Paginierung (Listen)

| Parameter | Typ     | Beschreibung                                 | Standard |
|-----------|---------|----------------------------------------------|----------|
| `page`    | integer | Seitennummer (1-basiert)                     | 1        |
| `items`   | integer | Eintraege pro Seite                          | 20       |

Antwort-Header bei Listen: `X-Total-Count`, `X-Page`, `X-Items-Per-Page`.

### Filter-Syntax

Filter werden als Query-Parameter uebergeben:

```
GET /v1/adressen?name=Muster&land=DE&sort=name
```

**Filter-Operatoren (je nach Felddefinition):**

| Notation in Doku | SQL-Verhalten                          | Beispiel                          |
|------------------|----------------------------------------|-----------------------------------|
| `%LIKE%`         | `WHERE feld LIKE '%wert%'`             | `?name=Muster` findet "Die Musterfirma" |
| `LIKE`           | `WHERE feld LIKE 'wert'` (exakt)       | `?typ=kunde`                      |
| `=`              | `WHERE feld = 'wert'` (exakt)          | `?projekt=1`                      |
| `_equals`        | `WHERE feld = 'wert'` (exakt)          | `?name_equals=Mustermann`         |
| `_startswith`    | `WHERE feld LIKE 'wert%'`              | `?name_startswith=Mus`            |
| `_endswith`      | `WHERE feld LIKE '%wert'`              | `?name_endswith=mann`             |
| `_exakt`         | `WHERE feld = 'wert'` (exakt)          | `?bezeichnung_exakt=Standard`     |

### Sortierung

```
GET /v1/resource?sort=feldname          # aufsteigend (ASC)
GET /v1/resource?sort=feldname_desc     # absteigend (DESC)
```

### Includes

```
GET /v1/resource?include=relation1,relation2
```

### Standard-HTTP-Antwortcodes

| Code | Bedeutung                  |
|------|----------------------------|
| 200  | Erfolg (GET, PUT)          |
| 201  | Erstellt (POST)            |
| 204  | Geloescht (DELETE)         |
| 400  | Validierungsfehler         |
| 401  | Nicht authentifiziert       |
| 403  | Keine Berechtigung         |
| 404  | Nicht gefunden             |
| 422  | Verarbeitungsfehler        |

---

## 1. Adressen

**Endpunkt:** `/v1/adressen`

### Routen

| Methode | Pfad                | Berechtigung       | Status                |
|---------|---------------------|--------------------|-----------------------|
| GET     | `/v1/adressen`      | `list_addresses`   | Funktional            |
| GET     | `/v1/adressen/{id}` | `view_address`     | Funktional            |
| POST    | `/v1/adressen`      | `create_address`   | **NICHT FUNKTIONAL** |
| PUT     | `/v1/adressen/{id}` | `edit_address`     | **NICHT FUNKTIONAL** |
| DELETE  | —                   | —                  | Route existiert nicht |

> **WARNUNG:** Die POST- und PUT-Routen existieren im Code, aber `insertQuery` bzw. `updateQuery` geben `false` zurueck. Fuer Schreiboperationen muss die Legacy-API verwendet werden.

### Filter (47 Stueck)

| Parameter                     | Operator     | Beschreibung                              |
|-------------------------------|-------------|-------------------------------------------|
| `rolle`                       | `%LIKE%`    | Rolle der Adresse (Kunde, Lieferant etc.) |
| `projekt`                     | `=`         | Projekt-ID (exakt)                        |
| `firma`                       | `=`         | Firma-ID (exakt)                          |
| `typ`                         | `LIKE`      | Adresstyp                                 |
| `sprache`                     | `LIKE`      | Sprache                                   |
| `waehrung`                    | `LIKE`      | Waehrung                                  |
| `land`                        | `LIKE`      | Laendercode                               |
| `name`                        | `%LIKE%`    | Name (Teilstring)                         |
| `name_equals`                 | `=`         | Name (exakt)                              |
| `name_startswith`             | `LIKE x%`   | Name beginnt mit                          |
| `name_endswith`               | `LIKE %x`   | Name endet mit                            |
| `kundennummer`                | `%LIKE%`    | Kundennummer (Teilstring)                 |
| `kundennummer_equals`         | `=`         | Kundennummer (exakt)                      |
| `kundennummer_startswith`     | `LIKE x%`   | Kundennummer beginnt mit                  |
| `kundennummer_endswith`       | `LIKE %x`   | Kundennummer endet mit                    |
| `lieferantennummer`           | `%LIKE%`    | Lieferantennummer (Teilstring)            |
| `lieferantennummer_equals`    | `=`         | Lieferantennummer (exakt)                 |
| `lieferantennummer_startswith`| `LIKE x%`   | Lieferantennummer beginnt mit             |
| `lieferantennummer_endswith`  | `LIKE %x`   | Lieferantennummer endet mit               |
| `mitarbeiternummer`           | `%LIKE%`    | Mitarbeiternummer (Teilstring)            |
| `mitarbeiternummer_equals`    | `=`         | Mitarbeiternummer (exakt)                 |
| `mitarbeiternummer_startswith`| `LIKE x%`   | Mitarbeiternummer beginnt mit             |
| `mitarbeiternummer_endswith`  | `LIKE %x`   | Mitarbeiternummer endet mit               |
| `email`                       | `%LIKE%`    | E-Mail (Teilstring)                       |
| `email_equals`                | `=`         | E-Mail (exakt)                            |
| `email_startswith`            | `LIKE x%`   | E-Mail beginnt mit                        |
| `email_endswith`              | `LIKE %x`   | E-Mail endet mit                          |
| `freifeld1`                   | `%LIKE%`    | Freifeld 1 (Teilstring)                   |
| `freifeld2`                   | `%LIKE%`    | Freifeld 2 (Teilstring)                   |
| `freifeld3`                   | `%LIKE%`    | Freifeld 3 (Teilstring)                   |
| `freifeld4`                   | `%LIKE%`    | Freifeld 4 (Teilstring)                   |
| `freifeld5`                   | `%LIKE%`    | Freifeld 5 (Teilstring)                   |
| `freifeld6`                   | `%LIKE%`    | Freifeld 6 (Teilstring)                   |
| `freifeld7`                   | `%LIKE%`    | Freifeld 7 (Teilstring)                   |
| `freifeld8`                   | `%LIKE%`    | Freifeld 8 (Teilstring)                   |
| `freifeld9`                   | `%LIKE%`    | Freifeld 9 (Teilstring)                   |
| `freifeld10`                  | `%LIKE%`    | Freifeld 10 (Teilstring)                  |
| `freifeld1_equals`            | `=`         | Freifeld 1 (exakt)                        |
| `freifeld2_equals`            | `=`         | Freifeld 2 (exakt)                        |
| `freifeld3_equals`            | `=`         | Freifeld 3 (exakt)                        |
| `freifeld4_equals`            | `=`         | Freifeld 4 (exakt)                        |
| `freifeld5_equals` ... `freifeld10_equals` | `=` | Freifeld 5-10 (exakt)           |

### Sortierungen

| Parameter          | Beschreibung            |
|--------------------|-------------------------|
| `name`             | Nach Name               |
| `kundennummer`     | Nach Kundennummer       |
| `lieferantennummer`| Nach Lieferantennummer  |
| `mitarbeiternummer`| Nach Mitarbeiternummer  |

Jeweils mit `_desc`-Suffix fuer absteigende Sortierung.

### Felder (Auswahl der ~223 zurueckgegebenen Spalten)

| Feld              | Beschreibung                        |
|-------------------|-------------------------------------|
| `id`              | Primaerschluessel                   |
| `rolle`           | Rolle (Kunde, Lieferant, etc.)      |
| `typ`             | Adresstyp                           |
| `name`            | Vollstaendiger Name                 |
| `vorname`         | Vorname                             |
| `nachname`        | Nachname                            |
| `firma`           | Firmenname                          |
| `strasse`         | Strasse                             |
| `plz`             | Postleitzahl                        |
| `ort`             | Ort                                 |
| `land`            | Laendercode                         |
| `email`           | E-Mail-Adresse                      |
| `kundennummer`    | Kundennummer                        |
| `lieferantennummer` | Lieferantennummer                 |
| `mitarbeiternummer` | Mitarbeiternummer                 |
| `telefon`         | Telefonnummer                       |
| `telefax`         | Faxnummer                           |
| `waehrung`        | Waehrung                            |
| `sprache`         | Sprache                             |
| `projekt`         | Projekt-ID                          |
| `freifeld1`-`freifeld10` | Benutzerdefinierte Felder    |
| ...               | ~223 Spalten insgesamt              |

### Beispiele

```http
# Alle Kunden mit "GmbH" im Namen
GET /v1/adressen?rolle=kunde&name=GmbH&sort=name

# Exakte Kundennummer
GET /v1/adressen?kundennummer_equals=KD-10042

# Lieferanten in Deutschland, Seite 2
GET /v1/adressen?rolle=lieferant&land=DE&page=2&items=50
```

---

## 2. Lieferadressen

**Endpunkt:** `/v1/lieferadressen`

> Einzige Stammdaten-Ressource mit vollstaendigem CRUD **inklusive DELETE**.

### Routen

| Methode | Pfad                          | Berechtigung                  | Status      |
|---------|-------------------------------|-------------------------------|-------------|
| GET     | `/v1/lieferadressen`          | `list_delivery_addresses`       | Funktional  |
| GET     | `/v1/lieferadressen/{id}`     | `view_delivery_address`       | Funktional  |
| POST    | `/v1/lieferadressen`          | `create_delivery_address`     | Funktional  |
| PUT     | `/v1/lieferadressen/{id}`     | `edit_delivery_address`       | Funktional  |
| DELETE  | `/v1/lieferadressen/{id}`     | `delete_delivery_address`     | Funktional  |

### Filter

| Parameter                | Operator   | Beschreibung                     |
|--------------------------|-----------|----------------------------------|
| `adresse`                | `=`       | Adress-ID (Fremdschluessel)      |
| `typ`                    | `=`       | Typ (exakt)                       |
| `name`                   | `%LIKE%`  | Name (Teilstring)                 |
| `name_equals`            | `=`       | Name (exakt)                      |
| `name_startswith`        | `LIKE x%` | Name beginnt mit                  |
| `name_endswith`          | `LIKE %x` | Name endet mit                    |
| `standardlieferadresse`  | `=`       | Standard-Lieferadresse (0 oder 1) |
| `land`                   | `=`       | Laendercode (exakt)               |
| `id_ext`                 | `=`       | Externe ID                        |

### Sortierungen

| Parameter | Beschreibung |
|-----------|-------------|
| `typ`     | Nach Typ    |
| `name`    | Nach Name   |
| `plz`     | Nach PLZ    |
| `land`    | Nach Land   |

### Felder

| Feld                      | Typ      | Beschreibung                       |
|---------------------------|----------|------------------------------------|
| `id`                      | integer  | Primaerschluessel                  |
| `typ`                     | string   | Typ der Lieferadresse              |
| `name`                    | string   | Name                               |
| `abteilung`               | string   | Abteilung                          |
| `unterabteilung`          | string   | Unterabteilung                     |
| `strasse`                 | string   | Strasse                            |
| `ort`                     | string   | Ort                                |
| `plz`                     | string   | Postleitzahl                       |
| `land`                    | string   | Laendercode (2-stellig, ISO 3166)  |
| `telefon`                 | string   | Telefonnummer                      |
| `telefax`                 | string   | Faxnummer                          |
| `email`                   | string   | E-Mail-Adresse                     |
| `adresszusatz`            | string   | Adresszusatz                       |
| `adresse`                 | integer  | Referenz auf Adresse (Fremdschluessel) |
| `standardlieferadresse`   | integer  | Standard-Lieferadresse (0/1)       |
| `gln`                     | string   | Global Location Number             |
| `ustid`                   | string   | Umsatzsteuer-ID                    |
| `lieferbedingung`         | string   | Lieferbedingung                    |
| `ust_befreit`             | integer  | USt-Befreiung (0-3)               |
| `interne_bemerkung`       | string   | Interne Bemerkung                  |
| `id_ext`                  | string   | Externe ID (aus api_mapping)       |

### Validierungsregeln (POST/PUT)

| Feld                     | Regel                                                        |
|--------------------------|--------------------------------------------------------------|
| `name`                   | **Pflichtfeld**                                              |
| `adresse`                | Numerisch, muss in Tabelle `adresse` existieren              |
| `typ`                    | Muss in `adresse_typ.type` existieren                        |
| `land`                   | Grossbuchstaben, 2 Zeichen, ISO 3166-1 alpha-2               |
| `ust_befreit`            | Erlaubte Werte: `0`, `1`, `2`, `3`                           |
| `standardlieferadresse`  | Erlaubte Werte: `0`, `1`                                     |

### Beispiele

```http
# Alle Lieferadressen fuer Adresse 42
GET /v1/lieferadressen?adresse=42

# Neue Lieferadresse anlegen
POST /v1/lieferadressen
Content-Type: application/json

{
  "name": "Lager Sued",
  "adresse": 42,
  "typ": "firma",
  "strasse": "Industriestr. 7",
  "plz": "70173",
  "ort": "Stuttgart",
  "land": "DE",
  "standardlieferadresse": 0,
  "ust_befreit": 0
}

# Lieferadresse loeschen
DELETE /v1/lieferadressen/15
```

---

## 3. Adresstypen

**Endpunkt:** `/v1/adresstyp`

### Routen

| Methode | Pfad                     | Berechtigung              | Status      |
|---------|--------------------------|---------------------------|-------------|
| GET     | `/v1/adresstyp`          | `list_address_types`       | Funktional  |
| GET     | `/v1/adresstyp/{id}`     | `view_address_type`       | Funktional  |
| POST    | `/v1/adresstyp`          | `create_address_type`     | Funktional  |
| PUT     | `/v1/adresstyp/{id}`     | `edit_address_type`       | Funktional  |
| DELETE  | —                        | —                         | Nicht vorhanden |

### Filter

| Parameter            | Operator   | Beschreibung                  |
|----------------------|-----------|-------------------------------|
| `bezeichnung`        | `%LIKE%`  | Bezeichnung (Teilstring)      |
| `bezeichnung_exakt`  | `=`       | Bezeichnung (exakt)           |
| `type`               | `LIKE`    | Type-Kuerzel                  |
| `projekt`            | `=`       | Projekt-ID                    |
| `netto`              | `=`       | Netto-Flag (0/1)             |
| `aktiv`              | `=`       | Aktiv-Flag (0/1)             |

### Sortierungen

| Parameter     | Beschreibung         |
|---------------|---------------------|
| `bezeichnung` | Nach Bezeichnung    |
| `type`        | Nach Type           |
| `projekt`     | Nach Projekt-ID     |
| `netto`       | Nach Netto-Flag     |
| `aktiv`       | Nach Aktiv-Flag     |

### Felder

| Feld          | Typ      | Beschreibung              |
|---------------|----------|---------------------------|
| `id`          | integer  | Primaerschluessel         |
| `type`        | string   | Type-Kuerzel              |
| `bezeichnung` | string  | Bezeichnung               |
| `projekt`     | integer  | Projekt-ID                |
| `netto`       | integer  | Netto-Kennzeichen (0/1)   |
| `aktiv`       | integer  | Aktiv-Kennzeichen (0/1)   |

### Includes

| Include    | Resource          | Felder                                         |
|------------|-------------------|-------------------------------------------------|
| `projekt`  | ProjectResource   | `id`, `name`, `abkuerzung`, `beschreibung`, `farbe` |

### Validierungsregeln (POST/PUT)

| Feld          | Regel           |
|---------------|-----------------|
| `bezeichnung` | **Pflichtfeld** |
| `type`        | **Pflichtfeld** |
| `projekt`     | numeric         |
| `netto`       | boolean         |
| `aktiv`       | boolean         |

### Beispiele

```http
# Alle aktiven Adresstypen mit Projekt-Include
GET /v1/adresstyp?aktiv=1&include=projekt

# Neuen Adresstyp anlegen
POST /v1/adresstyp
Content-Type: application/json

{
  "type": "premium",
  "bezeichnung": "Premium-Kunde",
  "projekt": 1,
  "netto": 0,
  "aktiv": 1
}
```

---

## 4. Artikel

**Endpunkt:** `/v1/artikel`

> **NUR LESEZUGRIFF.** POST und PUT sind im Quellcode auskommentiert. `insertQuery`, `updateQuery` und `deleteQuery` geben `false` zurueck.

### Routen

| Methode | Pfad                   | Berechtigung     | Status              |
|---------|------------------------|------------------|---------------------|
| GET     | `/v1/artikel`          | `list_articles`  | Funktional          |
| GET     | `/v1/artikel/{id}`     | `view_article`   | Funktional          |
| POST    | —                      | —                | Auskommentiert      |
| PUT     | —                      | —                | Auskommentiert      |
| DELETE  | —                      | —                | Nicht vorhanden     |

### Filter (23 Stueck)

| Parameter              | Operator   | Beschreibung                       |
|------------------------|-----------|-------------------------------------|
| `typ`                  | `LIKE`    | Artikeltyp                          |
| `name_de`              | `%LIKE%`  | Deutscher Name (Teilstring)         |
| `name_de_exakt`        | `=`       | Deutscher Name (exakt)              |
| `name_de_startswith`   | `LIKE x%` | Deutscher Name beginnt mit          |
| `name_de_endswith`     | `LIKE %x` | Deutscher Name endet mit            |
| `name_de_equals`       | `=`       | Deutscher Name (exakt, Alias)       |
| `name_en`              | `%LIKE%`  | Englischer Name (Teilstring)        |
| `name_en_exakt`        | `=`       | Englischer Name (exakt)             |
| `name_en_startswith`   | `LIKE x%` | Englischer Name beginnt mit         |
| `name_en_endswith`     | `LIKE %x` | Englischer Name endet mit           |
| `name_en_equals`       | `=`       | Englischer Name (exakt, Alias)      |
| `nummer`               | `%LIKE%`  | Artikelnummer (Teilstring)          |
| `nummer_exakt`         | `=`       | Artikelnummer (exakt)               |
| `nummer_startswith`    | `LIKE x%` | Artikelnummer beginnt mit           |
| `nummer_endswith`      | `LIKE %x` | Artikelnummer endet mit             |
| `nummer_equals`        | `=`       | Artikelnummer (exakt, Alias)        |
| `projekt`              | `=`       | Projekt-ID                          |
| `adresse`              | `=`       | Adress-ID (Hersteller/Lieferant)   |
| `katalog`              | `=`       | Katalog-ID                          |
| `firma`                | `=`       | Firma-ID                            |
| `ausverkauft`          | `=`       | Ausverkauft-Flag (0/1)             |
| `startseite`           | `=`       | Startseite-Flag (0/1)              |
| `topseller`            | `=`       | Topseller-Flag (0/1)               |

### Sortierungen

| Parameter | Beschreibung              |
|-----------|--------------------------|
| `name_de` | Nach deutschem Namen     |
| `name_en` | Nach englischem Namen    |
| `nummer`  | Nach Artikelnummer       |
| `typ`     | Nach Artikeltyp          |

### Includes

| Include           | Resource                  | Beschreibung                                   |
|-------------------|---------------------------|------------------------------------------------|
| `verkaufspreise`  | SalesPriceResource        | Verkaufspreise des Artikels                    |
| `lagerbestand`    | ArtikelAnzahlVerkaufbar   | Verkaufbarer Lagerbestand (**nur wenn `lagerartikel=1`**) |
| `dateien`         | ArticleFileResource       | Dateien/Bilder des Artikels                    |
| `projekt`         | ProjectResource           | Projekt-Daten (`id`, `name`, `abkuerzung`, `beschreibung`, `farbe`) |

### Felder (Auswahl der ~300+ zurueckgegebenen Spalten)

| Feld             | Beschreibung                                |
|------------------|---------------------------------------------|
| `id`             | Primaerschluessel                           |
| `typ`            | Artikeltyp                                  |
| `nummer`         | Artikelnummer                               |
| `name_de`        | Deutscher Name                              |
| `name_en`        | Englischer Name                             |
| `gewicht`        | Gewicht                                     |
| `einheit`        | Einheit                                     |
| `lagerartikel`   | Lagerartikel-Flag (0/1)                     |
| `ean`            | EAN-Code                                    |
| `inaktiv`        | Inaktiv-Flag (**Achtung: invertierte Logik**) |
| `ausverkauft`    | Ausverkauft-Flag                            |
| `startseite`     | Startseite-Flag                             |
| `topseller`      | Topseller-Flag                              |
| `projekt`        | Projekt-ID                                  |
| ...              | ~300+ Spalten insgesamt                     |

> **WICHTIG — Haeufige Irrtümer:**
>
> - Die Felder `preis`, `waehrung` und `aktiv` existieren **NICHT** auf dieser Ressource.
> - Preise werden ausschliesslich ueber `?include=verkaufspreise` abgerufen (SalesPriceResource).
> - Der Aktivitaetsstatus wird ueber das Feld `inaktiv` gesteuert (invertierte Logik: `inaktiv=0` bedeutet aktiv).

### Beispiele

```http
# Alle Lagerartikel mit Bestand und Preisen
GET /v1/artikel?typ=lager&include=verkaufspreise,lagerbestand&sort=nummer

# Artikel nach Nummer suchen
GET /v1/artikel?nummer_startswith=ART-2024&items=100

# Topseller eines Projekts
GET /v1/artikel?projekt=1&topseller=1&include=dateien
```

---

## 5. Artikelkategorien

**Endpunkt:** `/v1/artikelkategorien`

### Routen

| Methode | Pfad                              | Berechtigung                 | Status      |
|---------|-----------------------------------|------------------------------|-------------|
| GET     | `/v1/artikelkategorien`           | `list_article_category`      | Funktional  |
| GET     | `/v1/artikelkategorien/{id}`      | `view_article_category`      | Funktional  |
| POST    | `/v1/artikelkategorien`           | `create_article_category`    | Funktional  |
| PUT     | `/v1/artikelkategorien/{id}`      | `edit_article_category`      | Funktional  |
| DELETE  | —                                 | —                            | Nicht vorhanden |

### Filter

| Parameter            | Operator   | Beschreibung             |
|----------------------|-----------|--------------------------|
| `bezeichnung`        | `%LIKE%`  | Bezeichnung (Teilstring) |
| `bezeichnung_exakt`  | `=`       | Bezeichnung (exakt)      |
| `projekt`            | `=`       | Projekt-ID               |
| `parent`             | `=`       | Eltern-Kategorie-ID     |

### Sortierungen

| Parameter     | Beschreibung         |
|---------------|---------------------|
| `bezeichnung` | Nach Bezeichnung    |
| `projekt`     | Nach Projekt-ID     |
| `parent`      | Nach Eltern-ID      |

### Includes

| Include   | Resource        | Beschreibung   |
|-----------|-----------------|----------------|
| `projekt` | ProjectResource | Projekt-Daten  |

### Felder

Die Resource gibt die Spalten der Tabelle `artikelkategorien` zurueck (inkl. `id`, `bezeichnung`, `projekt`, `parent`, etc.).

### Validierungsregeln (POST/PUT)

| Feld          | Regel                                    |
|---------------|------------------------------------------|
| `bezeichnung` | **Pflichtfeld**, muss **eindeutig** sein |

### Beispiele

```http
# Alle Hauptkategorien (ohne Eltern)
GET /v1/artikelkategorien?parent=0&sort=bezeichnung

# Unterkategorien einer Kategorie
GET /v1/artikelkategorien?parent=5&include=projekt
```

---

## 6. Gruppen

**Endpunkt:** `/v1/gruppen`

### Routen

| Methode | Pfad                   | Berechtigung      | Status      |
|---------|------------------------|--------------------|-------------|
| GET     | `/v1/gruppen`          | `list_groups`       | Funktional  |
| GET     | `/v1/gruppen/{id}`     | `view_group`       | Funktional  |
| POST    | `/v1/gruppen`          | `create_group`     | Funktional  |
| PUT     | `/v1/gruppen/{id}`     | `edit_group`       | Funktional  |
| DELETE  | —                      | —                  | `deleteQuery` gibt `false` zurueck |

> **Hinweis:** `deleteQuery` gibt `false` zurueck, eine DELETE-Route ist nicht vorhanden.

### Filter

| Parameter          | Operator   | Beschreibung           |
|--------------------|-----------|------------------------|
| `name`             | `%LIKE%`  | Name (Teilstring)      |
| `name_exakt`       | `=`       | Name (exakt)           |
| `kennziffer`       | `%LIKE%`  | Kennziffer (Teilstring)|
| `kennziffer_exakt` | `=`       | Kennziffer (exakt)     |
| `art`              | `LIKE`    | Art                    |
| `projekt`          | `=`       | Projekt-ID             |
| `kategorie`        | `=`       | Kategorie              |
| `aktiv`            | `=`       | Aktiv-Flag (0/1)       |

### Sortierungen

| Parameter    | Beschreibung       |
|--------------|-------------------|
| `name`       | Nach Name         |
| `art`        | Nach Art          |
| `kennziffer` | Nach Kennziffer   |
| `projekt`    | Nach Projekt-ID   |
| `kategorie`  | Nach Kategorie    |
| `aktiv`      | Nach Aktiv-Flag   |

### Felder (8 von 50+ DB-Spalten)

| Feld               | Typ      | Beschreibung         |
|--------------------|----------|----------------------|
| `id`               | integer  | Primaerschluessel    |
| `name`             | string   | Gruppenname          |
| `art`              | string   | Art der Gruppe       |
| `kennziffer`       | string   | Kennziffer           |
| `internebemerkung` | string   | Interne Bemerkung    |
| `projekt`          | integer  | Projekt-ID           |
| `kategorie`        | string   | Kategorie            |
| `aktiv`            | integer  | Aktiv-Flag (0/1)     |

> **Hinweis:** Die Resource gibt nur 8 von ueber 50 Datenbank-Spalten zurueck. Zusaetzliche Felder der Datenbanktabelle sind nicht ueber die API verfuegbar.

### Includes

| Include   | Resource        | Felder                                         |
|-----------|-----------------|------------------------------------------------|
| `projekt` | ProjectResource | `id`, `name`, `abkuerzung`, `beschreibung`, `farbe` |

### Validierungsregeln (POST/PUT)

| Feld        | Regel                                                              |
|-------------|--------------------------------------------------------------------|
| `name`      | **Pflichtfeld**                                                    |
| `kennziffer`| **Pflichtfeld**, alpha_dash, unique                                |
| `art`       | in: gruppe,preisgruppe,verband,regionalgruppe,kategorie,vertreter  |
| `projekt`   | numeric                                                            |
| `kategorie` | numeric                                                            |
| `aktiv`     | boolean                                                            |

### Beispiele

```http
# Alle aktiven Gruppen
GET /v1/gruppen?aktiv=1&sort=name

# Gruppen nach Art filtern
GET /v1/gruppen?art=gruppe&projekt=1
```

---

## 7. Eigenschaften

**Endpunkt:** `/v1/eigenschaften`

> Vollstaendiger CRUD inklusive DELETE.

### Routen

| Methode | Pfad                          | Berechtigung        | Status      |
|---------|-------------------------------|---------------------|-------------|
| GET     | `/v1/eigenschaften`           | `list_property`     | Funktional  |
| GET     | `/v1/eigenschaften/{id}`      | `view_property`     | Funktional  |
| POST    | `/v1/eigenschaften`           | `create_property`   | Funktional  |
| PUT     | `/v1/eigenschaften/{id}`      | `edit_property`     | Funktional  |
| DELETE  | `/v1/eigenschaften/{id}`      | `delete_property`   | Funktional  |

### Filter

| Parameter   | Operator | Beschreibung       |
|-------------|----------|--------------------|
| `artikel`   | `=`      | Artikel-ID         |
| `name`      | `=`      | Name (exakt)       |
| `typ`       | `=`      | Typ                |
| `projekt`   | `=`      | Projekt-ID         |
| `geloescht` | `=`      | Geloescht-Flag     |

### Sortierungen

| Parameter   | Beschreibung       |
|-------------|--------------------|
| `artikel`   | Nach Artikel-ID    |
| `name`      | Nach Name          |
| `typ`       | Nach Typ           |
| `projekt`   | Nach Projekt-ID    |
| `geloescht` | Nach Geloescht-Flag|

> **BUG:** Die Sortierparameter verwenden intern die `=` Operator-Syntax. Dies kann zu unerwartetem Verhalten fuehren.

### Felder

| Feld        | Typ      | Beschreibung      |
|-------------|----------|-------------------|
| `id`        | integer  | Primaerschluessel |
| `artikel`   | integer  | Artikel-ID        |
| `name`      | string   | Eigenschaftsname  |
| `typ`       | string   | Typ               |
| `projekt`   | integer  | Projekt-ID        |
| `geloescht` | integer  | Geloescht-Flag    |

### Beispiele

```http
# Alle Eigenschaften eines Artikels
GET /v1/eigenschaften?artikel=100

# Nicht geloeschte Eigenschaften
GET /v1/eigenschaften?geloescht=0&sort=name
```

### Validierungsregeln

| Feld        | Regeln                                    |
|-------------|-------------------------------------------|
| `id`        | `not_present` — darf nicht gesendet werden |
| `artikel`   | `integer`                                 |
| `projekt`   | `integer`                                 |
| `geloescht` | `in:0,1`                                  |
| `name`      | `unique:artikeleigenschaften,name` — muss eindeutig sein |

---

## 8. Eigenschaftenwerte

**Endpunkt:** `/v1/eigenschaftenwerte`

> Vollstaendiger CRUD inklusive DELETE.

### Routen

| Methode | Pfad                               | Berechtigung             | Status      |
|---------|-------------------------------------|--------------------------|-------------|
| GET     | `/v1/eigenschaftenwerte`            | `list_property_value`    | Funktional  |
| GET     | `/v1/eigenschaftenwerte/{id}`       | `view_property_value`    | Funktional  |
| POST    | `/v1/eigenschaftenwerte`            | `create_property_value`  | Funktional  |
| PUT     | `/v1/eigenschaftenwerte/{id}`       | `edit_property_value`    | Funktional  |
| DELETE  | `/v1/eigenschaftenwerte/{id}`       | `delete_property_value`  | Funktional  |

### Filter

| Parameter              | Operator | Beschreibung                |
|------------------------|----------|-----------------------------|
| `artikeleigenschaften` | `=`      | Eigenschafts-ID (Fremdschluessel) |
| `artikel`              | `=`      | Artikel-ID                  |
| `wert`                 | `=`      | Wert (exakt)                |

### Sortierungen

| Parameter | Beschreibung    |
|-----------|-----------------|
| `artikel` | Nach Artikel-ID |
| `wert`    | Nach Wert       |

### Felder (4 von 7 DB-Spalten)

| Feld                  | Typ      | Beschreibung                       |
|-----------------------|----------|------------------------------------|
| `id`                  | integer  | Primaerschluessel                  |
| `artikeleigenschaften`| integer  | Referenz auf Eigenschaft (FK)      |
| `wert`                | string   | Der eigentliche Wert               |
| `artikel`             | integer  | Artikel-ID                         |

> **Hinweis:** Die Resource gibt nur 4 von 7 Datenbank-Spalten zurueck.

### Beispiele

```http
# Alle Werte einer Eigenschaft
GET /v1/eigenschaftenwerte?artikeleigenschaften=5

# Werte eines Artikels
GET /v1/eigenschaftenwerte?artikel=100&sort=wert
```

### Validierungsregeln

| Feld                   | Regeln                                                        |
|------------------------|---------------------------------------------------------------|
| `id`                   | `not_present` — darf nicht gesendet werden                    |
| `artikel`              | `numeric\|db_value:artikel,id` — muss in Tabelle `artikel` existieren |
| `artikeleigenschaften` | `numeric\|db_value:artikeleigenschaften,id` — muss in Tabelle `artikeleigenschaften` existieren |

---

## 9. Steuersaetze

**Endpunkt:** `/v1/steuersaetze`

### Routen

| Methode | Pfad                        | Berechtigung        | Status      |
|---------|------------------------------|---------------------|-------------|
| GET     | `/v1/steuersaetze`           | `list_tax_rates`     | Funktional  |
| GET     | `/v1/steuersaetze/{id}`      | `view_tax_rate`     | Funktional  |
| POST    | `/v1/steuersaetze`           | `create_tax_rate`   | Funktional  |
| PUT     | `/v1/steuersaetze/{id}`      | `edit_tax_rate`     | Funktional  |
| DELETE  | —                            | —                   | Nicht vorhanden |

### Filter

| Parameter      | Operator | Beschreibung              |
|----------------|----------|---------------------------|
| `bezeichnung`  | `%LIKE%` | Bezeichnung (Teilstring)  |
| `country_code` | `%LIKE%` | Laendercode (Teilstring)  |
| `satz`         | `=`      | Steuersatz (Wert)         |
| `aktiv`        | `=`      | Aktiv-Flag (0/1)          |

### Sortierungen

| Parameter      | Beschreibung           |
|----------------|------------------------|
| `bezeichnung`  | Nach Bezeichnung       |
| `country_code` | Nach Laendercode       |
| `satz`         | Nach Steuersatz        |
| `aktiv`        | Nach Aktiv-Flag        |

### Felder (5 von 12 DB-Spalten)

| Feld           | Typ      | Beschreibung           |
|----------------|----------|------------------------|
| `id`           | integer  | Primaerschluessel      |
| `bezeichnung`  | string   | Bezeichnung            |
| `country_code` | string   | Laendercode (ISO)      |
| `satz`         | decimal  | Steuersatz in Prozent  |
| `aktiv`        | integer  | Aktiv-Flag (0/1)       |

> **Hinweis:** Die Resource gibt nur 5 von 12 Datenbank-Spalten zurueck.

### Beispiele

```http
# Alle aktiven deutschen Steuersaetze
GET /v1/steuersaetze?country_code=DE&aktiv=1

# Steuersatz anlegen
POST /v1/steuersaetze
Content-Type: application/json

{
  "bezeichnung": "Normaler MwSt-Satz",
  "country_code": "DE",
  "satz": 19.00,
  "aktiv": 1
}
```

### Validierungsregeln

| Feld          | Regeln                                                      |
|---------------|-------------------------------------------------------------|
| `id`          | `not_present` — darf nicht gesendet werden                  |
| `bezeichnung` | `required\|unique:steuersaetze,bezeichnung` — Pflichtfeld, muss eindeutig sein |
| `satz`        | `required\|decimal` — Pflichtfeld, Dezimalzahl              |
| `aktiv`       | `boolean`                                                   |

---

## 10. Zahlungsweisen

**Endpunkt:** `/v1/zahlungsweisen`

### Routen

| Methode | Pfad                            | Berechtigung              | Status      |
|---------|----------------------------------|---------------------------|-------------|
| GET     | `/v1/zahlungsweisen`             | `list_payment_methods`     | Funktional  |
| GET     | `/v1/zahlungsweisen/{id}`        | `view_payment_method`     | Funktional  |
| POST    | `/v1/zahlungsweisen`             | `create_payment_method`   | Funktional  |
| PUT     | `/v1/zahlungsweisen/{id}`        | `edit_payment_method`     | Funktional  |
| DELETE  | —                                | —                         | Nicht vorhanden |

> **Soft-Delete:** Die Liste filtert automatisch mit `WHERE geloescht <> 1`. Geloeschte Eintraege erscheinen nicht in Abfragen.

### Filter

| Parameter            | Operator   | Beschreibung                |
|----------------------|-----------|-----------------------------|
| `bezeichnung`        | `%LIKE%`  | Bezeichnung (Teilstring)    |
| `bezeichnung_exakt`  | `=`       | Bezeichnung (exakt)         |
| `type`               | `%LIKE%`  | Type-Kuerzel (Teilstring)   |
| `type_exakt`         | `=`       | Type-Kuerzel (exakt)        |
| `projekt`            | `=`       | Projekt-ID                  |
| `verhalten`          | `=`       | Verhalten                   |
| `aktiv`              | `=`       | Aktiv-Flag (0/1)            |

### Sortierungen

| Parameter     | Beschreibung         |
|---------------|---------------------|
| `bezeichnung` | Nach Bezeichnung    |
| `type`        | Nach Type           |
| `projekt`     | Nach Projekt-ID     |
| `modul`       | Nach Modul          |
| `aktiv`       | Nach Aktiv-Flag     |

### Felder

| Feld                                    | Typ      | Beschreibung                                  |
|-----------------------------------------|----------|-----------------------------------------------|
| `id`                                    | integer  | Primaerschluessel                             |
| `type`                                  | string   | Type-Kuerzel                                  |
| `bezeichnung`                           | string   | Bezeichnung                                   |
| `freitext`                              | string   | Freitext                                      |
| `aktiv`                                 | integer  | Aktiv-Flag (0/1)                              |
| `automatischbezahlt`                    | integer  | Automatisch als bezahlt markieren             |
| `automatischbezahltverbindlichkeit`     | integer  | Automatisch Verbindlichkeit bezahlt markieren |
| `projekt`                               | integer  | Projekt-ID                                    |
| `vorkasse`                              | integer  | Vorkasse-Flag                                 |
| `verhalten`                             | string   | Verhalten der Zahlungsweise                   |
| `modul`                                 | string   | Zugehoeriges Modul                            |

### Includes

| Include   | Resource        | Beschreibung   |
|-----------|-----------------|----------------|
| `projekt` | ProjectResource | Projekt-Daten  |

### Beispiele

```http
# Alle aktiven Zahlungsweisen mit Projekt
GET /v1/zahlungsweisen?aktiv=1&include=projekt

# Zahlungsweisen nach Verhalten filtern
GET /v1/zahlungsweisen?verhalten=rechnung&sort=bezeichnung
```

### Validierungsregeln

| Feld                                    | Regeln                                                       |
|-----------------------------------------|--------------------------------------------------------------|
| `id`                                    | `not_present` — darf nicht gesendet werden                   |
| `einstellungen_json`                    | `not_present` — darf nicht gesendet werden                   |
| `freitext`                              | `not_present` — darf nicht gesendet werden                   |
| `bezeichnung`                           | `required` — Pflichtfeld                                     |
| `type`                                  | `required\|unique:zahlungsweisen,type` — Pflichtfeld, muss eindeutig sein |
| `projekt`                               | `numeric`                                                    |
| `aktiv`                                 | `boolean`                                                    |
| `vorkasse`                              | `boolean`                                                    |
| `automatischbezahlt`                    | `boolean`                                                    |
| `automatischbezahltverbindlichkeit`     | `boolean`                                                    |

---

## 11. Versandarten

**Endpunkt:** `/v1/versandarten`

### Routen

| Methode | Pfad                          | Berechtigung               | Status      |
|---------|-------------------------------|----------------------------|-------------|
| GET     | `/v1/versandarten`            | `list_shipping_methods`     | Funktional  |
| GET     | `/v1/versandarten/{id}`       | `view_shipping_method`     | Funktional  |
| POST    | `/v1/versandarten`            | `create_shipping_method`   | Funktional  |
| PUT     | `/v1/versandarten/{id}`       | `edit_shipping_method`     | Funktional  |
| DELETE  | —                             | —                          | Nicht vorhanden |

> **Soft-Delete:** Die Liste filtert automatisch mit `WHERE geloescht <> 1`. Geloeschte Eintraege erscheinen nicht in Abfragen.

### Filter

| Parameter            | Operator   | Beschreibung                |
|----------------------|-----------|-----------------------------|
| `bezeichnung`        | `%LIKE%`  | Bezeichnung (Teilstring)    |
| `bezeichnung_exakt`  | `=`       | Bezeichnung (exakt)         |
| `type`               | `%LIKE%`  | Type-Kuerzel (Teilstring)   |
| `type_exakt`         | `=`       | Type-Kuerzel (exakt)        |
| `projekt`            | `=`       | Projekt-ID                  |
| `modul`              | `=`       | Modul                       |
| `aktiv`              | `=`       | Aktiv-Flag (0/1)            |

### Sortierungen

| Parameter     | Beschreibung         |
|---------------|---------------------|
| `bezeichnung` | Nach Bezeichnung    |
| `type`        | Nach Type           |
| `projekt`     | Nach Projekt-ID     |
| `modul`       | Nach Modul          |
| `aktiv`       | Nach Aktiv-Flag     |

### Felder

| Feld                          | Typ      | Beschreibung                              |
|-------------------------------|----------|-------------------------------------------|
| `id`                          | integer  | Primaerschluessel                         |
| `type`                        | string   | Type-Kuerzel                              |
| `bezeichnung`                 | string   | Bezeichnung                               |
| `aktiv`                       | integer  | Aktiv-Flag (0/1)                          |
| `projekt`                     | integer  | Projekt-ID                                |
| `modul`                       | string   | Zugehoeriges Modul                        |
| `paketmarke_drucker`          | string   | Drucker fuer Paketmarken                  |
| `export_drucker`              | string   | Drucker fuer Export                       |
| `ausprojekt`                  | integer  | Aus-Projekt-Flag                          |
| `versandmail`                 | integer  | Versandmail senden                        |
| `geschaeftsbrief_vorlage`     | string   | Geschaeftsbrief-Vorlage                   |

### Includes

| Include   | Resource        | Beschreibung   |
|-----------|-----------------|----------------|
| `projekt` | ProjectResource | Projekt-Daten  |

### Beispiele

```http
# Alle aktiven Versandarten
GET /v1/versandarten?aktiv=1&sort=bezeichnung

# Versandarten eines bestimmten Moduls
GET /v1/versandarten?modul=dhl&include=projekt
```

### Validierungsregeln

| Feld                 | Regeln                                                       |
|----------------------|--------------------------------------------------------------|
| `id`                 | `not_present` — darf nicht gesendet werden                   |
| `einstellungen_json` | `not_present` — darf nicht gesendet werden                   |
| `bezeichnung`        | `required` — Pflichtfeld                                     |
| `type`               | `required\|unique:versandarten,type` — Pflichtfeld, muss eindeutig sein |
| `projekt`            | `numeric`                                                    |
| `aktiv`              | `boolean`                                                    |

---

## 12. Laender

**Endpunkt:** `/v1/laender`

### Routen

| Methode | Pfad                    | Berechtigung          | Status      |
|---------|-------------------------|-----------------------|-------------|
| GET     | `/v1/laender`           | `list_countries`        | Funktional  |
| GET     | `/v1/laender/{id}`      | `view_country`        | Funktional  |
| POST    | `/v1/laender`           | `create_country`      | Funktional  |
| PUT     | `/v1/laender/{id}`      | `edit_country`        | Funktional  |
| DELETE  | —                       | —                     | Nicht vorhanden |

### Filter

| Parameter          | Operator   | Beschreibung                                       |
|--------------------|-----------|-----------------------------------------------------|
| `bezeichnung_de`   | `%LIKE%`  | Deutscher Name (Teilstring)                         |
| `bezeichnung_en`   | `%LIKE%`  | **BUG: Sucht in `bezeichnung_de` statt `bezeichnung_en`!** |
| `iso`              | `=`       | ISO-Code (exakt)                                    |
| `eu`               | `=`       | EU-Mitglied (0/1)                                   |
| `id_ext`           | `=`       | Externe ID                                          |

> **BUG:** Der Filter `bezeichnung_en` ist fehlerhaft implementiert und durchsucht die Spalte `bezeichnung_de` statt `bezeichnung_en`. Dies ist ein bekannter Fehler im Quellcode.

### Sortierungen

| Parameter        | Beschreibung                |
|------------------|-----------------------------|
| `bezeichnung`    | Nach Bezeichnung (generisch)|
| `bezeichnung_de` | Nach deutschem Namen        |
| `bezeichnung_en` | Nach englischem Namen       |
| `iso`            | Nach ISO-Code               |
| `eu`             | Nach EU-Mitgliedschaft      |

### Felder

| Feld             | Typ      | Beschreibung                           |
|------------------|----------|----------------------------------------|
| `id`             | integer  | Primaerschluessel                      |
| `bezeichnung_de` | string  | Deutscher Name                         |
| `bezeichnung_en` | string  | Englischer Name                        |
| `iso`            | string   | ISO 3166-1 alpha-2 Code               |
| `eu`             | integer  | EU-Mitglied (0/1)                      |
| `ustid_prefix`   | string   | USt-ID Praefix                         |
| `bundesland`     | string   | Bundesland (falls zutreffend)          |
| `id_ext`         | string   | Externe ID (aus api_mapping)           |

> **Hinweis:** Alle 7 DB-Spalten plus `id_ext` aus der `api_mapping`-Tabelle werden zurueckgegeben.

### Beispiele

```http
# Alle EU-Laender
GET /v1/laender?eu=1&sort=bezeichnung_de

# Land per ISO-Code
GET /v1/laender?iso=DE

# ACHTUNG: Dieser Filter sucht NICHT im englischen Namen!
GET /v1/laender?bezeichnung_en=Germany
# Sucht tatsaechlich in bezeichnung_de — gibt "Germany" nicht zurueck,
# wuerde aber "Deutschland" finden, wenn als Wert uebergeben.
```

### Validierungsregeln

| Feld             | Regeln                                                                  |
|------------------|-------------------------------------------------------------------------|
| `id`             | `not_present` — darf nicht gesendet werden                              |
| `id_ext`         | `not_present` — darf nicht gesendet werden                              |
| `bezeichnung_de` | `required\|unique:laender,bezeichnung_de` — Pflichtfeld, muss eindeutig sein |
| `bezeichnung_en` | `required\|unique:laender,bezeichnung_en` — Pflichtfeld, muss eindeutig sein |
| `iso`            | `required\|upper\|length:2\|unique:laender,iso` — Pflichtfeld, Grossbuchstaben, 2 Zeichen, eindeutig |
| `eu`             | `boolean`                                                               |

---

## Uebersichtstabelle: Verfuegbare Methoden

| Resource            | Endpunkt                | GET List | GET Single | POST | PUT | DELETE |
|---------------------|-------------------------|:--------:|:----------:|:----:|:---:|:------:|
| Adressen            | `/v1/adressen`          | ja       | ja         | **defekt** | **defekt** | nein |
| Lieferadressen      | `/v1/lieferadressen`    | ja       | ja         | ja   | ja  | ja     |
| Adresstypen         | `/v1/adresstyp`         | ja       | ja         | ja   | ja  | nein   |
| Artikel             | `/v1/artikel`           | ja       | ja         | nein | nein| nein   |
| Artikelkategorien   | `/v1/artikelkategorien` | ja       | ja         | ja   | ja  | nein   |
| Gruppen             | `/v1/gruppen`           | ja       | ja         | ja   | ja  | nein   |
| Eigenschaften       | `/v1/eigenschaften`     | ja       | ja         | ja   | ja  | ja     |
| Eigenschaftenwerte  | `/v1/eigenschaftenwerte`| ja       | ja         | ja   | ja  | ja     |
| Steuersaetze        | `/v1/steuersaetze`      | ja       | ja         | ja   | ja  | nein   |
| Zahlungsweisen      | `/v1/zahlungsweisen`    | ja       | ja         | ja   | ja  | nein   |
| Versandarten        | `/v1/versandarten`      | ja       | ja         | ja   | ja  | nein   |
| Laender             | `/v1/laender`           | ja       | ja         | ja   | ja  | nein   |

---

## Bekannte Bugs und Einschraenkungen

### Kritisch

1. **Adressen POST/PUT nicht funktional:** Die Routen existieren, aber `insertQuery` und `updateQuery` geben `false` zurueck. Fuer Schreibzugriffe auf Adressen muss die Legacy-API verwendet werden.

2. **Artikel nur lesbar:** POST und PUT sind im Quellcode auskommentiert. `insertQuery`, `updateQuery` und `deleteQuery` geben alle `false` zurueck.

3. **Laender-Filter `bezeichnung_en` defekt:** Der Filter mappt intern auf die Spalte `bezeichnung_de` statt auf `bezeichnung_en`. Suchanfragen mit diesem Filter liefern falsche Ergebnisse.

### Einschraenkungen

4. **Zahlungsweisen/Versandarten Soft-Delete:** Geloeschte Eintraege (`geloescht = 1`) werden automatisch aus Listen-Abfragen ausgeschlossen. Es gibt keine Moeglichkeit, geloeschte Eintraege ueber die API abzurufen.

5. **Gruppen — eingeschraenkte Feldzahl:** Nur 8 von ueber 50 Datenbank-Spalten werden zurueckgegeben.

6. **Eigenschaftenwerte — eingeschraenkte Feldzahl:** Nur 4 von 7 Datenbank-Spalten werden zurueckgegeben.

7. **Steuersaetze — eingeschraenkte Feldzahl:** Nur 5 von 12 Datenbank-Spalten werden zurueckgegeben.

8. **Eigenschaften Sortierung:** Die Sortierparameter verwenden intern die `=` Operator-Syntax, was zu unerwartetem Verhalten fuehren kann.

9. **Artikel — fehlende Felder `preis`, `waehrung`, `aktiv`:** Diese in aelteren Dokumentationen erwaehnten Felder existieren nicht. Preise sind nur ueber `?include=verkaufspreise` verfuegbar. Der Aktivitaetsstatus wird ueber das invertierte Feld `inaktiv` gesteuert.

---

## Live Instance Compatibility

> Getestet gegen eine produktive OpenXE v1.12 Instanz (Stand: 2026-03-31).

| Endpoint | Status | Notes |
|----------|--------|-------|
| `/v1/adressen` | OK | Filters ignored except `kundennummer`, pagination uses `items` param |
| `/v1/adressen/{id}` | OK | Works |
| `/v1/artikel` | OK | Includes work (`verkaufspreise`, `lagerbestand`) |
| `/v1/artikel/{id}` | OK | Works with includes |
| `/v1/artikelkategorien` | OK | Works |
| `/v1/versandarten` | OK | Works |
| `/v1/lieferadressen` | 500 | Server error — may need DB setup |
| `/v1/adresstyp` | 404 | Not registered in this version |
| `/v1/gruppen` | 404 | Not registered |
| `/v1/eigenschaften` | 404 | Not registered |
| `/v1/eigenschaftenwerte` | 404 | Not registered |
| `/v1/steuersaetze` | 404 | Not registered |
| `/v1/zahlungsweisen` | 404 | Not registered |
| `/v1/laender` | 404 | Not registered |

**Zusammenfassung:** Von 14 dokumentierten Stammdaten-Endpunkten sind in v1.12 nur 6 funktional. 7 Endpunkte sind nicht registriert (404) und 1 liefert einen Server-Fehler (500). Fuer Integrationen sollte ausschliesslich mit den funktionalen Endpunkten geplant werden.

---

*Dokumentation verifiziert gegen OpenXE Quellcode, Stand 2026-03-31.*
