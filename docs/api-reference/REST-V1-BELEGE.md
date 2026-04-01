# OpenXE REST API v1 — Document Resources (Belege)

> **Status:** Verified against source code
> **Base path:** `/api/v1/belege`
> **Authentication:** Bearer token required on all endpoints
> **Date:** 2026-03-31

---

## Table of Contents

1. [Overview](#overview)
2. [Common Patterns](#common-patterns)
3. [Angebote (Quotes)](#1-angebote-quotes)
4. [Auftraege (Sales Orders)](#2-auftraege-sales-orders)
5. [Rechnungen (Invoices)](#3-rechnungen-invoices)
6. [Lieferscheine (Delivery Notes)](#4-lieferscheine-delivery-notes)
7. [Gutschriften (Credit Memos)](#5-gutschriften-credit-memos)
8. [Sub-Resources: Positionen (Line Items)](#sub-resources-positionen)
9. [Sub-Resources: Protokoll (Audit Log)](#sub-resources-protokoll)
10. [Known Bugs](#known-bugs)
11. [Errata — Fields That Do NOT Exist](#errata--fields-that-do-not-exist)
12. [Live Instance Compatibility](#live-instance-compatibility)

---

## Overview

The Belege (document) endpoints expose five read-heavy resources that map to OpenXE's core commercial document types. All resources share a common filtering, sorting, and include pattern.

| Resource | Endpoint | Methods | DB Table |
|---|---|---|---|
| Angebote | `/v1/belege/angebote` | GET list, GET single | `angebot` |
| Auftraege | `/v1/belege/auftraege` | GET list, GET single | `auftrag` |
| Rechnungen | `/v1/belege/rechnungen` | GET list, GET single, DELETE | `rechnung` |
| Lieferscheine | `/v1/belege/lieferscheine` | GET list, GET single | `lieferschein` |
| Gutschriften | `/v1/belege/gutschriften` | GET list, GET single | `gutschrift` |

Only **Rechnungen** supports write operations (DELETE), and only for draft invoices.

---

## Common Patterns

### Pagination

All list endpoints support pagination via query parameters:

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | integer | 1 | Page number |
| `items_per_page` | integer | 20 | Items per page |

### Filtering

Filters are passed as query parameters using the `filter[]` syntax:

```
GET /v1/belege/angebote?filter[status]=angelegt&filter[datum_gte]=2025-01-01
```

Filter operator conventions used across all Belege resources:

| Suffix | SQL Operator | Example |
|---|---|---|
| *(none / base name)* | `LIKE '%value%'`, `LIKE 'value'`, or `= value` (depends on field) | `filter[status]=angelegt` |
| `_equals` | `= value` | `filter[belegnr_equals]=AN-10042` |
| `_startswith` | `LIKE 'value%'` | `filter[belegnr_startswith]=AN-` |
| `_endswith` | `LIKE '%value'` | `filter[kundennummer_endswith]=500` |
| `_gt` | `> value` | `filter[datum_gt]=2025-01-01` |
| `_gte` | `>= value` | `filter[datum_gte]=2025-01-01` |
| `_lt` | `< value` | `filter[datum_lt]=2025-12-31` |
| `_lte` | `<= value` | `filter[datum_lte]=2025-12-31` |

### Sorting

```
GET /v1/belege/angebote?sort=datum&direction=DESC
```

| Parameter | Values | Default |
|---|---|---|
| `sort` | `belegnr`, `datum` | `belegnr` |
| `direction` | `ASC`, `DESC` | `ASC` |

### Includes (Sub-Resources)

```
GET /v1/belege/angebote/42?include=positionen,protokoll
```

All five document types support exactly two includes:

| Include | Description |
|---|---|
| `positionen` | Line items / positions of the document |
| `protokoll` | Audit log entries for the document |

Includes work on both list and single endpoints.

---

## 1. Angebote (Quotes)

### Endpoints

| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/v1/belege/angebote` | `list_quotes` | List quotes |
| GET | `/v1/belege/angebote/{id}` | `view_quote` | Get single quote |

### Filters (15)

| Filter Key | Operator | Description |
|---|---|---|
| `status` | `LIKE 'value'` | Quote status (exact match) |
| `belegnr` | `LIKE '%value%'` | Document number (contains) |
| `belegnr_equals` | `= value` | Document number (exact) |
| `belegnr_startswith` | `LIKE 'value%'` | Document number (starts with) |
| `belegnr_endswith` | `LIKE '%value'` | Document number (ends with) |
| `kundennummer` | `LIKE '%value%'` | Customer number (contains) |
| `kundennummer_equals` | `= value` | Customer number (exact) |
| `kundennummer_startswith` | `LIKE 'value%'` | Customer number (starts with) |
| `kundennummer_endswith` | `LIKE '%value'` | Customer number (ends with) |
| `datum` | `= value` | Date (exact match) |
| `datum_gt` | `> value` | Date (after, exclusive) |
| `datum_gte` | `>= value` | Date (after, inclusive) |
| `datum_lt` | `< value` | Date (before, exclusive) |
| `datum_lte` | `<= value` | Date (before, inclusive) |
| `projekt` | `= value` | Project (exact match) |

> **Note:** The base `belegnr` and `kundennummer` filters use `LIKE '%value%'` (contains), while `status` uses plain `LIKE 'value'` (exact match).

### Sorts

- `belegnr` (default)
- `datum`

### Includes

- `positionen` — returns `DocumentOfferPositionResource` array
- `protokoll` — returns `DocumentOfferProtocolResource` array

### Response Fields (~80 columns)

The response maps directly to the `angebot` table. Key fields include:

| Field | Type | Description |
|---|---|---|
| `id` | integer | Primary key |
| `datum` | date | Quote date |
| `belegnr` | string | Document number |
| `status` | string | Status (e.g. `angelegt`, `versendet`, `abgelehnt`, `angenommen`) |
| `kundennummer` | string | Customer number |
| `name` | string | Customer name |
| `projekt` | string | Project code |
| `abteilung` | string | Department |
| `adresse` | string | Address block |
| `plz` | string | Postal code |
| `ort` | string | City |
| `land` | string | Country code |
| `lieferbedingung` | string | Delivery terms |
| `zahlungsweise` | string | Payment method |
| `zahlungszieltage` | integer | Payment term days |
| `gueltigbis` | date | Valid until date |
| `waehrung` | string | Currency |
| `freitext` | text | Free text / notes |
| `internebemerkung` | text | Internal notes |
| `bearbeiter` | string | Processor |
| ... | ... | ~80 columns total from `angebot` table |

> **ERRATA:** The field `summe` does **NOT** exist in the API response. It was fabricated in older documentation versions. Do not rely on it.

### Example Request

```http
GET /api/v1/belege/angebote?filter[status]=angelegt&filter[datum_gte]=2025-01-01&sort=datum&direction=DESC&include=positionen&page=1&items_per_page=25
Authorization: Bearer {token}
```

---

## 2. Auftraege (Sales Orders)

### Endpoints

| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/v1/belege/auftraege` | `list_orders` | List sales orders |
| GET | `/v1/belege/auftraege/{id}` | `view_order` | Get single sales order |

### Filters (21)

All 15 base filters from Angebote, **plus** 6 additional (= 21 total):

| Filter Key | Operator | Description |
|---|---|---|
| `internet` | `LIKE '%value%'` | Internet/shop reference (contains) |
| `internet_equals` | `= value` | Internet/shop reference (exact) |
| `internet_startswith` | `LIKE 'value%'` | Internet/shop reference (starts with) |
| `internet_endswith` | `LIKE '%value'` | Internet/shop reference (ends with) |
| `angebot` | `LIKE 'value'` | Source quote reference (exact match) |
| `angebotid` | `= value` | Source quote ID (exact) |

### Sorts

- `belegnr` (default)
- `datum`

### Includes

- `positionen` — returns `DocumentSalesOrderPositionResource` array
- `protokoll` — returns protocol entries with explicit columns: `id`, `zeit`, `bearbeiter`, `grund`

### Response Fields (~110 columns)

The `auftrag` table is the largest document table. Key fields include:

| Field | Type | Description |
|---|---|---|
| `id` | integer | Primary key |
| `datum` | date | Order date |
| `belegnr` | string | Document number |
| `status` | string | Status |
| `kundennummer` | string | Customer number |
| `name` | string | Customer name |
| `projekt` | string | Project |
| `internet` | string | Shop/internet order reference |
| `angebotid` | integer | FK to source quote |
| `waehrung` | string | Currency |
| `lieferbedingung` | string | Delivery terms |
| `zahlungsweise` | string | Payment method |
| `freitext` | text | Free text |
| `internebemerkung` | text | Internal notes |
| `bearbeiter` | string | Processor |
| `autoversand` | integer | Auto-shipping flag |
| `fastlane` | integer | Fast lane flag |
| ... | ... | ~110 columns total from `auftrag` table |

> **ERRATA:** The following fields do **NOT** exist in the API response:
> - `auftragsnummer` — does not exist; use `belegnr` instead
> - `beauftragtvon` — does not exist
> - `kommissionskonsignationslager` — does not exist

### Known Bug: selectIdsQuery Alias

The `selectIdsQuery` in the Auftraege resource uses the wrong table alias `s.id` instead of the correct `au.id`. This may cause SQL errors under certain query conditions.

### Example Request

```http
GET /api/v1/belege/auftraege?filter[kundennummer_equals]=10042&filter[datum_gte]=2025-06-01&include=positionen,protokoll
Authorization: Bearer {token}
```

---

## 3. Rechnungen (Invoices)

### Endpoints

| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/v1/belege/rechnungen` | `list_invoices` | List invoices |
| GET | `/v1/belege/rechnungen/{id}` | `view_invoice` | Get single invoice |
| DELETE | `/v1/belege/rechnungen/{id}` | `delete_invoice` | Delete a **draft** invoice |

### DELETE — Draft Invoices Only

The DELETE method enforces a strict constraint:

```sql
WHERE belegnr = '' OR belegnr = '0'
```

Only invoices that have **not yet been assigned a final document number** (i.e., drafts) can be deleted. Attempting to DELETE a finalized invoice will fail.

**Cascading delete:** When a draft invoice is deleted, all associated **positions** and **protocol entries** are also deleted.

### Filters (17)

All base filters from Angebote, **plus** order-linking filters:

| Filter Key | Operator | Description |
|---|---|---|
| `projekt` | `= value` | Project (exact match) |
| `auftrag` | `LIKE 'value'` | Source sales order reference (exact match) |
| `auftragid` | `= value` | Source sales order ID (exact) |

### Sorts

- `belegnr` (default)
- `datum`

### Includes

- `positionen` — returns `DocumentInvoicePositionResource` array
- `protokoll` — returns protocol entries with columns: `id`, `zeit`, `bearbeiter`, `grund`

### Response Fields (~80 columns)

| Field | Type | Description |
|---|---|---|
| `id` | integer | Primary key |
| `datum` | date | Invoice date |
| `belegnr` | string | Document number (empty or `'0'` = draft) |
| `status` | string | Status |
| `kundennummer` | string | Customer number |
| `name` | string | Customer name |
| `auftragid` | integer | FK to source sales order |
| `waehrung` | string | Currency |
| `zahlungsweise` | string | Payment method |
| `zahlungszieltage` | integer | Payment term days |
| `mahnwesen` | string | Dunning status |
| `mahnwesen_datum` | date | Last dunning date |
| `freitext` | text | Free text |
| `internebemerkung` | text | Internal notes |
| ... | ... | ~80 columns total from `rechnung` table |

### Example Request

```http
DELETE /api/v1/belege/rechnungen/1547
Authorization: Bearer {token}
```

Response on success: `204 No Content`
Response if invoice is finalized: `4xx` error (delete constraint violated)

---

## 4. Lieferscheine (Delivery Notes)

### Endpoints

| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/v1/belege/lieferscheine` | `list_delivery_notes` | List delivery notes |
| GET | `/v1/belege/lieferscheine/{id}` | `view_delivery_note` | Get single delivery note |

### Filters

Same base pattern as other resources, plus order-linking:

| Filter Key | Operator | Description |
|---|---|---|
| `projekt` | `= value` | Project (exact match) |
| `auftrag` | **Smart lookup** | Source order reference (see below) |
| `auftragid` | `= value` | Source order ID (exact) |

#### Smart Filter: `auftrag`

When `filter[auftrag]` is provided **without** `filter[auftragid]`, the code performs an automatic resolution:

1. Looks up the `auftrag` table for a record where `belegnr` matches the filter value
2. Resolves the matching record's `id`
3. Uses that `id` as `auftragid` filter internally

This means you can filter delivery notes by the sales order's document number directly, without knowing the order's database ID.

```
GET /v1/belege/lieferscheine?filter[auftrag]=AU-20251234
```

If `filter[auftragid]` is also provided, it takes precedence and the smart lookup is skipped.

> **Note:** Providing `filter[projekt]` alongside `filter[auftrag]` narrows the order lookup by project, allowing more precise resolution when multiple orders share similar document numbers.

### Sorts

- `belegnr` (default)
- `datum`

### Includes

- `positionen` — returns `DocumentDeliveryNotePositionResource` array
- `protokoll` — returns protocol entries with columns: `id`, `zeit`, `bearbeiter`, `grund`

### Response Fields (~60 columns)

| Field | Type | Description |
|---|---|---|
| `id` | integer | Primary key |
| `datum` | date | Delivery note date |
| `belegnr` | string | Document number |
| `status` | string | Status |
| `kundennummer` | string | Customer number |
| `name` | string | Customer name |
| `auftragid` | integer | FK to source sales order |
| `waehrung` | string | Currency |
| `internebemerkung` | text | Internal notes |
| `pdfarchiviert` | integer | Whether PDF has been archived |
| `lieferbedingung` | string | Delivery terms |
| `freitext` | text | Free text |
| ... | ... | ~60 columns total from `lieferschein` table |

> **Note:** Lieferscheine include `internebemerkung` and `pdfarchiviert` which differ from the Rechnungen field set.

---

## 5. Gutschriften (Credit Memos)

### Endpoints

| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/v1/belege/gutschriften` | `list_credit_memos` | List credit memos |
| GET | `/v1/belege/gutschriften/{id}` | `view_credit_memo` | Get single credit memo |

### Filters

Same base pattern, plus invoice-linking:

| Filter Key | Operator | Description |
|---|---|---|
| `projekt` | `= value` | Project (exact match) |
| `rechnung` | `LIKE 'value'` | Source invoice reference (exact match) |
| `rechnungid` | `= value` | Source invoice ID (exact) |

### Sorts

- `belegnr` (default)
- `datum`

### Includes

- `positionen` — returns `DocumentCreditNotePositionResource` array
- `protokoll` — returns protocol entries with columns: `id`, `zeit`, `bearbeiter`, `grund`

### Response Fields (~75 columns)

Gutschriften serve a dual role: they function as both **credit notes** and **cancellation invoices** (Stornorechnungen).

| Field | Type | Description |
|---|---|---|
| `id` | integer | Primary key |
| `datum` | date | Credit memo date |
| `belegnr` | string | Document number |
| `status` | string | Status |
| `kundennummer` | string | Customer number |
| `name` | string | Customer name |
| `rechnungid` | integer | FK to source invoice |
| `waehrung` | string | Currency |
| `stornorechnung` | integer/string | Cancellation invoice flag/reference |
| `nicht_umsatzmindernd` | integer | Flag: does NOT reduce revenue (for internal corrections) |
| `zahlungsweise` | string | Payment method |
| `freitext` | text | Free text |
| `internebemerkung` | text | Internal notes |
| ... | ... | ~75 columns total from `gutschrift` table |

### Example Request

```http
GET /api/v1/belege/gutschriften?filter[rechnungid]=4201&include=positionen,protokoll
Authorization: Bearer {token}
```

---

## Sub-Resources: Positionen

Position sub-resources are **include-only** — they have no own routes. Access them via `?include=positionen` on any parent document endpoint.

All position sub-resources are:
- **Read-only**
- **Sorted by** `sort ASC` (the `sort` column in the positions table)

### Common Position Fields (All 5 Types)

| Field | Type | Description |
|---|---|---|
| `id` | integer | Position ID |
| `projekt` | string | Project code |
| `artikel` | string | Article/item reference |
| `bezeichnung` | string | Designation / title |
| `beschreibung` | text | Description |
| `nummer` | string | Item number |
| `menge` | decimal | Quantity |
| `lieferdatum` | date | Delivery date |
| `vpe` | string | Packaging unit |
| `einheit` | string | Unit of measure |
| `bemerkung` | text | Remark |
| `artikelnummerkunde` | string | Customer's article number |
| `lieferdatumkw` | string | Delivery date calendar week |
| `herkunftsland` | string | Country of origin |
| `zolltarifnummer` | string | Customs tariff number |

### 1. DocumentOfferPositionResource (Angebot Positions)

Additional fields beyond common set:

| Field | Type | Description |
|---|---|---|
| `preis` | decimal | Unit price |
| `waehrung` | string | Currency |
| `umsatzsteuer` | string | VAT type |
| `rabatt` | decimal | Discount percentage |
| `optional` | integer | Flag: optional position |
| `textalternativpreis` | string | Alternative price text |
| `berechnen_aus_teile` | integer | Calculate from sub-parts flag |
| `einkaufspreis` | decimal | Purchase price |
| `einkaufspreisurspruenglich` | decimal | Original purchase price |
| `ohnepreis` | integer | Flag: without price display |
| `steuersatz` | decimal | Tax rate |
| `steuertext` | string | Tax description text |
| `steuerbetrag` | decimal | Tax amount |
| `skontobetrag` | decimal | Cash discount amount |
| `skontosperre` | integer | Cash discount lock |
| `ausblenden_im_pdf` | integer | Hide in PDF output |
| `geliefert` | decimal | Delivered quantity |

> **Note:** Angebot positions include `optional`, `textalternativpreis`, and `berechnen_aus_teile` which are unique to this type.

### 2. DocumentSalesOrderPositionResource (Auftrag Positions)

Additional fields beyond common set:

| Field | Type | Description |
|---|---|---|
| `preis` | decimal | Unit price |
| `waehrung` | string | Currency |
| `umsatzsteuer` | string | VAT type |
| `rabatt` | decimal | Discount percentage |
| `einkaufspreis` | decimal | Purchase price |
| `einkaufspreisurspruenglich` | decimal | Original purchase price |
| `ohnepreis` | integer | Without price display |
| `steuersatz` | decimal | Tax rate |
| `steuertext` | string | Tax description |
| `steuerbetrag` | decimal | Tax amount |
| `skontobetrag` | decimal | Cash discount amount |
| `skontosperre` | integer | Cash discount lock |
| `ausblenden_im_pdf` | integer | Hide in PDF |
| `geliefert` | decimal | Delivered quantity |
| `geliefert_menge` | decimal | Delivered quantity (alternate) |
| `webid` | string | Web/shop line item ID |
| `nachbestelltexternereinkauf` | integer | Reordered via external purchase |
| `potentiellerliefertermin` | date | Potential delivery date |
| `zolleinzelwert` | decimal | Customs individual value |
| `zollgesamtwert` | decimal | Customs total value |
| `zollwaehrung` | string | Customs currency |
| `zolleinzelgewicht` | decimal | Customs individual weight |
| `zollgesamtgewicht` | decimal | Customs total weight |
| `auftrag` | integer | FK to parent sales order (exposed) |

> **Note:** Auftrag positions do **not** have `optional`, `textalternativpreis`, or `berechnen_aus_teile` (which are Angebot-only). They add `geliefert_menge`, `webid`, customs/Zoll fields, and the `auftrag` FK.

### 3. DocumentInvoicePositionResource (Rechnung Positions)

Additional fields beyond common set:

| Field | Type | Description |
|---|---|---|
| `preis` | decimal | Unit price |
| `waehrung` | string | Currency |
| `umsatzsteuer` | string | VAT type |
| `rabatt` | decimal | Discount percentage |
| `einkaufspreis` | decimal | Purchase price |
| `einkaufspreisurspruenglich` | decimal | Original purchase price |
| `einkaufspreiswaehrung` | string | Purchase price currency |
| `ohnepreis` | integer | Without price display |
| `steuersatz` | decimal | Tax rate |
| `steuertext` | string | Tax description |
| `steuerbetrag` | decimal | Tax amount |
| `skontobetrag` | decimal | Cash discount amount |
| `skontosperre` | integer | Cash discount lock |
| `ausblenden_im_pdf` | integer | Hide in PDF |

### 4. DocumentDeliveryNotePositionResource (Lieferschein Positions)

Lieferschein positions are fundamentally different: they carry **no price, tax, or discount fields**. Instead they focus on logistics data.

Additional fields beyond common set:

| Field | Type | Description |
|---|---|---|
| `geliefert` | decimal | Delivered quantity |
| `kostenlos` | integer | Free of charge flag |
| `abgerechnet` | integer | Invoiced/billed flag |
| `seriennummer` | string | Serial number |
| `nve` | string | NVE (SSCC shipping unit code) |
| `packstueck` | string | Package/parcel reference |
| `vpemenge` | decimal | Packaging unit quantity |
| `einzelstueckmenge` | decimal | Individual piece quantity |
| `zolleinzelwert` | decimal | Customs individual value |
| `zollgesamtwert` | decimal | Customs total value |
| `zollwaehrung` | string | Customs currency |
| `zolleinzelgewicht` | decimal | Customs individual weight |
| `zollgesamtgewicht` | decimal | Customs total weight |

> **Key difference:** No `preis`, `waehrung`, `umsatzsteuer`, `rabatt`, `steuersatz`, `steuerbetrag`, `skontobetrag`, `skontosperre`, `ausblenden_im_pdf`, `ohnepreis`, `einkaufspreis` fields.

### 5. DocumentCreditNotePositionResource (Gutschrift Positions)

Additional fields beyond common set:

| Field | Type | Description |
|---|---|---|
| `preis` | decimal | Unit price |
| `waehrung` | string | Currency |
| `umsatzsteuer` | string | VAT type |
| `rabatt` | decimal | Discount percentage |
| `einkaufspreis` | decimal | Purchase price |
| `einkaufspreisurspruenglich` | decimal | Original purchase price |
| `einkaufspreiswaehrung` | string | Purchase price currency |
| `ohnepreis` | integer | Without price display |
| `steuersatz` | decimal | Tax rate |
| `steuertext` | string | Tax description |
| `steuerbetrag` | decimal | Tax amount |
| `skontobetrag` | decimal | Cash discount amount |
| `skontosperre` | integer | Cash discount lock |
| `ausblenden_im_pdf` | integer | Hide in PDF |
| `auftrag_position_id` | integer | FK to original sales order position |
| `teilprojekt` | string | Sub-project reference |
| `kostenstelle` | string | Cost center |

> **Note:** Gutschrift positions are the only type with `auftrag_position_id`, `teilprojekt`, and `kostenstelle`, enabling traceability back to the originating order line and cost accounting.

---

## Sub-Resources: Protokoll

Protocol sub-resources are **include-only** — accessed via `?include=protokoll`. All are read-only, sorted by `zeit ASC`.

### Fields (All 5 Protocol Types)

All protocol sub-resources return exactly **4 fields**:

| Field | Type | Description |
|---|---|---|
| `id` | integer | Protocol entry ID |
| `zeit` | datetime | Timestamp of the event |
| `bearbeiter` | string | User who performed the action |
| `grund` | string | Reason / description of the change |

### Implementation Notes

- **Auftraege, Rechnungen, Lieferscheine, Gutschriften:** Use an explicit `columns` override that limits output to `id, zeit, bearbeiter, grund`.
- **Angebote:** Does **not** use a columns override, but only exposes the same 4 fields anyway because the FK column (`angebot`) is commented out in the resource class.

---

## Known Bugs

### 1. Auftraege: selectIdsQuery Wrong Alias

**Resource:** `DocumentSalesOrderResource`
**Issue:** The `selectIdsQuery` method uses `s.id` as the select expression, but the `auftrag` table is aliased as `au`. The correct expression should be `au.id`.
**Impact:** May cause SQL errors in edge cases when the query planner cannot resolve `s.id`, particularly when complex filter combinations trigger the IDs sub-query.

### 2. Rechnungen Protocol: Wrong FK Exposed

**Resource:** `DocumentInvoiceProtocolResource`
**Issue:** The underlying resource class exposes `reproto.lieferschein` (delivery note FK) instead of `reproto.rechnung` (invoice FK).
**Impact:** Currently **masked** by the parent resource's `columns` override which restricts protocol output to `id, zeit, bearbeiter, grund` — so the wrong FK never appears in API responses. However, if the columns override is ever removed, the protocol entries would incorrectly reference delivery notes instead of invoices.

---

## Errata — Fields That Do NOT Exist

Previous documentation versions listed fields that do not actually exist in the API responses. These have been verified as absent:

| Resource | Non-Existent Field | Notes |
|---|---|---|
| Angebote | `summe` | Fabricated in old docs. No such column in `angebot` table output. |
| Auftraege | `auftragsnummer` | Does not exist. Use `belegnr` for the order number. |
| Auftraege | `beauftragtvon` | Does not exist in API response. |
| Auftraege | `kommissionskonsignationslager` | Does not exist in API response. |
| Auftraege | `gewicht` | Not in `selectAllQuery`; does not exist in API response. |

---

## Quick Reference: Permissions Matrix

| Action | Angebote | Auftraege | Rechnungen | Lieferscheine | Gutschriften |
|---|---|---|---|---|---|
| List | `list_quotes` | `list_orders` | `list_invoices` | `list_delivery_notes` | `list_credit_memos` |
| View | `view_quote` | `view_order` | `view_invoice` | `view_delivery_note` | `view_credit_memo` |
| Delete | -- | -- | `delete_invoice` | -- | -- |

---

## Quick Reference: Filter Availability

| Filter | Angebote | Auftraege | Rechnungen | Lieferscheine | Gutschriften |
|---|---|---|---|---|---|
| `status` | Yes | Yes | Yes | Yes | Yes |
| `belegnr` (+equals/starts/ends) | Yes | Yes | Yes | Yes | Yes |
| `kundennummer` (+equals/starts/ends) | Yes | Yes | Yes | Yes | Yes |
| `datum` (+gt/gte/lt/lte) | Yes | Yes | Yes | Yes | Yes |
| `projekt` | Yes | Yes | Yes | Yes | Yes |
| `internet` (+equals/starts/ends) | -- | Yes | -- | -- | -- |
| `angebot` / `angebotid` | -- | Yes | -- | -- | -- |
| `auftrag` / `auftragid` | -- | -- | Yes | Yes (smart) | -- |
| `rechnung` / `rechnungid` | -- | -- | -- | -- | Yes |

---

## Live Instance Compatibility

> **Tested:** 2026-03-31 against live OpenXE instance

| Endpoint | Status | Notes |
|----------|--------|-------|
| `/v1/belege/angebote` | OK | 3 quotes, includes work |
| `/v1/belege/auftraege` | OK | 5 orders, includes work |
| `/v1/belege/rechnungen` | OK | 2 invoices, includes work |
| `/v1/belege/lieferscheine` | OK | 1 delivery note, includes work |
| `/v1/belege/gutschriften` | 404 | Not available on test instance |

**Note:** `?include=positionen` and `?include=protokoll` confirmed working on all 4 available types.
