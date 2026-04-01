# OpenXE MCP Tool Definitions
# Auth for all tools: HTTP Digest (realm=Xentral-API)
# Base URL: https://{host}/api

## Live Instance Compatibility (tested against v1.12)
# WORKING: adressen, artikel, artikelkategorien, versandarten, dateien, belege/angebote, belege/auftraege, belege/rechnungen, belege/lieferscheine
# NOT AVAILABLE (404): adresstyp, gruppen, eigenschaften, eigenschaftenwerte, steuersaetze, zahlungsweisen, laender, gutschriften, lagercharge, lagermhd, trackingnummern, aboartikel, abogruppen, crmdokumente, wiedervorlagen, docscan
# BROKEN (500): lieferadressen, OpenTRANS, Mobile Dashboard
# API PATH: /api/index.php/ (not /api/ — Apache blocks direct access)
# FILTERS: Only kundennummer works on adressen; other filters silently ignored
# INCLUDES: verkaufspreise, lagerbestand, positionen, protokoll all work
# LEGACY: JSON payloads work, XML loses fields on Create

---
## Master Data — Read

### tool: openxe-list-addresses
description: List/search addresses (customers, suppliers, employees) with extensive filters
endpoint: GET /v1/adressen
input: {page?: int, items_per_page?: int, rolle?: string, name?: string, name_equals?: string, kundennummer?: string, kundennummer_equals?: string, lieferantennummer?: string, email?: string, land?: string, typ?: string, projekt?: int, freifeld1-10?: string, sort?: "name"|"kundennummer"|"lieferantennummer"|"mitarbeiternummer"}
output: {data: Address[], headers: {X-Total-Count: int, X-Page: int, X-Items-Per-Page: int}}
permissions: ["list_addresses"]

### tool: openxe-get-address
description: Get single address by ID
endpoint: GET /v1/adressen/{id}
input: {id: int}
output: {data: Address}
permissions: ["view_address"]

### tool: openxe-list-articles
description: List/search articles (READ-ONLY, no write via REST v1)
endpoint: GET /v1/artikel
input: {page?: int, items_per_page?: int, typ?: string, name_de?: string, nummer?: string, nummer_equals?: string, projekt?: int, ausverkauft?: 0|1, topseller?: 0|1, include?: "verkaufspreise"|"lagerbestand"|"dateien"|"projekt", sort?: "name_de"|"name_en"|"nummer"|"typ"}
output: {data: Article[], headers: {X-Total-Count: int}}
permissions: ["list_articles"]
notes: No preis/waehrung/aktiv fields. Prices via include=verkaufspreise. Active status via inaktiv field (inverted).

### tool: openxe-get-article
description: Get single article with optional includes
endpoint: GET /v1/artikel/{id}
input: {id: int, include?: "verkaufspreise,lagerbestand,dateien,projekt"}
output: {data: Article}
permissions: ["view_article"]

### tool: openxe-list-delivery-addresses
description: List delivery addresses for a customer
endpoint: GET /v1/lieferadressen
input: {adresse?: int, name?: string, land?: string, standardlieferadresse?: 0|1, sort?: "name"|"plz"|"land"}
output: {data: DeliveryAddress[]}
permissions: ["list_delivery_addresses"]

---
## Master Data — Write

### tool: openxe-create-address
description: Create address/customer via Legacy API (REST v1 POST is broken)
endpoint: POST /api/AdresseCreate
input: {data: {typ: string, name: string, strasse?: string, plz?: string, ort?: string, land?: string, email?: string, telefon?: string, kundennummer?: string, projekt?: int, firma?: string, vorname?: string}}
output: {success: bool, data: {id: int}}
permissions: ["standard_adressecreate"]

### tool: openxe-edit-address
description: Edit address via Legacy API (REST v1 PUT is broken)
endpoint: POST /api/AdresseEdit
input: {data: {id: int, [any address field]: value}}
output: {success: bool}
permissions: ["standard_adresseedit"]

### tool: openxe-create-article
description: Create article via Legacy API (REST v1 is read-only)
endpoint: POST /api/ArtikelCreate
input: {data: {name_de: string, nummer?: string, typ?: string, einheit?: string, [fields]: value}}
output: {success: bool, data: {id: int}}
permissions: ["standard_artikelcreate"]

### tool: openxe-edit-article
description: Edit article via Legacy API
endpoint: POST /api/ArtikelEdit
input: {data: {id: int, [any article field]: value}}
output: {success: bool}
permissions: ["standard_artikeledit"]

### tool: openxe-create-delivery-address
description: Create delivery address (full REST v1 CRUD)
endpoint: POST /v1/lieferadressen
input: {name: string, adresse: int, typ?: string, strasse?: string, plz?: string, ort?: string, land?: string(2-char ISO), standardlieferadresse?: 0|1, ust_befreit?: 0|1|2|3}
output: {data: DeliveryAddress}
permissions: ["create_delivery_address"]

### tool: openxe-edit-prices
description: Edit article prices via Legacy API
endpoint: POST /api/PreiseEdit
input: {data: {artikel: int, [price fields]: value}}
output: {success: bool}
permissions: ["standard_preiseedit"]

---
## Documents — Read

### tool: openxe-list-quotes
description: List quotes with filters, sorting, and optional line items
endpoint: GET /v1/belege/angebote
input: {page?: int, items_per_page?: int, filter?: {status?: string, belegnr?: string, belegnr_equals?: string, kundennummer?: string, datum_gte?: date, datum_lte?: date, projekt?: string}, sort?: "belegnr"|"datum", direction?: "ASC"|"DESC", include?: "positionen"|"protokoll"}
output: {data: Quote[]}
permissions: ["list_quotes"]

### tool: openxe-list-orders
description: List sales orders with filters
endpoint: GET /v1/belege/auftraege
input: {page?: int, items_per_page?: int, filter?: {status?: string, belegnr?: string, kundennummer?: string, kundennummer_equals?: string, datum_gte?: date, datum_lte?: date, internet?: string, angebotid?: int}, sort?: "belegnr"|"datum", direction?: "ASC"|"DESC", include?: "positionen,protokoll"}
output: {data: Order[]}
permissions: ["list_orders"]
notes: BUG — selectIdsQuery may cause SQL errors with complex filters

### tool: openxe-list-invoices
description: List invoices with filters
endpoint: GET /v1/belege/rechnungen
input: {page?: int, items_per_page?: int, filter?: {status?: string, belegnr?: string, kundennummer?: string, datum_gte?: date, datum_lte?: date, auftragid?: int}, sort?: "belegnr"|"datum", direction?: "ASC"|"DESC", include?: "positionen,protokoll"}
output: {data: Invoice[]}
permissions: ["list_invoices"]

### tool: openxe-list-delivery-notes
description: List delivery notes (supports smart auftrag filter by belegnr)
endpoint: GET /v1/belege/lieferscheine
input: {page?: int, items_per_page?: int, filter?: {status?: string, belegnr?: string, kundennummer?: string, auftrag?: string, auftragid?: int}, include?: "positionen,protokoll"}
output: {data: DeliveryNote[]}
permissions: ["list_delivery_notes"]

### tool: openxe-list-credit-memos
description: List credit memos
endpoint: GET /v1/belege/gutschriften
input: {page?: int, items_per_page?: int, filter?: {status?: string, belegnr?: string, kundennummer?: string, rechnungid?: int}, include?: "positionen,protokoll"}
output: {data: CreditMemo[]}
permissions: ["list_credit_memos"]

### tool: openxe-get-document-pdf
description: Get any document as PDF via Legacy API
endpoint: POST /api/BelegPDF
input: {data: {typ: "angebot"|"auftrag"|"rechnung"|"lieferschein"|"gutschrift", id: int}}
output: {success: bool, data: {base64: string, filename: string}}
permissions: ["standard_belegpdf"]

---
## Documents — Write (Legacy API)

### tool: openxe-create-order
description: Create sales order via Legacy API
endpoint: POST /api/AuftragCreate
input: {data: {adresse: int, datum?: date, projekt?: string, positionen: [{artikel: int|string, menge: number, preis?: number, bezeichnung?: string}], zahlungsweise?: string, lieferbedingung?: string, freitext?: string}}
output: {success: bool, data: {id: int, belegnr: string}}
permissions: ["standard_auftragcreate"]

### tool: openxe-create-quote
description: Create quote via Legacy API
endpoint: POST /api/AngebotCreate
input: {data: {adresse: int, datum?: date, positionen: [{artikel: int, menge: number, preis?: number}], gueltigbis?: date}}
output: {success: bool, data: {id: int, belegnr: string}}
permissions: ["standard_angebotcreate"]

### tool: openxe-convert-quote-to-order
description: Convert existing quote to sales order
endpoint: POST /api/AngebotZuAuftrag
input: {data: {id: int}}
output: {success: bool, data: {auftrag_id: int, belegnr: string}}
permissions: ["standard_angebotzuauftrag"]

### tool: openxe-create-invoice
description: Create invoice via Legacy API
endpoint: POST /api/RechnungCreate
input: {data: {adresse: int, datum?: date, positionen: [{artikel: int, menge: number, preis: number}]}}
output: {success: bool, data: {id: int, belegnr: string}}
permissions: ["standard_rechnungcreate"]

### tool: openxe-convert-order-to-invoice
description: Convert sales order to invoice
endpoint: POST /api/AuftragZuRechnung
input: {data: {id: int}}
output: {success: bool, data: {rechnung_id: int}}
permissions: ["standard_auftragzurechnung"]

### tool: openxe-release-order
description: Release/approve a sales order for processing
endpoint: POST /api/AuftragFreigabe
input: {data: {id: int}}
output: {success: bool}
permissions: ["standard_auftragfreigabe"]

### tool: openxe-release-invoice
description: Release/finalize an invoice
endpoint: POST /api/RechnungFreigabe
input: {data: {id: int}}
output: {success: bool}
permissions: ["standard_rechnungfreigabe"]

### tool: openxe-mark-invoice-paid
description: Mark invoice as paid
endpoint: POST /api/RechnungAlsBezahltMarkieren
input: {data: {id: int}}
output: {success: bool}
permissions: ["standard_rechnungalsbezahltmarkieren"]

### tool: openxe-delete-draft-invoice
description: Delete draft invoice (only if belegnr is empty or '0')
endpoint: DELETE /v1/belege/rechnungen/{id}
input: {id: int}
output: 204 No Content
permissions: ["delete_invoice"]
notes: Only works on drafts. Cascades to positions and protocol entries.

### tool: openxe-create-delivery-note
description: Create delivery note
endpoint: POST /api/LieferscheinCreate
input: {data: {adresse: int, auftragid?: int, positionen: [{artikel: int, menge: number}]}}
output: {success: bool, data: {id: int, belegnr: string}}
permissions: ["standard_lieferscheincreate"]

### tool: openxe-create-credit-note
description: Create credit note/memo
endpoint: POST /api/GutschriftCreate
input: {data: {adresse: int, rechnungid?: int, positionen: [{artikel: int, menge: number, preis: number}]}}
output: {success: bool, data: {id: int}}
permissions: ["standard_gutschriftcreate"]

---
## Tracking & Shipping

### tool: openxe-list-tracking
description: List tracking numbers with filters
endpoint: GET /v1/trackingnummern
input: {lieferschein?: int, auftrag?: int, tracking?: string, versandart?: string, datum_von?: date, datum_bis?: date, abgeschlossen?: 0|1}
output: {data: TrackingNumber[]}
permissions: ["list_tracking_numbers"]

### tool: openxe-create-tracking
description: Create tracking number for a delivery note
endpoint: POST /v1/trackingnummern
input: {lieferschein: int, tracking: string, versandart?: string, gewicht?: number, tracking_link?: string}
output: {data: TrackingNumber}
permissions: ["create_tracking_number"]

---
## CRM

### tool: openxe-list-crm-documents
description: List CRM documents (notes, emails, call logs)
endpoint: GET /v1/crm_dokumente
input: {adresse?: int, typ?: "notiz"|"email"|"telefonat", datum_von?: date, datum_bis?: date, projekt?: int}
output: {data: CrmDocument[]}
permissions: ["list_crm_documents"]

### tool: openxe-create-crm-document
description: Create CRM document
endpoint: POST /v1/crm_dokumente
input: {adresse: int, typ: "notiz"|"email"|"telefonat", betreff: string, inhalt?: string, datum?: date, projekt?: int}
output: {data: CrmDocument}
permissions: ["create_crm_document"]

---
## Subscriptions

### tool: openxe-create-subscription
description: Create recurring subscription item
endpoint: POST /v1/aboartikel
input: {adresse: int, artikel: int, menge: number, intervall_monate: int, startdatum: date, preis?: number, waehrung?: string, enddatum?: date, abogruppe?: int}
output: {data: Subscription}
permissions: ["create_subscription"]

---
## Files & Documents

### tool: openxe-upload-file
description: Upload file attached to an object (article, address, order, etc.)
endpoint: POST /v1/dateien
input: {filename: string, content_base64: string, objekt: "Artikel"|"Adresse"|"Auftrag"|..., parameter: int, titel?: string, beschreibung?: string}
output: {success: bool, id: int}
permissions: ["create_file"]
notes: Content-Type must be application/x-www-form-urlencoded

### tool: openxe-upload-scan
description: Upload scanned document for processing
endpoint: POST /v1/docscan
input: {content_base64: string, filename: string, typ?: string, lieferant?: int, bemerkung?: string}
output: {data: DocScan}
permissions: ["create_scanned_document"]

---
## Warehouse

### tool: openxe-list-storage-batches
description: List storage batches (charges) for inventory tracking
endpoint: GET /v1/lagercharge
input: {artikel?: int, lager_platz?: int, charge?: string, menge_gt?: number}
output: {data: StorageBatch[]}
permissions: ["view_storage_batch"]

### tool: openxe-list-best-before
description: List best-before dates in warehouse
endpoint: GET /v1/lagermhd
input: {artikel?: int, lager_platz?: int, mhd_von?: date, mhd_bis?: date, abgelaufen?: 0|1}
output: {data: BestBefore[]}
permissions: ["view_storage_best_before"]

---
## Tasks & Reminders

### tool: openxe-create-resubmission
description: Create task/reminder with due date
endpoint: POST /v1/wiedervorlagen
input: {betreff: string, faellig_am: date, beschreibung?: string, adresse?: int, bearbeiter?: string, prioritaet?: "niedrig"|"normal"|"hoch"|"dringend", modul?: string, parameter?: int}
output: {data: Resubmission}
permissions: ["create_resubmission"]

### tool: openxe-list-resubmissions
description: List tasks/reminders with filters
endpoint: GET /v1/wiedervorlagen
input: {bearbeiter?: string, faellig_von?: date, faellig_bis?: date, erledigt?: 0|1, prioritaet?: string, modul?: string}
output: {data: Resubmission[]}
permissions: ["list_resubmissions"]

---
## System

### tool: openxe-server-time
description: Get current server time
endpoint: POST /api/ServerTimeGet
input: {data: {}}
output: {success: bool, data: {time: string}}
permissions: ["standard_servertimeget"]

### tool: openxe-run-report
description: Run a predefined or custom report
endpoint: GET /v1/reports/{id}
input: {id: int, datum_von?: date, datum_bis?: date, format?: "json"|"csv"|"pdf", projekt?: int}
output: {data: ReportResult}
permissions: ["view_report"]

---
## Document Workflow Chains

# Typical flow: Quote -> Order -> Invoice + Delivery Note
# AngebotCreate -> AngebotFreigabe -> AngebotZuAuftrag -> AuftragFreigabe -> AuftragZuRechnung + LieferscheinCreate
# Credit flow: RechnungGet -> WeiterfuehrenRechnungZuGutschrift -> GutschriftFreigabe
