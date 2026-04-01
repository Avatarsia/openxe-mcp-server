# OpenXE Legacy API - Complete Reference

**Source:** `www/pages/api.php` (verified against source code)
**Controller:** `classes/Modules/Api/Controller/Legacy/DefaultController.php`
**Pattern:** `POST /api/{ActionName}`
**Authentication:** HTTP Digest Authentication
**Permission:** `standard_{lowercase_actionname}` (auto-derived)
**Total Endpoints:** 120 registered ActionHandlers (verified by source grep)

---

## How the Legacy API Works

1. Client sends `POST /api/{ActionName}` with JSON or XML body
2. `DefaultController::postAction()` resolves the action name
3. Two hardcoded mappings exist:
   - `AccountCreate` -> `ApiAdresseAccountCreate`
   - `AccountEdit` -> `ApiAdresseAccountEdit`
4. All other actions call `Api{ActionName}()` on the `\Api` class
5. Permission check: `standard_{lowercase(actionname)}` looked up in `api_account.permissions` JSON column

### Request Format

```http
POST /api/{ActionName}
Content-Type: application/json
Authorization: Digest ...

{
  "data": {
    "field1": "value1",
    "field2": "value2"
  }
}
```

### Response Format

```json
{
  "success": true,
  "data": { ... }
}
```

Error:
```json
{
  "success": false,
  "error": "Error message",
  "code": 1001
}
```

---

## Endpoint Categories

### 1. Addresses (Adressen) - 11 endpoints

| # | Action | Permission | Source Line | Description |
|---|--------|------------|-------------|-------------|
| 1 | `AdresseCreate` | `standard_adressecreate` | L8482 | Create address/customer |
| 2 | `AdresseEdit` | `standard_adresseedit` | L8628 | Edit address |
| 3 | `AdresseGet` | `standard_adresseget` | L8827 | Get single address |
| 4 | `AdresseListeGet` | `standard_adresselisteget` | L11163 | List addresses with filters |
| 5 | `AdresseGruppenList` | `standard_adressegruppenlist` | L3002 | List address groups |
| 6 | `AdresseAccountsGet` | `standard_adresseaccountsget` | L12246 | Get accounts for an address |
| 7 | `AdresseAccountCreate` | `standard_adresseaccountcreate` | L12267 | Create account for address |
| 8 | `AdresseAccountEdit` | `standard_adresseaccountedit` | L12281 | Edit account for address |
| 9 | `AdresseKontaktCreate` | `standard_adressekontaktcreate` | L11021 | Create contact for address |
| 10 | `AdresseKontaktEdit` | `standard_adressekontaktedit` | L11065 | Edit contact for address |
| 11 | `AdresseKontaktList` | `standard_adressekontaktlist` | L11095 | List contacts for address |
| 12 | `AdresseKontaktGet` | `standard_adressekontaktget` | L11142 | Get contact details |

**Mapped aliases:**
- `AccountCreate` -> `AdresseAccountCreate` (via `DefaultController` mapping)
- `AccountEdit` -> `AdresseAccountEdit` (via `DefaultController` mapping)

```bash
# Create address
curl --digest -u "api:secret" -X POST https://example.com/api/AdresseCreate \
  -H "Content-Type: application/json" \
  -d '{"data": {"typ": "kunde", "name": "Musterfirma GmbH", "strasse": "Hauptstr. 1", "plz": "12345", "ort": "Berlin"}}'

# Get address
curl --digest -u "api:secret" -X POST https://example.com/api/AdresseGet \
  -H "Content-Type: application/json" \
  -d '{"data": {"id": 42}}'
```

---

### 2. Accounts & Authentication - 3 endpoints

| # | Action | Permission | Source Line | Description |
|---|--------|------------|-------------|-------------|
| 1 | `AccountLogin` | `standard_accountlogin` | L2301 | Login to account |
| 2 | `AccountCreate` | mapped | L12267 | Alias for AdresseAccountCreate |
| 3 | `AccountEdit` | mapped | L12281 | Alias for AdresseAccountEdit |
| 4 | `AccountList` | `standard_accountlist` | L3041 | List API accounts |

---

### 3. Contact Persons (Ansprechpartner) - 2 endpoints

| # | Action | Permission | Source Line | Description |
|---|--------|------------|-------------|-------------|
| 1 | `AnsprechpartnerCreate` | `standard_ansprechpartnercreate` | L1352 | Create contact person |
| 2 | `AnsprechpartnerEdit` | `standard_ansprechpartneredit` | L1364 | Edit contact person |

---

### 4. Articles (Artikel) - 7 endpoints

| # | Action | Permission | Source Line | Description |
|---|--------|------------|-------------|-------------|
| 1 | `ArtikelCreate` | `standard_artikelcreate` | L10258 | Create article |
| 2 | `ArtikelEdit` | `standard_artikeledit` | L10507 | Edit article |
| 3 | `ArtikelGet` | `standard_artikelget` | L10780 | Get article details |
| 4 | `ArtikelList` | `standard_artikellist` | L11937 | List articles with filters |
| 5 | `ArtikelkategorienList` | `standard_artikelkategorienlist` | L1965 | List article categories |
| 6 | `ArtikelkontingenteGet` | `standard_artikelkontingenteget` | L12319 | Get article quotas/contingents |
| 7 | `PreiseEdit` | `standard_preiseedit` | L10940 | Edit article prices |

```bash
# Get article
curl --digest -u "api:secret" -X POST https://example.com/api/ArtikelGet \
  -H "Content-Type: application/json" \
  -d '{"data": {"id": 100}}'
```

---

### 5. Bill of Materials (Stueckliste) - 4 endpoints

| # | Action | Permission | Source Line | Description |
|---|--------|------------|-------------|-------------|
| 1 | `ArtikelStuecklisteCreate` | `standard_artikelstuecklistecreate` | L1810 | Create BOM entry |
| 2 | `ArtikelStuecklisteEdit` | `standard_artikelstuecklisteedit` | L1881 | Edit BOM entry |
| 3 | `ArtikelStuecklisteList` | `standard_artikelstuecklistelist` | L1888 | List BOM entries |
| 4 | `ArtikelStueckliste` | `standard_artikelstueckliste` | L12078 | Get full BOM for article |

---

### 6. Quotes (Angebote) - 7 endpoints

| # | Action | Permission | Source Line | Description |
|---|--------|------------|-------------|-------------|
| 1 | `AngebotCreate` | `standard_angebotcreate` | L8870 | Create quote |
| 2 | `AngebotEdit` | `standard_angebotedit` | L9718 | Edit quote |
| 3 | `AngebotGet` | `standard_angebotget` | L10126 | Get quote details |
| 4 | `AngebotFreigabe` | `standard_angebotfreigabe` | L9448 | Release/approve quote |
| 5 | `AngebotVersenden` | `standard_angebotversenden` | L9086 | Send quote (email/PDF) |
| 6 | `AngebotArchivieren` | `standard_angebotarchivieren` | L9152 | Archive quote |
| 7 | `AngebotZuAuftrag` | `standard_angebotzuauftrag` | L9685 | Convert quote to sales order |

```bash
# Create quote
curl --digest -u "api:secret" -X POST https://example.com/api/AngebotCreate \
  -H "Content-Type: application/json" \
  -d '{"data": {"adresse": 42, "datum": "2025-12-28", "positionen": [{"artikel": 100, "menge": 2, "preis": 99.90}]}}'
```

---

### 7. Sales Orders (Auftraege) - 9 endpoints

| # | Action | Permission | Source Line | Description |
|---|--------|------------|-------------|-------------|
| 1 | `AuftragCreate` | `standard_auftragcreate` | L8875 | Create sales order |
| 2 | `AuftragEdit` | `standard_auftragedit` | L9723 | Edit sales order |
| 3 | `AuftragGet` | `standard_auftragget` | L10131 | Get sales order |
| 4 | `AuftragFreigabe` | `standard_auftragfreigabe` | L9536 | Release order |
| 5 | `AuftragVersenden` | `standard_auftragversenden` | L9075 | Send order confirmation |
| 6 | `AuftragArchivieren` | `standard_auftragarchivieren` | L9130 | Archive order |
| 7 | `AuftragAbschliessen` | `standard_auftragabschliessen` | L9400 | Complete/close order |
| 8 | `AuftragZuRechnung` | `standard_auftragzurechnung` | L9652 | Convert order to invoice |
| 9 | `WeiterfuehrenAuftragZuRechnung` | `standard_weiterfuehrenauftragzurechnung` | L9332 | Continue order->invoice workflow |

---

### 8. Invoices (Rechnungen) - 8 endpoints

| # | Action | Permission | Source Line | Description |
|---|--------|------------|-------------|-------------|
| 1 | `RechnungCreate` | `standard_rechnungcreate` | L10237 | Create invoice |
| 2 | `RechnungEdit` | `standard_rechnungedit` | L10232 | Edit invoice |
| 3 | `RechnungGet` | `standard_rechnungget` | L10227 | Get invoice |
| 4 | `RechnungFreigabe` | `standard_rechnungfreigabe` | L9496 | Release invoice |
| 5 | `RechnungVersenden` | `standard_rechnungversenden` | L9064 | Send invoice |
| 6 | `RechnungArchivieren` | `standard_rechnungarchivieren` | L9141 | Archive invoice |
| 7 | `RechnungVersendetMarkieren` | `standard_rechnungversendetmarkieren` | L9363 | Mark invoice as sent |
| 8 | `RechnungAlsBezahltMarkieren` | `standard_rechnungalsbezahltmarkieren` | L9424 | Mark invoice as paid |

---

### 9. Delivery Notes (Lieferscheine) - 6 endpoints

| # | Action | Permission | Source Line | Description |
|---|--------|------------|-------------|-------------|
| 1 | `LieferscheinCreate` | `standard_lieferscheincreate` | L10207 | Create delivery note |
| 2 | `LieferscheinEdit` | `standard_lieferscheinedit` | L10202 | Edit delivery note |
| 3 | `LieferscheinGet` | `standard_lieferscheinget` | L10197 | Get delivery note |
| 4 | `LieferscheinFreigabe` | `standard_lieferscheinfreigabe` | L9561 | Release delivery note |
| 5 | `LieferscheinVersenden` | `standard_lieferscheinversenden` | L9108 | Send delivery note |
| 6 | `LieferscheinArchivieren` | `standard_lieferscheinarchivieren` | L9163 | Archive delivery note |

---

### 10. Credit Notes (Gutschriften) - 6 endpoints

| # | Action | Permission | Source Line | Description |
|---|--------|------------|-------------|-------------|
| 1 | `GutschriftCreate` | `standard_gutschriftcreate` | L10192 | Create credit note |
| 2 | `GutschriftEdit` | `standard_gutschriftedit` | L10187 | Edit credit note |
| 3 | `GutschriftGet` | `standard_gutschriftget` | L10182 | Get credit note |
| 4 | `GutschriftFreigabe` | `standard_gutschriftfreigabe` | L9040 | Release credit note |
| 5 | `GutschriftVersenden` | `standard_gutschriftversenden` | L9097 | Send credit note |
| 6 | `GutschriftArchivieren` | `standard_gutschriftarchivieren` | L9174 | Archive credit note |
| 7 | `WeiterfuehrenRechnungZuGutschrift` | `standard_weiterfuehrenrechnungzugutschrift` | L9303 | Continue invoice->credit workflow |

---

### 11. Returns (Retouren) - 3 endpoints

| # | Action | Permission | Source Line | Description |
|---|--------|------------|-------------|-------------|
| 1 | `RetoureCreate` | `standard_retourecreate` | L10222 | Create return |
| 2 | `RetoureEdit` | `standard_retoureedit` | L10217 | Edit return |
| 3 | `RetoureGet` | `standard_retoureget` | L10212 | Get return details |

---

### 12. Purchase Orders (Bestellungen) - 4 endpoints

| # | Action | Permission | Source Line | Description |
|---|--------|------------|-------------|-------------|
| 1 | `BestellungCreate` | `standard_bestellungcreate` | L10252 | Create purchase order |
| 2 | `BestellungEdit` | `standard_bestellungedit` | L10247 | Edit purchase order |
| 3 | `BestellungGet` | `standard_bestellungget` | L10242 | Get purchase order |
| 4 | `BestellungFreigabe` | `standard_bestellungfreigabe` | L9472 | Release purchase order |

---

### 13. Documents (Belege) - Generic - 4 endpoints

| # | Action | Permission | Source Line | Description |
|---|--------|------------|-------------|-------------|
| 1 | `BelegeList` | `standard_belegelist` | L2451 | List all document types |
| 2 | `BelegPDF` | `standard_belegpdf` | L2090 | Get document as PDF |
| 3 | `BelegPDFHeader` | `standard_belegpdfheader` | L2056 | Get PDF header info |
| 4 | `BelegOhnePositionenList` | `standard_belegohnepositionenlist` | L2327 | INTERNAL ONLY -- not a registered ActionHandler, called internally by other endpoints |

```bash
# Get PDF for invoice
curl --digest -u "api:secret" -X POST https://example.com/api/BelegPDF \
  -H "Content-Type: application/json" \
  -d '{"data": {"beleg": "rechnung", "id": 42}}'
```

---

### 14. Projects (Projekte) - 4 endpoints

| # | Action | Permission | Source Line | Description |
|---|--------|------------|-------------|-------------|
| 1 | `ProjektCreate` | `standard_projektcreate` | L1225 | Create project |
| 2 | `ProjektEdit` | `standard_projektedit` | L1250 | Edit project |
| 3 | `ProjektGet` | `standard_projektget` | L1315 | Get project |
| 4 | `ProjektListe` | `standard_projektliste` | L1285 | List projects |

---

### 15. Subscriptions (Abo-Artikel) - 8 endpoints

| # | Action | Permission | Source Line | Description |
|---|--------|------------|-------------|-------------|
| 1 | `AdresseAboArtikelCreate` | `standard_adresseaboartikelcreate` | L1417 | Create article subscription |
| 2 | `AdresseAboArtikelEdit` | `standard_adresseaboartikeledit` | L1430 | Edit article subscription |
| 3 | `AdresseAboArtikelGet` | `standard_adresseaboartikelget` | L1543 | Get subscription details |
| 4 | `AdresseAboArtikelList` | `standard_adresseaboartikellist` | L1593 | List subscriptions |
| 5 | `AdresseAboGruppeCreate` | `standard_adresseabogruppecreate` | L1643 | Create subscription group |
| 6 | `AdresseAboGruppeEdit` | `standard_adresseabogruppeedit` | L1689 | Edit subscription group |
| 7 | `AdresseAboGruppeGet` | `standard_adresseabogruppeget` | L1723 | Get subscription group |
| 8 | `AdresseAboGruppeList` | `standard_adresseabogruppelist` | L1758 | List subscription groups |

---

### 16. Delivery Addresses (Lieferadressen) - 2 endpoints

| # | Action | Permission | Source Line | Description |
|---|--------|------------|-------------|-------------|
| 1 | `LieferadresseCreate` | `standard_lieferadressecreate` | L1384 | Create delivery address |
| 2 | `LieferadresseEdit` | `standard_lieferadresseedit` | L1396 | Edit delivery address |

---

### 17. Groups (Gruppen) - 4 endpoints

| # | Action | Permission | Source Line | Description |
|---|--------|------------|-------------|-------------|
| 1 | `GruppeCreate` | `standard_gruppecreate` | L11793 | Create group |
| 2 | `GruppeEdit` | `standard_gruppeedit` | L11810 | Edit group |
| 3 | `GruppeGet` | `standard_gruppeget` | L11851 | Get group |
| 4 | `GruppenList` | `standard_gruppenlist` | L2979 | List groups |

---

### 18. Users (Benutzer) - 5 endpoints

| # | Action | Permission | Source Line | Description |
|---|--------|------------|-------------|-------------|
| 1 | `BenutzerCreate` | `standard_benutzercreate` | L10822 | Create user |
| 2 | `BenutzerEdit` | `standard_benutzeredit` | L10874 | Edit user |
| 3 | `BenutzerGet` | `standard_benutzerget` | L10917 | Get user details |
| 4 | `BenutzerList` | `standard_benutzerlist` | L957 | List users |
| 5 | `BenutzerGetRFID` | `standard_benutzergetrfid` | L939 | Get user by RFID tag |

---

### 19. Time Tracking (Zeiterfassung) - 7 endpoints

| # | Action | Permission | Source Line | Description |
|---|--------|------------|-------------|-------------|
| 1 | `ZeiterfassungCreate` | `standard_zeiterfassungcreate` | L7883 | Create time entry |
| 2 | `ZeiterfassungEdit` | `standard_zeiterfassungedit` | L7819 | Edit time entry |
| 3 | `ZeiterfassungDelete` | `standard_zeiterfassungdelete` | L7865 | Delete time entry |
| 4 | `ZeiterfassungGet` | `standard_zeiterfassungget` | L7902 | Get time entry |
| 5 | `StechuhrStatusGet` | `standard_stechuhrstatusget` | L1086 | Get time clock status |
| 6 | `StechuhrStatusSet` | `standard_stechuhrstatusset` | L1115 | Set time clock (punch in/out) |
| 7 | `StechuhrSummary` | `standard_stechuhrsummary` | L984 | Get time summary |

```bash
# Clock in
curl --digest -u "api:secret" -X POST https://example.com/api/StechuhrStatusSet \
  -H "Content-Type: application/json" \
  -d '{"data": {"cmd": "kommen", "user": 1, "adresse": 42}}'
```

---

### 20. Travel Expenses (Reisekosten) - 1 endpoint

| # | Action | Permission | Source Line | Description |
|---|--------|------------|-------------|-------------|
| 1 | `ReisekostenVersenden` | `standard_reisekostenversenden` | L9119 | Send travel expense report |

---

### 21. Sessions - 2 endpoints

| # | Action | Permission | Source Line | Description |
|---|--------|------------|-------------|-------------|
| 1 | `SessionStart` | `standard_sessionstart` | L10988 | Start API session |
| 2 | `SessionClose` | `standard_sessionclose` | L11007 | Close API session |

---

### 22. Files (Dateien) - 4 endpoints

| # | Action | Permission | Source Line | Description |
|---|--------|------------|-------------|-------------|
| 1 | `DateiDownload` | `standard_dateidownload` | L2124 | Download file by ID |
| 2 | `DateiVorschau` | `standard_dateivorschau` | L2137 | Preview file |
| 3 | `DateiList` | `standard_dateilist` | L2274 | List files |
| 4 | `DateiHeader` | `standard_dateiheader` | L2015 | Get file metadata/headers |
| 5 | `shopimages` | `standard_shopimages` | L11873 | Get shop product images |

---

### 23. Mapping - 2 endpoints

| # | Action | Permission | Source Line | Description |
|---|--------|------------|-------------|-------------|
| 1 | `MappingGet` | `standard_mappingget` | L3081 | Get field mapping |
| 2 | `MappingSet` | `standard_mappingset` | L3145 | Set field mapping |

---

### 24. Reports & Export - 2 endpoints

| # | Action | Permission | Source Line | Description |
|---|--------|------------|-------------|-------------|
| 1 | `BerichteGet` | `standard_berichteget` | L11920 | Get/run report |
| 2 | `ExportVorlageGet` | `standard_exportvorlageget` | L11889 | Get export template |

---

### 25. System & Utilities - 3 endpoints

| # | Action | Permission | Source Line | Description |
|---|--------|------------|-------------|-------------|
| 1 | `ServerTimeGet` | `standard_servertimeget` | L932 | Get current server time |
| 2 | `Etikettendrucker` | `standard_etikettendrucker` | L9615 | Label printer operations |
| 3 | `ApiXMLTest` | (none) | L831 | Test XML parsing |
| 4 | `DataToXML` | (none) | L3444 | INTERNAL ONLY -- not a registered ActionHandler, called internally by other endpoints |

```bash
# Get server time
curl --digest -u "api:secret" -X POST https://example.com/api/ServerTimeGet \
  -H "Content-Type: application/json" \
  -d '{"data": {}}'
```

---

### 26. Custom Integration - 1 endpoint

| # | Action | Permission | Source Line | Description |
|---|--------|------------|-------------|-------------|
| 1 | `Custom` | `standard_custom` | L2263 | Custom API endpoint for extensions |

---

## Internal Dispatcher Methods

These are internal methods in `api.php` that are called by the typed endpoints above. They are not directly exposed as separate API actions but handle shared logic:

| Method | Source Line | Purpose |
|--------|-------------|---------|
| `BelegCreate` | L8879 | Generic document create (dispatches to Auftrag/Rechnung/etc.) |
| `BelegEdit` | L9728 | Generic document edit |
| `BelegGet` | L10139 | Generic document get |
| `BelegFreiabe` | L9585 | Generic document release (note: typo in source) |
| `BelegVersenden` | L9255 | Generic document send |
| `BelegArchivieren` | L9186 | Generic document archive |

---

## Complete Alphabetical Endpoint Index

122 entries listed: 120 registered ActionHandlers + 2 internal methods (`BelegOhnePositionenList`, `DataToXML`) included for completeness.

| # | Action Name | Category |
|---|-------------|----------|
| 1 | `AccountLogin` | Authentication |
| 2 | `AccountList` | Authentication |
| 3 | `AdresseAboArtikelCreate` | Subscriptions |
| 4 | `AdresseAboArtikelEdit` | Subscriptions |
| 5 | `AdresseAboArtikelGet` | Subscriptions |
| 6 | `AdresseAboArtikelList` | Subscriptions |
| 7 | `AdresseAboGruppeCreate` | Subscriptions |
| 8 | `AdresseAboGruppeEdit` | Subscriptions |
| 9 | `AdresseAboGruppeGet` | Subscriptions |
| 10 | `AdresseAboGruppeList` | Subscriptions |
| 11 | `AdresseAccountCreate` | Addresses |
| 12 | `AdresseAccountEdit` | Addresses |
| 13 | `AdresseAccountsGet` | Addresses |
| 14 | `AdresseCreate` | Addresses |
| 15 | `AdresseEdit` | Addresses |
| 16 | `AdresseGet` | Addresses |
| 17 | `AdresseGruppenList` | Addresses |
| 18 | `AdresseKontaktCreate` | Addresses |
| 19 | `AdresseKontaktEdit` | Addresses |
| 20 | `AdresseKontaktGet` | Addresses |
| 21 | `AdresseKontaktList` | Addresses |
| 22 | `AdresseListeGet` | Addresses |
| 23 | `AngebotArchivieren` | Quotes |
| 24 | `AngebotCreate` | Quotes |
| 25 | `AngebotEdit` | Quotes |
| 26 | `AngebotFreigabe` | Quotes |
| 27 | `AngebotGet` | Quotes |
| 28 | `AngebotVersenden` | Quotes |
| 29 | `AngebotZuAuftrag` | Quotes |
| 30 | `AnsprechpartnerCreate` | Contacts |
| 31 | `AnsprechpartnerEdit` | Contacts |
| 32 | `ArtikelCreate` | Articles |
| 33 | `ArtikelEdit` | Articles |
| 34 | `ArtikelGet` | Articles |
| 35 | `ArtikelkategorienList` | Articles |
| 36 | `ArtikelkontingenteGet` | Articles |
| 37 | `ArtikelList` | Articles |
| 38 | `ArtikelStueckliste` | BOM |
| 39 | `ArtikelStuecklisteCreate` | BOM |
| 40 | `ArtikelStuecklisteEdit` | BOM |
| 41 | `ArtikelStuecklisteList` | BOM |
| 42 | `AuftragAbschliessen` | Sales Orders |
| 43 | `AuftragArchivieren` | Sales Orders |
| 44 | `AuftragCreate` | Sales Orders |
| 45 | `AuftragEdit` | Sales Orders |
| 46 | `AuftragFreigabe` | Sales Orders |
| 47 | `AuftragGet` | Sales Orders |
| 48 | `AuftragVersenden` | Sales Orders |
| 49 | `AuftragZuRechnung` | Sales Orders |
| 50 | `BelegeList` | Documents |
| 51 | `BelegOhnePositionenList` | Documents (INTERNAL ONLY) |
| 52 | `BelegPDF` | Documents |
| 53 | `BelegPDFHeader` | Documents |
| 54 | `BenutzerCreate` | Users |
| 55 | `BenutzerEdit` | Users |
| 56 | `BenutzerGet` | Users |
| 57 | `BenutzerGetRFID` | Users |
| 58 | `BenutzerList` | Users |
| 59 | `BerichteGet` | Reports |
| 60 | `BestellungCreate` | Purchase Orders |
| 61 | `BestellungEdit` | Purchase Orders |
| 62 | `BestellungFreigabe` | Purchase Orders |
| 63 | `BestellungGet` | Purchase Orders |
| 64 | `Custom` | Custom |
| 65 | `DataToXML` | Utilities (INTERNAL ONLY) |
| 66 | `DateiDownload` | Files |
| 67 | `DateiHeader` | Files |
| 68 | `DateiList` | Files |
| 69 | `DateiVorschau` | Files |
| 70 | `Etikettendrucker` | System |
| 71 | `ExportVorlageGet` | Reports |
| 72 | `GruppeCreate` | Groups |
| 73 | `GruppeEdit` | Groups |
| 74 | `GruppeGet` | Groups |
| 75 | `GruppenList` | Groups |
| 76 | `GutschriftArchivieren` | Credit Notes |
| 77 | `GutschriftCreate` | Credit Notes |
| 78 | `GutschriftEdit` | Credit Notes |
| 79 | `GutschriftFreigabe` | Credit Notes |
| 80 | `GutschriftGet` | Credit Notes |
| 81 | `GutschriftVersenden` | Credit Notes |
| 82 | `LieferadresseCreate` | Delivery Addresses |
| 83 | `LieferadresseEdit` | Delivery Addresses |
| 84 | `LieferscheinArchivieren` | Delivery Notes |
| 85 | `LieferscheinCreate` | Delivery Notes |
| 86 | `LieferscheinEdit` | Delivery Notes |
| 87 | `LieferscheinFreigabe` | Delivery Notes |
| 88 | `LieferscheinGet` | Delivery Notes |
| 89 | `LieferscheinVersenden` | Delivery Notes |
| 90 | `MappingGet` | Mapping |
| 91 | `MappingSet` | Mapping |
| 92 | `PreiseEdit` | Articles |
| 93 | `ProjektCreate` | Projects |
| 94 | `ProjektEdit` | Projects |
| 95 | `ProjektGet` | Projects |
| 96 | `ProjektListe` | Projects |
| 97 | `RechnungAlsBezahltMarkieren` | Invoices |
| 98 | `RechnungArchivieren` | Invoices |
| 99 | `RechnungCreate` | Invoices |
| 100 | `RechnungEdit` | Invoices |
| 101 | `RechnungFreigabe` | Invoices |
| 102 | `RechnungGet` | Invoices |
| 103 | `RechnungVersenden` | Invoices |
| 104 | `RechnungVersendetMarkieren` | Invoices |
| 105 | `ReisekostenVersenden` | Travel Expenses |
| 106 | `RetoureCreate` | Returns |
| 107 | `RetoureEdit` | Returns |
| 108 | `RetoureGet` | Returns |
| 109 | `ServerTimeGet` | System |
| 110 | `SessionClose` | Sessions |
| 111 | `SessionStart` | Sessions |
| 112 | `shopimages` | Files |
| 113 | `StechuhrStatusGet` | Time Tracking |
| 114 | `StechuhrStatusSet` | Time Tracking |
| 115 | `StechuhrSummary` | Time Tracking |
| 116 | `WeiterfuehrenAuftragZuRechnung` | Sales Orders |
| 117 | `WeiterfuehrenRechnungZuGutschrift` | Credit Notes |
| 118 | `ApiXMLTest` | Utilities |
| 119 | `ZeiterfassungCreate` | Time Tracking |
| 120 | `ZeiterfassungDelete` | Time Tracking |
| 121 | `ZeiterfassungEdit` | Time Tracking |
| 122 | `ZeiterfassungGet` | Time Tracking |

---

## Code Examples

### PHP (cURL)
```php
function callLegacyAPI(string $action, array $data): array {
    $url = 'https://example.com/api/' . $action;
    $username = getenv('OPENXE_API_USER');
    $password = getenv('OPENXE_API_PASS');

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPAUTH       => CURLAUTH_DIGEST,
        CURLOPT_USERPWD        => "$username:$password",
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode(['data' => $data]),
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            'Accept: application/json',
        ],
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode < 200 || $httpCode >= 300) {
        throw new RuntimeException("API Error ($httpCode): $response");
    }

    return json_decode($response, true);
}

// Usage
$address = callLegacyAPI('AdresseGet', ['id' => 42]);
```

### Python
```python
import requests
from requests.auth import HTTPDigestAuth

def call_legacy_api(action: str, data: dict) -> dict:
    url = f"https://example.com/api/{action}"
    response = requests.post(
        url,
        auth=HTTPDigestAuth("api_user", "api_pass"),
        headers={"Content-Type": "application/json"},
        json={"data": data},
    )
    response.raise_for_status()
    return response.json()

# Usage
address = call_legacy_api("AdresseGet", {"id": 42})
```

### JavaScript (Node.js)
```javascript
const fetch = require('node-fetch');

async function callLegacyAPI(action, data) {
  const url = `https://example.com/api/${action}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ data }),
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  return response.json();
}
```

---

## Migration to REST API v1

| Legacy (POST) | REST v1 | Notes |
|----------------|---------|-------|
| `POST /api/AdresseGet {"data":{"id":42}}` | `GET /api/v1/adressen/42` | ID in URL path |
| `POST /api/AdresseCreate {"data":{...}}` | `POST /api/v1/adressen` | Standard REST |
| `POST /api/AdresseEdit {"data":{"id":42,...}}` | `PUT /api/v1/adressen/42` | Standard REST |
| `POST /api/AdresseListeGet {"data":{}}` | `GET /api/v1/adressen` | Query params for filters |
| `POST /api/ArtikelList {"data":{}}` | `GET /api/v1/artikel` | Query params for filters |

---

## Live Instance Compatibility

Tested against a live OpenXE instance (2026-03-31).

| Endpoint | Status | Notes |
|----------|--------|-------|
| `ServerTimeGet` | OK | Returns Unix timestamp |
| `AdresseListeGet` | OK | List works, accepts `limit` param |
| `ProjektListe` | OK | Returns projects |
| `GruppenList` | OK | Works (empty data) |
| `BelegeList` | OK | Works (needs `beleg` type filter) |
| `AdresseGet` | FAIL | "Invalid key (id)" -- XML parsing issue |
| `ArtikelGet` | FAIL | "Invalid key (id)" |
| `ArtikelList` | 500 | Server crash |
| `StechuhrStatusGet` | FAIL | XML body not parsed correctly |
| `MappingGet` | 400 | Bad request |

### Key Findings

- **JSON payloads work better than XML for write operations.** `AdresseCreate` with JSON persists all fields; XML loses them.
- **`AdresseEdit` wrapper format:** Legacy API needs `{"adresse": {"id": N, ...}}`. Alternatively, REST v1 `PUT /v1/adressen/{id}` works directly without the wrapper.
- The `*Get` endpoints that accept an `id` parameter fail when the request body is parsed as XML. Always use `Content-Type: application/json`.

---

**Verified:** 2025-12-28 against `www/pages/api.php` source
**Source file:** 12,319+ lines, all `Api*` public methods extracted
**License:** EGPL 3.1
