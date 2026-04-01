# REST API v1 -- Sonstige Endpunkte

> **Pfad-Praefix** `GET|POST|PUT|DELETE /api/v1/<resource>`
> Authentifizierung: HTTP Digest Auth

---

## Inhaltsverzeichnis

1. [Dateien (dateien)](#1-dateien)
2. [Trackingnummern (trackingnummern)](#2-trackingnummern)
3. [Aboartikel (aboartikel)](#3-aboartikel)
4. [Abogruppen (abogruppen)](#4-abogruppen)
5. [CRM-Dokumente (crmdokumente)](#5-crm-dokumente)
6. [Lagerchargen (lagercharge)](#6-lagerchargen)
7. [Lager-MHD (lagermhd)](#7-lager-mhd)
8. [Reports (reports)](#8-reports)
9. [Dokumenten-Scanner (docscan)](#9-dokumenten-scanner)
10. [Wiedervorlagen (wiedervorlagen)](#10-wiedervorlagen)
11. [Nur als Include verfuegbar](#11-nur-als-include-verfuegbar)

---

## 1. Dateien

**Basis-Pfad:** `/v1/dateien`
**DB-Tabelle:** `datei` (Versionen in `datei_version`, Stichwoerter in `datei_stichwoerter`)

### Endpunkte

| Methode | Pfad | Beschreibung | Permission |
|---------|------|--------------|------------|
| GET | `/v1/dateien` | Liste abrufen | `list_files` |
| GET | `/v1/dateien/{id}` | Einzelne Datei abrufen (inkl. Download-Links) | `view_file` |
| GET | `/v1/dateien/{id}/download` | Datei als Binary-Download | `view_file` |
| GET | `/v1/dateien/{id}/base64` | Datei als Base64-String (data-URI) | `view_file` |
| POST | `/v1/dateien` | Datei hochladen | `create_file` |

**Kein PUT, kein DELETE** -- `updateQuery()` und `deleteQuery()` geben `false` zurueck.

### Felder (GET-Response)

| Feld | Quelle | Beschreibung |
|------|--------|--------------|
| id | d.id | Datei-ID |
| titel | d.titel | Titel der Datei |
| beschreibung | d.beschreibung | Beschreibungstext |
| nummer | d.nummer | Interne Nummer |
| firma | d.firma | Firma-ID |
| ersteller | dv.ersteller | Ersteller (aus aktuellster Version) |
| datum | dv.datum | Datum der aktuellsten Version |
| version | dv.version | Versionsnummer |
| dateiname | dv.dateiname | Dateiname |
| bemerkung | dv.bemerkung | Bemerkung zur Version |
| size | dv.size | Dateigroesse |
| belegtypen | ds.belegtypen | Kommaseparierte Belegtypen (GROUP_CONCAT) |
| stichwoerter | ds.stichwoerter | Kommaseparierte Stichwoerter (GROUP_CONCAT) |
| mimetype | (berechnet) | MIME-Type der Datei (nur bei GET by id) |
| links.download | (berechnet) | URL zum Binary-Download (nur bei GET by id) |
| links.base64 | (berechnet) | URL zum Base64-Download (nur bei GET by id) |

### Filter (Query-Parameter)

| Parameter | Operator | Beschreibung |
|-----------|----------|--------------|
| titel | %LIKE% | Titel (Teilstring) |
| titel_equals | = | Titel (exakt) |
| titel_startswith | LIKE% | Titel (Anfang) |
| titel_endswith | %LIKE | Titel (Ende) |
| dateiname | %LIKE% | Dateiname (Teilstring) |
| dateiname_equals | = | Dateiname (exakt) |
| dateiname_startswith | LIKE% | Dateiname (Anfang) |
| dateiname_endswith | %LIKE | Dateiname (Ende) |
| belegtyp | %LIKE% | Belegtyp (Teilstring) |
| stichwort | %LIKE% | Stichwort (Teilstring) |

### Sortierung

`titel`, `dateiname`, `datum`

### Includes

| Include | Resource | Felder |
|---------|----------|--------|
| stichwoerter | FileKeywordResource | id, stichwort (subjekt), belegtyp (objekt), beleg_id (parameter), sort |

### POST -- Datei hochladen

**Content-Type: `application/x-www-form-urlencoded`** (kein JSON!)

| Feld | Pflicht | Beschreibung |
|------|---------|--------------|
| dateiname | ja | Dateiname (z.B. "rechnung.pdf") |
| titel | ja | Titel der Datei |
| file_content | ja | Dateiinhalt (Base64-kodiert) |
| beschreibung | nein | Optionaler Beschreibungstext |
| stichwoerter[] | nein | Array mit Zuordnungen: jeweils `modul`, `id`, `stichwort` |

**Stichwoerter-Beispiel (form-encoded):**
```
stichwoerter[0][modul]=auftrag&stichwoerter[0][id]=42&stichwoerter[0][stichwort]=Rechnung
```

---

## 2. Trackingnummern

**Basis-Pfad:** `/v1/trackingnummern`
**DB-Tabelle:** `versand`

### Endpunkte

| Methode | Pfad | Beschreibung | Permission |
|---------|------|--------------|------------|
| GET | `/v1/trackingnummern` | Liste abrufen | `list_tracking_numbers` |
| GET | `/v1/trackingnummern/{id}` | Einzelne Trackingnummer | `view_tracking_number` |
| POST | `/v1/trackingnummern` | Trackingnummer anlegen | `create_tracking_number` |
| PUT | `/v1/trackingnummern/{id}` | Trackingnummer bearbeiten | `edit_tracking_number` |

**Kein DELETE** -- `deleteQuery()` gibt `false` zurueck.

### Felder (GET-Response)

| Feld | Quelle | Beschreibung |
|------|--------|--------------|
| id | v.id | Versand-ID |
| tracking | v.tracking | Trackingnummer |
| adresse | v.adresse | Adress-ID |
| internet | au.internet | Internet-/Shop-Bestellnummer |
| auftrag | au.belegnr | Auftragsnummer (Belegnr) |
| lieferschein | l.belegnr | Lieferscheinnummer (Belegnr) |
| projekt | v.projekt | Projekt-ID |
| versandart | l.versandart | Versandart (aus Lieferschein) |
| land | l.land | Land (aus Lieferschein) |
| gewicht | v.gewicht | Gewicht |
| abgeschlossen | v.abgeschlossen | Abgeschlossen-Flag |
| versendet_am | v.versendet_am | Versanddatum |
| anzahlpakete | v.anzahlpakete | Anzahl Pakete |
| retoure | v.retoure | Retoure-Flag |
| klaergrund | v.klaergrund | Klaergrund |

### Filter (Query-Parameter)

| Parameter | Operator | Beschreibung |
|-----------|----------|--------------|
| tracking | %LIKE% | Trackingnummer (Teilstring) |
| tracking_equals | = | Trackingnummer (exakt) |
| tracking_startswith | LIKE% | Trackingnummer (Anfang) |
| tracking_endswith | %LIKE | Trackingnummer (Ende) |
| lieferschein | %LIKE% | Lieferscheinnummer (Teilstring) |
| lieferschein_equals | = | Lieferscheinnummer (exakt) |
| lieferschein_startswith | LIKE% | Lieferscheinnummer (Anfang) |
| lieferschein_endswith | %LIKE | Lieferscheinnummer (Ende) |
| auftrag | %LIKE% | Auftragsnummer (Teilstring) |
| auftrag_equals | = | Auftragsnummer (exakt) |
| auftrag_startswith | LIKE% | Auftragsnummer (Anfang) |
| auftrag_endswith | %LIKE | Auftragsnummer (Ende) |
| internet | %LIKE% | Internetnummer (Teilstring) |
| internet_equals | = | Internetnummer (exakt) |
| internet_startswith | LIKE% | Internetnummer (Anfang) |
| internet_endswith | %LIKE | Internetnummer (Ende) |
| versandart | = | Versandart (exakt) |
| versendet_am | = | Versanddatum (exakt) |
| versendet_am_gt | > | Versanddatum (groesser) |
| versendet_am_gte | >= | Versanddatum (groesser-gleich) |
| versendet_am_lt | < | Versanddatum (kleiner) |
| versendet_am_lte | <= | Versanddatum (kleiner-gleich) |
| abgeschlossen | = | Abgeschlossen-Flag |
| adresse | = | Adresse-ID |
| projekt | = | Projekt-ID |
| land | = | Land |

### Sortierung

`tracking`, `auftrag`, `lieferschein`, `versandart`, `versendet_am`, `abgeschlossen`

### Includes

| Include | Resource | Felder |
|---------|----------|--------|
| projekt | ProjectResource | id, name, abkuerzung, beschreibung, farbe |

### POST -- Trackingnummer anlegen

**Content-Type: `application/json`**

| Feld | Pflicht | Beschreibung |
|------|---------|--------------|
| tracking | ja | Trackingnummer |
| internet | ja* | Internet-/Shopbestellnummer (*eins von internet/auftrag/lieferschein) |
| auftrag | ja* | Auftragsnummer (*eins von internet/auftrag/lieferschein) |
| lieferschein | ja* | Lieferscheinnummer (*eins von internet/auftrag/lieferschein) |
| gewicht | ja | Gewicht |
| anzahlpakete | ja | Anzahl Pakete (nur Ganzzahlen) |
| versendet_am | ja | Versanddatum (Format: YYYY-MM-DD) |

Es muss mindestens eines der Felder `internet`, `auftrag` oder `lieferschein` angegeben werden. Der Controller loest daraus die Auftragsdaten (adresse, lieferschein-ID, projekt, firma) automatisch auf. `abgeschlossen` wird automatisch auf `1` gesetzt.

### PUT -- Trackingnummer bearbeiten

Optionale Felder: `tracking`, `gewicht`, `versendet_am`, `anzahlpakete`, `internet`, `auftrag`, `lieferschein`. Mindestens ein Feld muss gesendet werden.

---

## 3. Aboartikel

**Basis-Pfad:** `/v1/aboartikel`
**DB-Tabelle:** `abrechnungsartikel`

### Endpunkte

| Methode | Pfad | Beschreibung | Permission |
|---------|------|--------------|------------|
| GET | `/v1/aboartikel` | Liste abrufen | `list_subscriptions` |
| GET | `/v1/aboartikel/{id}` | Einzelnen Aboartikel abrufen | `view_subscription` |
| POST | `/v1/aboartikel` | Aboartikel anlegen | `create_subscription` |
| PUT | `/v1/aboartikel/{id}` | Aboartikel bearbeiten | `edit_subscription` |
| DELETE | `/v1/aboartikel/{id}` | Aboartikel loeschen | `delete_subscription` |

### Felder (GET-Response)

| Feld | Quelle | Beschreibung |
|------|--------|--------------|
| id | aa.id | Aboartikel-ID |
| bezeichnung | aa.bezeichnung | Bezeichnung |
| beschreibung | aa.beschreibung | Beschreibung |
| beschreibung_ersetzen | aa.beschreibungersetzten | Beschreibung ersetzen (0/1) |
| startdatum | aa.startdatum | Startdatum |
| enddatum | aa.enddatum | Enddatum |
| abgerechnet_bis | aa.abgerechnetbis | Abgerechnet bis (Datum) |
| zahlzyklus | aa.zahlzyklus | Zahlzyklus |
| preis | aa.preis | Preis |
| rabatt | aa.rabatt | Rabatt |
| waehrung | aa.waehrung | Waehrung (3-Buchstaben-Code) |
| menge | aa.menge | Menge |
| preisart | aa.preisart | Preisart |
| dokumenttyp | aa.dokument | Dokumenttyp (rechnung/auftrag) |
| artikel | aa.artikel | Artikel-ID |
| gruppe | aa.gruppe | Gruppe-ID |
| adresse | aa.adresse | Adress-ID |
| kundennummer | ad.kundennummer | Kundennummer (aus Adresse) |
| reihenfolge | aa.sort | Sortierreihenfolge |
| projekt | aa.projekt | Projekt-ID |

### Input-Mapping (POST/PUT)

Einige API-Feldnamen werden intern auf andere DB-Spalten gemappt:

| API-Feld | DB-Spalte |
|----------|-----------|
| reihenfolge | sort |
| beschreibung_ersetzen | beschreibungersetzten |
| abgerechnet_bis | abgerechnetbis |
| dokumenttyp | dokument |

### Filter (Query-Parameter)

| Parameter | Operator | Beschreibung |
|-----------|----------|--------------|
| waehrung | = | Waehrung |
| preisart | = | Preisart |
| dokumenttyp | = | Dokumenttyp (rechnung/auftrag) |
| gruppe | = | Gruppe-ID |
| artikel | = | Artikel-ID |
| adresse | = | Adress-ID |
| kundennummer | = | Kundennummer |
| projekt | = | Projekt-ID |
| bezeichnung | %LIKE% | Bezeichnung (Teilstring) |
| bezeichnung_equals | = | Bezeichnung (exakt) |
| bezeichnung_startswith | LIKE% | Bezeichnung (Anfang) |
| bezeichnung_endswith | %LIKE | Bezeichnung (Ende) |
| rabatt | = | Rabatt (exakt) |
| rabatt_gt / rabatt_gte / rabatt_lt / rabatt_lte | >/>=/</<= | Rabatt (Vergleich) |
| preis | = | Preis (exakt) |
| preis_gt / preis_gte / preis_lt / preis_lte | >/>=/</<= | Preis (Vergleich) |
| menge | = | Menge (exakt) |
| menge_gt / menge_gte / menge_lt / menge_lte | >/>=/</<= | Menge (Vergleich) |
| startdatum | = | Startdatum (exakt) |
| startdatum_gt / startdatum_gte / startdatum_lt / startdatum_lte | >/>=/</<= | Startdatum (Vergleich) |
| enddatum | = | Enddatum (exakt) |
| enddatum_gt / enddatum_gte / enddatum_lt / enddatum_lte | >/>=/</<= | Enddatum (Vergleich) |
| abgerechnet_bis | = | Abgerechnet-bis (exakt) |
| abgerechnet_bis_gt / abgerechnet_bis_gte / abgerechnet_bis_lt / abgerechnet_bis_lte | >/>=/</<= | Abgerechnet-bis (Vergleich) |

### Sortierung

`bezeichnung`, `reihenfolge`, `rabatt`, `preis`, `menge`, `startdatum`, `enddatum`, `abgerechnet_bis`

### Validierung (POST/PUT)

| Feld | Regeln |
|------|--------|
| id | not_present |
| abgerechnet_bis | not_present |
| beschreibung_ersetzen | in: 1, 0 |
| startdatum | date:Y-m-d |
| enddatum | date:Y-m-d |
| zahlzyklus | numeric |
| preis | decimal |
| rabatt | decimal |
| menge | decimal |
| waehrung | upper, length:3 |
| preisart | in: monat, monatx, jahr, wochen, einmalig, 30tage, 360tage |
| dokumenttyp | in: rechnung, auftrag |
| projekt | numeric |
| artikel | numeric, muss in DB existieren |
| adresse | numeric |
| gruppe | numeric |
| reihenfolge | numeric |

### Includes

| Include | Resource | Felder |
|---------|----------|--------|
| artikel | ArticleResource | id, nummer, name_de, name_en |
| gruppe | ArticleSubscriptionGroupResource | id, bezeichnung, beschreibung, rabatt, gruppensumme, reihenfolge |
| adresse | AddressResource | id, typ, name, ansprechpartner, kundennummer |
| projekt | ProjectResource | id, name, abkuerzung, beschreibung, farbe |

### POST -- Aboartikel anlegen

**Content-Type: `application/json`**

| Feld | Pflicht | Default | Beschreibung |
|------|---------|---------|--------------|
| bezeichnung | ja | - | Bezeichnung |
| artikelnummer | ja* | - | Artikelnummer (*eins von artikelnummer/artikel) |
| artikel | ja* | - | Artikel-ID (*eins von artikelnummer/artikel) |
| kundennummer | nein | - | Kundennummer (wird in adresse-ID aufgeloest) |
| startdatum | nein | heute | Startdatum (YYYY-MM-DD) |
| zahlzyklus | nein | 1 | Zahlzyklus |
| dokumenttyp | nein | rechnung | Dokumenttyp (rechnung/auftrag) |
| preisart | nein | monat | Preisart |
| menge | nein | 0.00 | Menge |
| preis | nein | 0.00 | Preis |
| rabatt | nein | 0.00 | Rabatt |
| waehrung | nein | EUR | Waehrung |
| reihenfolge | nein | 1 | Sortierung |

Bei `artikelnummer` wird die Nummer intern in eine Artikel-ID aufgeloest. Bei `kundennummer` wird intern die Adress-ID ermittelt.

---

## 4. Abogruppen

**Basis-Pfad:** `/v1/abogruppen`
**DB-Tabelle:** `abrechnungsartikel_gruppe`

### Endpunkte

| Methode | Pfad | Beschreibung | Permission |
|---------|------|--------------|------------|
| GET | `/v1/abogruppen` | Liste abrufen | `list_subscription_groups` |
| GET | `/v1/abogruppen/{id}` | Einzelne Abogruppe abrufen | `view_subscription_group` |
| POST | `/v1/abogruppen` | Abogruppe anlegen | `create_subscription_group` |
| PUT | `/v1/abogruppen/{id}` | Abogruppe bearbeiten | `edit_subscription_group` |

**Kein DELETE** -- `deleteQuery()` gibt `false` zurueck, keine Route registriert.

### Felder (GET-Response)

| Feld | Quelle | Beschreibung |
|------|--------|--------------|
| id | g.id | Gruppe-ID |
| bezeichnung | g.beschreibung | Bezeichnung |
| beschreibung | g.beschreibung2 | Beschreibungstext |
| rabatt | g.rabatt | Rabatt |
| gruppensumme | g.gruppensumme | Gruppensumme (boolean) |
| projekt | g.projekt | Projekt-ID |
| reihenfolge | g.sort | Sortierreihenfolge |

**Hinweis:** Die Abfrage filtert auf `extrarechnung = 0` (Gemeinsame Rechnung).

### Input-Mapping (POST/PUT)

| API-Feld | DB-Spalte |
|----------|-----------|
| beschreibung | beschreibung2 |
| bezeichnung | beschreibung |
| reihenfolge | sort |

Beim Insert wird automatisch `extrarechnung = 0` gesetzt.

### Filter (Query-Parameter)

| Parameter | Operator | Beschreibung |
|-----------|----------|--------------|
| bezeichnung | %LIKE% | Bezeichnung (Teilstring) |
| bezeichnung_equals | = | Bezeichnung (exakt) |
| bezeichnung_startswith | LIKE% | Bezeichnung (Anfang) |
| bezeichnung_endswith | %LIKE | Bezeichnung (Ende) |
| gruppensumme | = | Gruppensumme-Flag |
| rabatt | = | Rabatt (exakt) |
| rabatt_gt / rabatt_gte / rabatt_lt / rabatt_lte | >/>=/</<= | Rabatt (Vergleich) |

### Sortierung

`bezeichnung`, `reihenfolge`, `rabatt`

### Validierung (POST/PUT)

| Feld | Regeln |
|------|--------|
| id | not_present |
| bezeichnung | required |
| rabatt | decimal |
| reihenfolge | numeric |
| projekt | numeric |
| gruppensumme | boolean |

### Includes

| Include | Resource | Felder |
|---------|----------|--------|
| projekt | ProjectResource | id, name, abkuerzung, beschreibung, farbe |

---

## 5. CRM-Dokumente

**Basis-Pfad:** `/v1/crmdokumente` (kein Unterstrich!)
**DB-Tabelle:** `dokumente`

### Endpunkte

| Methode | Pfad | Beschreibung | Permission |
|---------|------|--------------|------------|
| GET | `/v1/crmdokumente` | Liste abrufen | `list_crm_documents` |
| GET | `/v1/crmdokumente/{id}` | Einzelnes CRM-Dokument | `view_crm_document` |
| POST | `/v1/crmdokumente` | CRM-Dokument anlegen | `create_crm_document` |
| PUT | `/v1/crmdokumente/{id}` | CRM-Dokument bearbeiten | `edit_crm_document` |
| DELETE | `/v1/crmdokumente/{id}` | CRM-Dokument loeschen | `delete_crm_document` |

### Felder (GET-Response)

| Feld | Quelle | Beschreibung |
|------|--------|--------------|
| id | d.id | Dokument-ID |
| adresse_from | d.adresse_from | Absender-Adress-ID |
| adresse_to | d.adresse_to | Empfaenger-Adress-ID |
| typ | d.typ | Dokumenttyp |
| von | d.von | Absender (Text) |
| an | d.an | Empfaenger (Text) |
| email_an | d.email_an | E-Mail-Empfaenger |
| send_as | d.send_as | Senden als |
| email | d.email | E-Mail-Adresse |
| email_cc | d.email_cc | CC |
| email_bcc | d.email_bcc | BCC |
| bearbeiter | d.bearbeiter | Bearbeiter |
| firma_an | d.firma_an | Firma des Empfaengers |
| adresse | d.adresse | Adresszeile |
| ansprechpartner | d.ansprechpartner | Ansprechpartner |
| plz | d.plz | Postleitzahl |
| ort | d.ort | Ort |
| land | d.land | Land |
| datum | d.datum | Datum |
| uhrzeit | d.uhrzeit | Uhrzeit |
| betreff | d.betreff | Betreff |
| content | d.content | Inhalt |
| projekt | d.projekt | Projekt-ID |
| internebezeichnung | d.internebezeichnung | Interne Bezeichnung |
| signatur | d.signatur | Signatur-ID |
| fax | d.fax | Fax-Flag |
| sent | d.sent | Gesendet-Flag |
| printer | d.printer | Drucker-Flag |
| deleted | d.deleted | Geloescht-Flag |

### Filter (Query-Parameter)

| Parameter | Operator | Beschreibung |
|-----------|----------|--------------|
| typ | %LIKE% | Dokumenttyp (Teilstring) |
| typ_equals | = | Dokumenttyp (exakt) |
| typ_exakt | = | Dokumenttyp (exakt, Alias) |
| betreff | %LIKE% | Betreff (Teilstring) |
| betreff_equals | = | Betreff (exakt) |
| betreff_exakt | = | Betreff (exakt, Alias) |
| projekt | = | Projekt-ID |
| adresse_from | = | Absender-Adress-ID |
| adresse_to | = | Empfaenger-Adress-ID |
| deleted | = | Geloescht-Flag |

### Validierung (POST/PUT)

| Feld | Regeln |
|------|--------|
| id | not_present |
| typ | required, in: email, brief, telefon, notiz |
| betreff | required |
| projekt | numeric |
| adresse_from | numeric |
| adresse_to | numeric |
| signatur | numeric |
| fax | boolean |
| printer | boolean |
| sent | boolean |
| deleted | boolean |

### Includes

| Include | Resource | Felder |
|---------|----------|--------|
| projekt | ProjectResource | id, name, abkuerzung, beschreibung, farbe |
| adresse_to | AddressResource | id, name, email, strasse, plz, ort, land, ansprechpartner |
| adresse_from | AddressResource | id, name, email, strasse, plz, ort, land, ansprechpartner |

---

## 6. Lagerchargen

**Basis-Pfad:** `/v1/lagercharge`
**DB-Tabelle:** `lager_charge`

### Endpunkte

| Methode | Pfad | Beschreibung | Permission |
|---------|------|--------------|------------|
| GET | `/v1/lagercharge` | Liste abrufen | `view_storage_batch` |

**NUR LISTE** -- Kein GET by ID, kein POST, kein PUT, kein DELETE. Alle CRUD-Queries geben `false` zurueck. Auch `selectOneQuery()` gibt `false` zurueck.

### Felder (GET-Response)

| Feld | Quelle | Beschreibung |
|------|--------|--------------|
| artikel | lc.artikel | Artikel-ID |
| artikelnummer | a.nummer | Artikelnummer |
| lagerplatz | lc.lager_platz | Lagerplatz-ID |
| lagerplatzbezeichnung | lp.kurzbezeichnung | Lagerplatzbezeichnung |
| charge | lc.charge | Charge |
| datum | lc.datum | Datum |
| menge | (aggregiert) | Menge (SUM, gruppiert nach Artikel+Lagerplatz+Charge) |
| internebemerkung | lc.internebemerkung | Interne Bemerkung |

### Filter (Query-Parameter)

| Parameter | Operator | Beschreibung |
|-----------|----------|--------------|
| artikel | = | Artikel-ID |
| artikelnummer | %LIKE% | Artikelnummer (Teilstring) |
| artikelnummer_equals | = | Artikelnummer (exakt) |
| artikelnummer_startswith | LIKE% | Artikelnummer (Anfang) |
| artikelnummer_endswith | %LIKE | Artikelnummer (Ende) |
| lagerplatz | = | Lagerplatz-ID |
| lagerplatzbezeichnung | %LIKE% | Lagerplatzbezeichnung (Teilstring) |
| lagerplatzbezeichnung_equals | = | Lagerplatzbezeichnung (exakt) |
| lagerplatzbezeichnung_startswith | LIKE% | Lagerplatzbezeichnung (Anfang) |
| lagerplatzbezeichnung_endswith | %LIKE | Lagerplatzbezeichnung (Ende) |
| charge | %LIKE% | Charge (Teilstring) |
| charge_equals | = | Charge (exakt) |
| charge_startswith | LIKE% | Charge (Anfang) |
| charge_endswith | %LIKE | Charge (Ende) |
| datum | = | Datum (exakt) |
| datum_gt / datum_gte / datum_lt / datum_lte | >/>=/</<= | Datum (Vergleich) |

### Sortierung

`lagerplatzbezeichnung`, `artikelnummer`, `charge`, `datum`, `menge`

### Includes

| Include | Resource | Felder |
|---------|----------|--------|
| artikel | ArticleResource | id, nummer, name_de, name_en |
| lagerplatz | StorageLocationResource | id, lager (bezeichnung), kurzbezeichnung, autolagersperre, verbrauchslager, sperrlager, laenge, breite, hoehe, geloescht |

---

## 7. Lager-MHD

**Basis-Pfad:** `/v1/lagermhd`
**DB-Tabelle:** `lager_mindesthaltbarkeitsdatum`

### Endpunkte

| Methode | Pfad | Beschreibung | Permission |
|---------|------|--------------|------------|
| GET | `/v1/lagermhd` | Liste abrufen | `view_storage_best_before` |

**NUR LISTE** -- Kein GET by ID, kein POST, kein PUT, kein DELETE. Alle CRUD-Queries geben `false` zurueck. Auch `selectOneQuery()` gibt `false` zurueck.

### Felder (GET-Response)

| Feld | Quelle | Beschreibung |
|------|--------|--------------|
| artikel | lm.artikel | Artikel-ID |
| artikelnummer | a.nummer | Artikelnummer |
| lagerplatz | lm.lager_platz | Lagerplatz-ID |
| lagerplatzbezeichnung | lp.kurzbezeichnung | Lagerplatzbezeichnung |
| charge | lm.charge | Charge |
| mhddatum | lm.mhddatum | Mindesthaltbarkeitsdatum |
| datum | lm.datum | Datum |
| menge | (aggregiert) | Menge (SUM, gruppiert nach Artikel+MHD+Lagerplatz+Charge) |
| internebemerkung | lm.internebemerkung | Interne Bemerkung |

### Filter (Query-Parameter)

| Parameter | Operator | Beschreibung |
|-----------|----------|--------------|
| artikel | = | Artikel-ID |
| artikelnummer | %LIKE% | Artikelnummer (Teilstring) |
| artikelnummer_equals | = | Artikelnummer (exakt) |
| artikelnummer_startswith | LIKE% | Artikelnummer (Anfang) |
| artikelnummer_endswith | %LIKE | Artikelnummer (Ende) |
| lagerplatz | = | Lagerplatz-ID |
| lagerplatzbezeichnung | %LIKE% | Lagerplatzbezeichnung (Teilstring) |
| lagerplatzbezeichnung_equals | = | Lagerplatzbezeichnung (exakt) |
| lagerplatzbezeichnung_startswith | LIKE% | Lagerplatzbezeichnung (Anfang) |
| lagerplatzbezeichnung_endswith | %LIKE | Lagerplatzbezeichnung (Ende) |
| charge | %LIKE% | Charge (Teilstring) |
| charge_equals | = | Charge (exakt) |
| charge_startswith | LIKE% | Charge (Anfang) |
| charge_endswith | %LIKE | Charge (Ende) |
| mhddatum | = | MHD (exakt) |
| mhddatum_gt / mhddatum_gte / mhddatum_lt / mhddatum_lte | >/>=/</<= | MHD (Vergleich) |
| datum | = | Datum (exakt) |
| datum_gt / datum_gte / datum_lt / datum_lte | >/>=/</<= | Datum (Vergleich) |

### Sortierung

`lagerplatzbezeichnung`, `artikelnummer`, `charge`, `mhddatum`, `datum`, `menge`

### Includes

| Include | Resource | Felder |
|---------|----------|--------|
| artikel | ArticleResource | id, nummer, name_de, name_en |
| lagerplatz | StorageLocationResource | id, lager (bezeichnung), kurzbezeichnung, autolagersperre, verbrauchslager, sperrlager, laenge, breite, hoehe, geloescht |

---

## 8. Reports

**Basis-Pfad:** `/v1/reports`
**Kein eigenes Resource-Objekt** -- spezieller Controller (ReportsController).

### Endpunkte

| Methode | Pfad | Beschreibung | Permission |
|---------|------|--------------|------------|
| GET | `/v1/reports/{id}/download` | Report als Datei herunterladen | `view_report` |

**NUR DOWNLOAD** -- Keine Liste, kein Create, kein Update, kein Delete.

### Zugriffskontrolle

Der Controller prueft die Report-Transferoptionen:
- `api_active` muss gesetzt und != 0 sein
- `api_account_id` muss mit dem authentifizierten API-Account uebereinstimmen
- Bei fehlender Berechtigung: HTTP 403 Forbidden

### Ausgabeformate

Das Format wird durch `api_format` in den Transferoptionen bestimmt (nicht per Query-Parameter):
- **csv** -- CSV-Export
- **pdf** -- PDF-Export

Es gibt **kein JSON-Format** -- die Antwort ist immer ein Datei-Download mit `Content-Disposition: attachment`.

### Query-Parameter

Beliebige Query-Parameter werden als Report-Parameter an den Exporter weitergereicht.

---

## 9. Dokumenten-Scanner

**Basis-Pfad:** `/v1/docscan`
**DB-Tabelle:** `docscan` (verknuepft mit `datei`, `datei_version`)

### Endpunkte

| Methode | Pfad | Beschreibung | Permission |
|---------|------|--------------|------------|
| GET | `/v1/docscan` | Liste abrufen | `list_scanned_documents` |
| GET | `/v1/docscan/{id}` | Einzelnes gescanntes Dokument | `view_scanned_document` |
| POST | `/v1/docscan` | Dokument hochladen/scannen | `create_scanned_document` |

**Kein PUT, kein DELETE** -- `updateAction()` wirft ResourceNotFoundException. `insertQuery()`, `updateQuery()`, `deleteQuery()` geben `false` zurueck.

### Felder (GET-Response)

| Feld | Quelle | Beschreibung |
|------|--------|--------------|
| id | d.id | Datei-ID |
| docscan_id | doc.id | DocScan-ID |
| titel | d.titel | Titel |
| beschreibung | d.beschreibung | Beschreibung |
| nummer | d.nummer | Nummer |
| firma | d.firma | Firma-ID |
| ersteller | dv.ersteller | Ersteller |
| datum | dv.datum | Datum |
| version | dv.version | Version |
| dateiname | dv.dateiname | Dateiname |
| bemerkung | dv.bemerkung | Bemerkung |
| size | dv.size | Dateigroesse |
| mimetype | (berechnet) | MIME-Type (nur bei GET by id) |
| links.download | (berechnet) | Download-URL via /v1/dateien/{id}/download (nur bei GET by id) |
| links.base64 | (berechnet) | Base64-URL via /v1/dateien/{id}/base64 (nur bei GET by id) |

### Filter (Query-Parameter)

| Parameter | Operator | Beschreibung |
|-----------|----------|--------------|
| titel | %LIKE% | Titel (Teilstring) |
| titel_equals | = | Titel (exakt) |
| titel_startswith | LIKE% | Titel (Anfang) |
| titel_endswith | %LIKE | Titel (Ende) |
| dateiname | %LIKE% | Dateiname (Teilstring) |
| dateiname_equals | = | Dateiname (exakt) |
| dateiname_startswith | LIKE% | Dateiname (Anfang) |
| dateiname_endswith | %LIKE | Dateiname (Ende) |
| datum | = | Datum (exakt) |
| datum_gt / datum_gte / datum_lt / datum_lte | >/>=/</<= | Datum (Vergleich) |
| belegtyp | %LIKE% | Belegtyp (Teilstring) |
| stichwort | %LIKE% | Stichwort (Teilstring) |
| firma | = | Firma-ID |

### Sortierung

`titel`, `dateiname`, `datum`

### Includes

| Include | Resource | Felder |
|---------|----------|--------|
| metadata | DocumentScannerMetaDataResource | meta_key, meta_value |
| stichwoerter | FileKeywordResource | id, stichwort (subjekt), belegtyp (objekt), beleg_id (parameter), sort |

### POST -- Dokument hochladen

**Content-Type: `application/x-www-form-urlencoded` oder `multipart/form-data`**

| Feld | Pflicht | Beschreibung |
|------|---------|--------------|
| dateiname | ja | Dateiname (z.B. "scan.pdf") |
| titel | ja | Titel des Dokuments |
| file_content | ja | Dateiinhalt (Base64 bei urlencoded, oder Datei bei multipart) |
| beschreibung | nein | Optionaler Beschreibungstext |
| meta | nein | Objekt mit Meta-Daten (siehe unten) |

### Meta-Daten

Das `meta`-Feld ist ein assoziatives Array. Nur folgende Keys sind erlaubt:

| Meta-Key | Typ | Validierung |
|----------|-----|-------------|
| invoice_number | string | Max. 32 Zeichen |
| invoice_date | string | Format YYYY-MM-DD, valides Datum |
| invoice_amount | string | Nur Ziffern und Punkt (z.B. "123.45") |
| invoice_tax | string | Nur Ziffern und Punkt (z.B. "19.00") |
| invoice_currency | string | Exakt 3 Grossbuchstaben (z.B. "EUR") |

Numerische Keys sind nicht erlaubt. Keys mit anderen Zeichen als a-z, 0-9, Unterstrich werden abgelehnt. Jeder Wert max. 32 Zeichen.

Die Datei wird intern als `datei` angelegt, in der `docscan`-Tabelle verknuepft und mit dem Stichwort "Sonstige" / Objekt "DocScan" versehen.

---

## 10. Wiedervorlagen

**Basis-Pfad:** `/v1/wiedervorlagen`
**DB-Tabelle:** `wiedervorlage`

### Endpunkte

| Methode | Pfad | Beschreibung | Permission |
|---------|------|--------------|------------|
| GET | `/v1/wiedervorlagen` | Liste abrufen | `list_resubmissions` |
| GET | `/v1/wiedervorlagen/{id}` | Einzelne Wiedervorlage | `view_resubmission` |
| POST | `/v1/wiedervorlagen` | Wiedervorlage anlegen | `create_resubmission` |
| PUT | `/v1/wiedervorlagen/{id}` | Wiedervorlage bearbeiten | `edit_resubmission` |

**Kein DELETE** -- `deleteQuery()` gibt `false` zurueck, keine Route registriert.

### Felder (GET-Response)

| Feld | Quelle | Beschreibung |
|------|--------|--------------|
| id | w.id | Wiedervorlage-ID |
| adresse | w.adresse | Adress-ID |
| projekt | w.projekt | Projekt-ID |
| bezeichnung | w.bezeichnung | Bezeichnung |
| beschreibung | w.beschreibung | Beschreibungstext |
| betrag | w.betrag | Betrag |
| erinnerung_per_mail | w.erinnerung_per_mail | E-Mail-Erinnerung (0/1) |
| bearbeiter | w.bearbeiter | Bearbeiter-Adress-ID |
| adresse_mitarbeiter | w.adresse_mitarbeiter | Mitarbeiter-Adress-ID |
| datum_angelegt | w.datum_angelegt | Anlagedatum |
| zeit_angelegt | w.zeit_angelegt | Anlagezeit |
| datum_erinnerung | w.datum_erinnerung | Erinnerungsdatum |
| zeit_erinnerung | w.zeit_erinnerung | Erinnerungszeit |
| datum_abschluss | w.datum_abschluss | Abschlussdatum |
| oeffentlich | w.oeffentlich | Oeffentlich-Flag (0/1) |
| abgeschlossen | w.abgeschlossen | Abgeschlossen-Flag (0/1) |
| chance | w.chance | Chance (0-100) |
| prio | w.prio | Prioritaet (0/1) |
| stages | w.stages | Stages-ID |
| color | w.color | Farbe |
| id_ext | am.id_ext | Externe ID (aus api_mapping) |

### Filter (Query-Parameter)

| Parameter | Operator | Beschreibung |
|-----------|----------|--------------|
| adresse | = | Adress-ID |
| bearbeiter | = | Bearbeiter-Adress-ID |
| adresse_mitarbeiter | = | Mitarbeiter-Adress-ID |
| projekt | = | Projekt-ID |
| stages | = | Stages-ID |
| id_ext | = | Externe ID (aus api_mapping) |

### Sortierung

`datum_angelegt`, `zeit_angelegt`, `datum_erinnerung`, `zeit_erinnerung`, `datum_abschluss`, `bezeichnung`, `stages`, `prio`

### Validierung (POST/PUT)

| Feld | Regeln |
|------|--------|
| id | not_present |
| id_ext | not_present |
| datum_angelegt | date:Y-m-d |
| zeit_angelegt | time:H:i:s |
| datum_erinnerung | **required**, date:Y-m-d |
| zeit_erinnerung | **required**, time:H:i:s |
| datum_abschluss | date:Y-m-d |
| bezeichnung | **required**, min:3 |
| beschreibung | min:3 |
| bearbeiter | numeric, muss in adresse existieren |
| adresse_mitarbeiter | numeric, muss in adresse existieren |
| projekt | numeric, muss in projekt existieren |
| stages | numeric, muss in wiedervorlage_stages existieren |
| betrag | decimal |
| chance | integer, between:0,100 |
| erinnerung_per_mail | in: 0, 1 |
| abgeschlossen | in: 0, 1 |
| oeffentlich | in: 0, 1 |
| prio | in: 0, 1 |

---

## 11. Nur als Include verfuegbar

Die folgenden Resources existieren nur als Include-Daten innerhalb anderer Endpunkte. Sie haben keine eigenen API-Routen.

### FileKeywordResource

Stichwoerter zu Dateien. Verwendet in: Dateien (`stichwoerter`), DocScan (`stichwoerter`).

Felder: `id`, `stichwort` (subjekt), `belegtyp` (objekt), `beleg_id` (parameter), `sort`

### DocumentScannerMetaDataResource

Metadaten zu gescannten Dokumenten. Verwendet in: DocScan (`metadata`).

Felder: `meta_key`, `meta_value`

### ProjectResource

Projekt-Include. Verwendet in: Trackingnummern, Aboartikel, Abogruppen, CRM-Dokumente, Wiedervorlagen (ueber andere Endpunkte).

Felder: `id`, `name`, `abkuerzung`, `beschreibung`, `farbe`

### AddressResource

Adress-Include. Verwendet in: Aboartikel (`adresse`), CRM-Dokumente (`adresse_from`, `adresse_to`).

Felder variieren je nach Kontext (siehe jeweilige Include-Tabelle).

### ArticleResource

Artikel-Include. Verwendet in: Aboartikel (`artikel`), Lagerchargen (`artikel`), Lager-MHD (`artikel`).

Felder: `id`, `nummer`, `name_de`, `name_en`

### StorageLocationResource

Lagerplatz-Include. Verwendet in: Lagerchargen (`lagerplatz`), Lager-MHD (`lagerplatz`).

Felder: `id`, `lager` (bezeichnung), `kurzbezeichnung`, `autolagersperre`, `verbrauchslager`, `sperrlager`, `laenge`, `breite`, `hoehe`, `geloescht`

---

## Live Instance Compatibility

Getestet am 2026-03-31 gegen eine laufende OpenXE-Instanz.

| Endpoint | Status | Notes |
|----------|--------|-------|
| /v1/dateien | OK | 2 files returned |
| /v1/trackingnummern | 404 | Not registered |
| /v1/aboartikel | 404 | Not registered |
| /v1/abogruppen | 404 | Not registered |
| /v1/crmdokumente | 404 | Not registered |
| /v1/lagercharge | 404 | Not registered |
| /v1/lagermhd | 404 | Not registered |
| /v1/docscan | 404 | Not registered |
| /v1/wiedervorlagen | 404 | Not registered |
| /v1/reports/{id}/download | 404 | No report found (may work with valid ID) |

> **Hinweis:** Viele Endpunkte existieren im Quellcode, sind aber in `ApiApplication.php` dieser Version nicht registriert. Nur `/v1/dateien` ist aktiv und funktionsfaehig.
