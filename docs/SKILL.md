---
name: openxe-mcp
description: Use when working with OpenXE ERP data — reading customers, articles, orders, invoices, delivery notes, credit memos, stock levels, tracking numbers, or when creating/editing any ERP records. Triggers on mentions of OpenXE, Xentral, ERP, Warenwirtschaft, Auftrag, Rechnung, Lieferschein, Gutschrift, Artikelverwaltung, Kundenverwaltung.
---

# OpenXE MCP Server

MCP server exposing OpenXE ERP as tools (writes) and resources (reads) via HTTP Digest Auth.

## Setup

Env vars required:
- `OPENXE_URL` — Base URL (e.g. `https://erp.example.com`)
- `OPENXE_USERNAME` — API account username (`api_account.remotedomain`)
- `OPENXE_PASSWORD` — API account password (`api_account.initkey`)

## Architecture: Dual API

| Operation | API | Why |
|-----------|-----|-----|
| **Read** data | REST v1 (`GET /v1/...`) | Structured, filterable, includes |
| **Write** data | Legacy API (`POST /api/{Action}`) | REST v1 POST/PUT broken for addresses+articles |
| **Write** delivery addresses | REST v1 | Full CRUD works |
| **Write** properties, categories | REST v1 | Full CRUD works |

## Quick Reference — Resources (Read)

### Master Data
| Resource | URI | Key Filters |
|----------|-----|-------------|
| Addresses | `openxe://adressen` | name, kundennummer, email, land, rolle |
| Address by ID | `openxe://adressen/{id}` | — |
| Delivery Addresses | `openxe://lieferadressen` | adresse, name, land |
| Articles | `openxe://artikel` | name_de, nummer, typ; `?include=verkaufspreise,lagerbestand` |
| Article by ID | `openxe://artikel/{id}` | `?include=verkaufspreise,lagerbestand,dateien,projekt` |
| Categories | `openxe://artikelkategorien` | bezeichnung, parent |
| Groups | `openxe://gruppen` | name, art, kennziffer |
| Tax Rates | `openxe://steuersaetze` | bezeichnung, country_code |
| Payment Methods | `openxe://zahlungsweisen` | bezeichnung, type |
| Shipping Methods | `openxe://versandarten` | bezeichnung, type |
| Countries | `openxe://laender` | iso, eu |
| Properties | `openxe://eigenschaften` | artikel, name |

### Documents (Belege)
| Resource | URI | Includes |
|----------|-----|----------|
| Quotes | `openxe://belege/angebote` | `?include=positionen,protokoll` |
| Orders | `openxe://belege/auftraege` | `?include=positionen,protokoll` |
| Invoices | `openxe://belege/rechnungen` | `?include=positionen,protokoll` |
| Delivery Notes | `openxe://belege/lieferscheine` | `?include=positionen,protokoll` |
| Credit Memos | `openxe://belege/gutschriften` | `?include=positionen,protokoll` |

All Belege support filters: `status`, `belegnr`, `kundennummer`, `datum_gte/lte`, `projekt`

### Inventory & Operations
| Resource | URI | Notes |
|----------|-----|-------|
| Stock by Batch | `openxe://lagercharge` | List-only, aggregated menge |
| Stock by Expiry | `openxe://lagermhd` | List-only, adds mhddatum |
| Tracking Numbers | `openxe://trackingnummern` | tracking, auftrag, lieferschein |
| Subscriptions | `openxe://aboartikel` | bezeichnung, adresse, artikel |
| CRM Documents | `openxe://crmdokumente` | typ, betreff, adresse_from |
| Reminders | `openxe://wiedervorlagen` | adresse, stages, projekt |
| Files | `openxe://dateien` | titel, dateiname |

## Quick Reference — Tools (Write)

### Address Management
| Tool | Action | Key Inputs |
|------|--------|------------|
| `openxe-create-address` | Create customer/supplier | `name` (req), typ, strasse, plz, ort, land, email |
| `openxe-edit-address` | Edit address | `id` (req), any address field |
| `openxe-create-delivery-address` | Create delivery addr | `name` (req), `adresse` (req, parent ID), land (2-char ISO) |
| `openxe-edit-delivery-address` | Edit delivery addr | `id` (req), any field |
| `openxe-delete-delivery-address` | Delete delivery addr | `id` (req) |

### Document Lifecycle
| Tool | Action | Key Inputs |
|------|--------|------------|
| `openxe-create-order` | Create sales order | adresse, positionen[{artikel, menge, preis}] |
| `openxe-create-quote` | Create quote | adresse, positionen |
| `openxe-create-invoice` | Create invoice | adresse, positionen |
| `openxe-create-delivery-note` | Create delivery note | adresse, positionen |
| `openxe-create-credit-note` | Create credit note | adresse, positionen |
| `openxe-release-order` | Release order | `id` |
| `openxe-release-invoice` | Release invoice | `id` |
| `openxe-convert-quote-to-order` | Quote -> Order | `id` (quote ID) |
| `openxe-convert-order-to-invoice` | Order -> Invoice | `id` (order ID) |
| `openxe-get-document-pdf` | Get PDF | `beleg` (type), `id` |
| `openxe-mark-invoice-paid` | Mark paid | `id` |
| `openxe-delete-draft-invoice` | Delete draft | `id` (only if belegnr empty) |

### Other Operations
| Tool | Action |
|------|--------|
| `openxe-create-tracking-number` | Add tracking: tracking, lieferschein/auftrag, gewicht, anzahlpakete, versendet_am |
| `openxe-create-crm-document` | Create CRM note/email: typ (email/brief/telefon/notiz), betreff |
| `openxe-create-subscription` | Create subscription: bezeichnung, artikel/artikelnummer |
| `openxe-create-resubmission` | Create reminder: bezeichnung, datum_erinnerung, zeit_erinnerung |
| `openxe-upload-file` | Upload file: dateiname, titel, file_content (base64) |

## Common Workflows

### Find customer and their orders
```
1. Read openxe://adressen?kundennummer_equals=K10001
2. Read openxe://belege/auftraege?filter[kundennummer]=K10001&include=positionen
```

### Create complete order flow (correct)
```
1. openxe-create-address → kundennummer="NEU" (system auto-generates)
2. openxe-create-order → artikelliste with nummer+menge+preis ONLY (no bezeichnung!)
3. WeiterfuehrenAuftragZuRechnung → creates LINKED Rechnung + Lieferschein from Auftrag
   (Do NOT create Lieferschein separately — Weiterführen handles the linkage)
```

### Check stock for an article
```
1. Read openxe://artikel/{id}?include=lagerbestand,verkaufspreise
   → lagerbestand only returned if lagerartikel=1
2. Read openxe://lagercharge?artikel={id}
   → batch-level stock with charge numbers
```

### Create customer with delivery address
```
1. openxe-create-address → get address ID
2. openxe-create-delivery-address → name, adresse={address_id}, land="DE"
```

## Important Gotchas

- **No `preis`/`waehrung`/`aktiv` on articles** — prices via `?include=verkaufspreise`, active status is `inaktiv` (inverted)
- **Address POST/PUT broken in REST v1** — always use Legacy API tools for address writes
- **BelegPDF param is `beleg`** not `typ` — values: rechnung, auftrag, angebot, lieferschein, gutschrift
- **Invoice DELETE only for drafts** — belegnr must be empty
- **Lagercharge/Lagermhd are list-only** — no single-item GET, no CRUD
- **CRM path is `crmdokumente`** (no underscore) — typ values: email, brief, telefon, notiz
- **File upload uses `application/x-www-form-urlencoded`** — fields: dateiname, titel, file_content (NOT multipart)
- **Tracking create needs 5 fields** — tracking + one of (internet/auftrag/lieferschein) + gewicht + anzahlpakete + versendet_am
- **StechuhrStatusSet params** — cmd (kommen/gehen/pausestart/pausestop), user, adresse (NOT benutzer/status)
- **Kundennummer="NEU"** — let system auto-generate, don't set manually
- **No bezeichnung in positions** — causes font size issues in PDFs, let system use article master data
- **Use WeiterfuehrenAuftragZuRechnung** not LieferscheinCreate — creates linked documents with proper protocol entries
- **artikelliste format** — {artikelliste: {position: [{nummer, menge, preis}]}} — note the nested structure

## Live Instance Compatibility (v1.12)

**Working REST v1 endpoints:** adressen, artikel, artikelkategorien, versandarten, dateien, belege/angebote, belege/auftraege, belege/rechnungen, belege/lieferscheine

**Not available (404):** adresstyp, gruppen, eigenschaften, eigenschaftenwerte, steuersaetze, zahlungsweisen, laender, gutschriften, lagercharge, lagermhd, trackingnummern, aboartikel, abogruppen, crmdokumente, wiedervorlagen, docscan

**API Path:** Use `/api/index.php/` not `/api/` — set OPENXE_API_PATH env var if needed

**Filters:** Only `kundennummer` filter works on adressen; others are silently ignored (server-side limitation)

**Includes work:** verkaufspreise, lagerbestand on artikel; positionen, protokoll on all Belege

**Legacy API:** Use JSON payloads, NOT XML — XML Create loses all fields (server bug)

**REST v1 PUT works for adressen** — contrary to source analysis, live instance accepts PUT updates

**Order creation:** Requires kundennummer in payload (not address ID). Customer must have kundennummer set at creation time.

## Permissions

96 unique permission strings. Pattern: `{action}_{resource}` (e.g. `list_addresses`, `create_order`, `view_article`). Set in `api_account.permissions` as JSON array. The API account needs the relevant permissions for each tool/resource used.
