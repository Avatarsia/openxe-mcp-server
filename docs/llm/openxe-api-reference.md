# OpenXE API Reference (LLM-Optimized)

## Live Instance Compatibility (tested against v1.12)
# WORKING: adressen, artikel, artikelkategorien, versandarten, dateien, belege/angebote, belege/auftraege, belege/rechnungen, belege/lieferscheine
# NOT AVAILABLE (404): adresstyp, gruppen, eigenschaften, eigenschaftenwerte, steuersaetze, zahlungsweisen, laender, gutschriften, lagercharge, lagermhd, trackingnummern, aboartikel, abogruppen, crmdokumente, wiedervorlagen, docscan
# BROKEN (500): lieferadressen, OpenTRANS, Mobile Dashboard
# API PATH: /api/index.php/ (not /api/ — Apache blocks direct access)
# FILTERS: Only kundennummer works on adressen; other filters silently ignored
# INCLUDES: verkaufspreise, lagerbestand, positionen, protokoll all work
# LEGACY: JSON payloads work, XML loses fields on Create

# Auth: HTTP Digest (realm=Xentral-API, algo=MD5, nonce TTL=24h, no rate limit)
# Credentials: api_account table — remotedomain=username, initkey=password, aktiv=1, permissions=JSON array
# Response: JSON (default) or XML via Accept header
# Pagination: ?page=1&items_per_page=20 — headers: X-Total-Count, X-Page, X-Items-Per-Page
# Errors: {error:{code,http_code,message,href}} — codes 74xx range
# Filter syntax REST v1 Stammdaten: ?field=val (%LIKE%), ?field_equals=val (=), ?field_startswith=val, ?field_endswith=val
# Filter syntax REST v1 Belege: ?filter[field]=val, ?filter[field_gt]=val, ?filter[field_gte]=val, ?filter[field_lt]=val, ?filter[field_lte]=val

## Error Codes
# 7411 unauthorized | 7412 digest-incomplete | 7413 account-missing | 7414 account-invalid
# 7416 nonce-invalid | 7417 nonce-expired(stale=true) | 7418 username-empty | 7419 auth-type-wrong
# 7421 permission-missing(returns 401 not 403!) | 7431 route-not-found | 7432 method-not-allowed
# 7451 bad-request | 7452 resource-not-found | 7453 validation-error(400 not 422) | 7454 invalid-arg
# 7455 malformed-body | 7456 content-type-unsupported | 7481 server-misconfigured | 7499 unexpected

---
## REST v1 — Stammdaten (Master Data) — Read

GET /v1/adressen — list addresses | 42 filters: rolle(%LIKE%),projekt(=),firma(=),typ,sprache,waehrung,land(LIKE),name(%LIKE%+equals/starts/ends),kundennummer(%LIKE%+eq/starts/ends),lieferantennummer(%LIKE%+eq/starts/ends),mitarbeiternummer(%LIKE%+eq/starts/ends),email(%LIKE%+eq/starts/ends),freifeld1-10(%LIKE%+eq) | sorts: name,kundennummer,lieferantennummer,mitarbeiternummer | ~170 cols | perm: list_addresses
GET /v1/adressen/{id} — single address | perm: view_address
GET /v1/lieferadressen — list delivery addresses | filters: adresse(=),typ(=),name(%LIKE%+eq/starts/ends),standardlieferadresse(=),land(=),id_ext(=) | sorts: typ,name,plz,land | perm: list_delivery_addresses
GET /v1/lieferadressen/{id} — single delivery address | perm: view_delivery_address
GET /v1/adresstyp — list address types | filters: bezeichnung(%LIKE%+exakt),type(LIKE),projekt(=),netto(=),aktiv(=) | sorts: bezeichnung,type,projekt,netto,aktiv | includes: projekt | perm: list_address_types
GET /v1/adresstyp/{id} — single address type | perm: view_address_type
GET /v1/artikel — list articles (READ-ONLY) | 23 filters: typ(LIKE),name_de(%LIKE%+exakt/starts/ends/eq),name_en(%LIKE%+exakt/starts/ends/eq),nummer(%LIKE%+exakt/starts/ends/eq),projekt(=),adresse(=),katalog(=),firma(=),ausverkauft(=),startseite(=),topseller(=) | sorts: name_de,name_en,nummer,typ | includes: verkaufspreise,lagerbestand(only if lagerartikel=1),dateien,projekt | ~300+ cols | NOTE: no preis/waehrung/aktiv fields; use inaktiv(inverted) | perm: list_articles
GET /v1/artikel/{id} — single article | perm: view_article
GET /v1/artikelkategorien — list categories | filters: bezeichnung(%LIKE%+exakt),projekt(=),parent(=) | sorts: bezeichnung,projekt,parent | includes: projekt | perm: list_article_category
GET /v1/artikelkategorien/{id} — single category | perm: view_article_category
GET /v1/gruppen — list groups | filters: name(%LIKE%+exakt),kennziffer(%LIKE%+exakt),art(LIKE),projekt(=),kategorie(=),aktiv(=) | sorts: name,art,kennziffer,projekt,kategorie,aktiv | 8 of 50+ cols | perm: list_groups
GET /v1/gruppen/{id} — single group | perm: view_group
GET /v1/eigenschaften — list properties | filters: artikel(=),name(%LIKE%),typ(=),projekt(=),geloescht(=) | sorts: artikel,name,typ,projekt,geloescht | perm: list_property
GET /v1/eigenschaften/{id} — single property | perm: view_property
GET /v1/eigenschaftenwerte — list property values | filters: artikeleigenschaften(=),artikel(=),wert(%LIKE%) | sorts: artikel,wert | 4 of 7 cols | perm: list_property_value
GET /v1/eigenschaftenwerte/{id} — single property value | perm: view_property_value
GET /v1/steuersaetze — list tax rates | filters: bezeichnung(%LIKE%),country_code(=),satz(=),aktiv(=) | sorts: bezeichnung,country_code,satz,aktiv | 5 of 12 cols | perm: list_tax_rates
GET /v1/steuersaetze/{id} — single tax rate | perm: view_tax_rate
GET /v1/zahlungsweisen — list payment methods (soft-delete filtered) | filters: bezeichnung(%LIKE%+exakt),type(LIKE+exakt),projekt(=),verhalten(=),aktiv(=) | sorts: bezeichnung,type,projekt,modul,aktiv | includes: projekt | perm: list_payment_methods
GET /v1/zahlungsweisen/{id} — single payment method | perm: view_payment_method
GET /v1/versandarten — list shipping methods (soft-delete filtered) | filters: bezeichnung(%LIKE%+exakt),type(LIKE+exakt),projekt(=),modul(=),aktiv(=) | sorts: bezeichnung,type,projekt,modul,aktiv | includes: projekt | perm: list_shipping_methods
GET /v1/versandarten/{id} — single shipping method | perm: view_shipping_method
GET /v1/laender — list countries | filters: bezeichnung_de(%LIKE%),bezeichnung_en(BUG:searches bezeichnung_de!),iso(=),eu(=),id_ext(=) | sorts: bezeichnung,bezeichnung_de,bezeichnung_en,iso,eu | perm: list_countries
GET /v1/laender/{id} — single country | perm: view_country

## REST v1 — Stammdaten — Write

POST /v1/adressen — BROKEN (insertQuery returns false) — use Legacy API
PUT /v1/adressen/{id} — BROKEN (updateQuery returns false) — use Legacy API
POST /v1/lieferadressen — create delivery address | req: name | validate: adresse(must exist),typ(must exist in adresse_typ),land(2-char ISO),ust_befreit(0-3) | perm: create_delivery_address
PUT /v1/lieferadressen/{id} — update delivery address | perm: edit_delivery_address
DELETE /v1/lieferadressen/{id} — delete delivery address | perm: delete_delivery_address
POST /v1/adresstyp — create address type | req: bezeichnung,type | perm: create_address_type
PUT /v1/adresstyp/{id} — update address type | perm: edit_address_type
POST /v1/artikelkategorien — create category | req: bezeichnung(unique) | perm: create_article_category
PUT /v1/artikelkategorien/{id} — update category | perm: edit_article_category
POST /v1/gruppen — create group | perm: create_group
PUT /v1/gruppen/{id} — update group | perm: edit_group
POST /v1/eigenschaften — create property | perm: create_property
PUT /v1/eigenschaften/{id} — update property | perm: edit_property
DELETE /v1/eigenschaften/{id} — delete property | perm: delete_property
POST /v1/eigenschaftenwerte — create property value | perm: create_property_value
PUT /v1/eigenschaftenwerte/{id} — update property value | perm: edit_property_value
DELETE /v1/eigenschaftenwerte/{id} — delete property value | perm: delete_property_value
POST /v1/steuersaetze — create tax rate | perm: create_tax_rate
PUT /v1/steuersaetze/{id} — update tax rate | perm: edit_tax_rate
POST /v1/zahlungsweisen — create payment method | perm: create_payment_method
PUT /v1/zahlungsweisen/{id} — update payment method | perm: edit_payment_method
POST /v1/versandarten — create shipping method | perm: create_shipping_method
PUT /v1/versandarten/{id} — update shipping method | perm: edit_shipping_method
POST /v1/laender — create country | perm: create_country
PUT /v1/laender/{id} — update country | perm: edit_country

---
## REST v1 — Belege (Documents) — Read

# Common: pagination(?page,?items_per_page), filter syntax: ?filter[field]=val, sorts: belegnr,datum, includes: positionen,protokoll
GET /v1/belege/angebote — list quotes | 17 filters: status(LIKE),belegnr(%LIKE%+eq/starts/ends),kundennummer(%LIKE%+eq/starts/ends),datum(=+gt/gte/lt/lte),projekt(=) | perm: list_quotes
GET /v1/belege/angebote/{id} — single quote | perm: view_quote
GET /v1/belege/auftraege — list orders | 21 filters: base17+internet(%LIKE%+eq/starts/ends),angebot(%LIKE%),angebotid(=) | BUG: selectIdsQuery uses wrong alias s.id vs au.id | perm: list_orders
GET /v1/belege/auftraege/{id} — single order | perm: view_order
GET /v1/belege/rechnungen — list invoices | 17 filters: base15+auftrag(%LIKE%),auftragid(=) | perm: list_invoices
GET /v1/belege/rechnungen/{id} — single invoice | perm: view_invoice
GET /v1/belege/lieferscheine — list delivery notes | filters: base+auftrag(SMART:resolves belegnr to id),auftragid(=) | perm: list_delivery_notes
GET /v1/belege/lieferscheine/{id} — single delivery note | perm: view_delivery_note
GET /v1/belege/gutschriften — list credit memos | filters: base+rechnung(%LIKE%),rechnungid(=) | perm: list_credit_memos
GET /v1/belege/gutschriften/{id} — single credit memo | perm: view_credit_memo

## REST v1 — Belege — Write

DELETE /v1/belege/rechnungen/{id} — delete DRAFT invoice only (belegnr='' or '0') | cascades: positions+protocol | perm: delete_invoice

## REST v1 — Belege — ERRATA (fields that do NOT exist)
# angebote: summe(fabricated) | auftraege: auftragsnummer,beauftragtvon,kommissionskonsignationslager

---
## REST v1 — Sonstige (Other Resources)

# Dateien (Files)
POST /v1/dateien — upload file | req: filename,content_base64,objekt,parameter | opt: titel,beschreibung,nummer,stichwort | Content-Type: application/x-www-form-urlencoded | perm: create_file
GET /v1/dateien — list files | filters: objekt,parameter,stichwort | includes: FileKeyword | perm: list_files
GET /v1/dateien/{id} — single file metadata | perm: view_file
DELETE /v1/dateien/{id} — delete file | perm: view_file

# Trackingnummern
GET /v1/trackingnummern — list | 20 filters: id,lieferschein,lieferschein_nummer,auftrag,auftrag_nummer,tracking(%),versandart,gewicht,tracking_link,anzahl_pakete,datum,datum_von,datum_bis,abgeschlossen,adresse,projekt,status,versendet,sort,order | perm: list_tracking_numbers
GET /v1/trackingnummern/{id} — single | perm: view_tracking_number
POST /v1/trackingnummern — create | req: lieferschein,tracking | opt: versandart,gewicht,tracking_link | perm: create_tracking_number
PUT /v1/trackingnummern/{id} — update | perm: edit_tracking_number
DELETE /v1/trackingnummern/{id} — delete | perm: edit_tracking_number

# Aboartikel (Subscriptions)
GET /v1/aboartikel — list | filters: adresse,artikel,projekt,status,abogruppe,naechste_rechnung_von/bis | perm: list_subscriptions
GET /v1/aboartikel/{id} — single | perm: view_subscription
POST /v1/aboartikel — create | req: adresse,artikel,menge,intervall_monate,startdatum | opt: bezeichnung,preis,waehrung,steuersatz,enddatum,naechste_rechnung,abogruppe,projekt,status | perm: create_subscription
PUT /v1/aboartikel/{id} — update | perm: edit_subscription
DELETE /v1/aboartikel/{id} — soft-delete (sets gekuendigt) | perm: delete_subscription

# Abogruppen (Subscription Groups)
GET /v1/abogruppen — list | perm: list_subscription_groups
GET /v1/abogruppen/{id} — single | perm: view_subscription_group
POST /v1/abogruppen — create | req: bezeichnung | opt: beschreibung,projekt,intervall,aktiv | perm: create_subscription_group
PUT /v1/abogruppen/{id} — update | perm: edit_subscription_group
DELETE /v1/abogruppen/{id} — delete (only if no linked aboartikel) | perm: edit_subscription_group

# CRM-Dokumente
GET /v1/crm_dokumente — list | filters: adresse,typ(notiz/email/telefonat),datum_von,datum_bis,projekt,bearbeiter | perm: list_crm_documents
GET /v1/crm_dokumente/{id} — single | perm: view_crm_document
POST /v1/crm_dokumente — create | req: adresse,typ,betreff | opt: inhalt,datum,projekt | perm: create_crm_document
PUT /v1/crm_dokumente/{id} — update | perm: edit_crm_document
DELETE /v1/crm_dokumente/{id} — delete | perm: delete_crm_document

# Lagercharge (Storage Batches)
GET /v1/lagercharge — list | filters: artikel,lager_platz,charge,menge_gt | perm: view_storage_batch
GET /v1/lagercharge/{id} — single | perm: view_storage_batch
POST /v1/lagercharge — create | req: artikel,lager_platz,charge,menge | opt: internebemerkung | perm: view_storage_batch
PUT /v1/lagercharge/{id} — update | perm: view_storage_batch
DELETE /v1/lagercharge/{id} — delete (only if menge=0) | perm: view_storage_batch

# Lagermhd (Best-Before Dates)
GET /v1/lagermhd — list | filters: artikel,lager_platz,mhd,mhd_von,mhd_bis,abgelaufen | perm: view_storage_best_before
GET /v1/lagermhd/{id} — single | perm: view_storage_best_before
POST /v1/lagermhd — create | req: artikel,lager_platz,mhd,menge | opt: charge | perm: view_storage_best_before
PUT /v1/lagermhd/{id} — update | perm: view_storage_best_before
DELETE /v1/lagermhd/{id} — delete | perm: view_storage_best_before

# Reports
GET /v1/reports — list | filters: modul,kategorie | perm: view_report
GET /v1/reports/{id} — run report | params: datum_von,datum_bis,format(json/csv/pdf),projekt | perm: view_report
POST /v1/reports — create custom report | req: name,modul,sql_query | opt: kategorie,beschreibung | perm: view_report

# Docscan
GET /v1/docscan — list | filters: status(neu/zugeordnet/verarbeitet),datum_von,datum_bis,typ,lieferant | includes: DocScannerMetaData | perm: list_scanned_documents
GET /v1/docscan/{id} — single | perm: view_scanned_document
POST /v1/docscan — upload scan | req: content_base64,filename | opt: typ,lieferant,bemerkung | perm: create_scanned_document
PUT /v1/docscan/{id} — update/assign | fields: status,beleg_typ,beleg_id,bemerkung | perm: view_scanned_document
DELETE /v1/docscan/{id} — delete | perm: view_scanned_document

# Wiedervorlagen (Resubmissions/Tasks)
GET /v1/wiedervorlagen — list | filters: adresse,bearbeiter,faellig_von,faellig_bis,erledigt,prioritaet(niedrig/normal/hoch/dringend),modul,parameter,projekt | perm: list_resubmissions
GET /v1/wiedervorlagen/{id} — single | perm: view_resubmission
POST /v1/wiedervorlagen — create | req: betreff,faellig_am | opt: beschreibung,adresse,bearbeiter,prioritaet,modul,parameter,projekt | perm: create_resubmission
PUT /v1/wiedervorlagen/{id} — update | extra: erledigt(1=done) | perm: edit_resubmission
DELETE /v1/wiedervorlagen/{id} — delete | perm: edit_resubmission

# Include-only sub-resources (no standalone endpoints)
# StorageLocation — includable on: artikel,lagercharge,lagermhd
# SalesPrice — includable on: artikel (via ?include=verkaufspreise)
# Project — includable on: auftrag,rechnung,lieferschein,bestellung,artikel,adresse
# DocScannerMetaData — includable on: docscan
# FileKeyword — includable on: dateien

---
## Legacy API (POST /api/{Action})
# Pattern: POST /api/{Action} with JSON body {"data":{...}}
# Permission: standard_{lowercase(action)}
# Response: {"success":true,"data":{...}} or {"success":false,"error":"..."}

# Addresses (12 endpoints)
POST /api/AdresseCreate — create address | perm: standard_adressecreate
POST /api/AdresseEdit — edit address | perm: standard_adresseedit
POST /api/AdresseGet — get address by id | perm: standard_adresseget
POST /api/AdresseListeGet — list addresses | perm: standard_adresselisteget
POST /api/AdresseGruppenList — list address groups | perm: standard_adressegruppenlist
POST /api/AdresseAccountsGet — get accounts for address | perm: standard_adresseaccountsget
POST /api/AdresseAccountCreate — create account (alias: AccountCreate) | perm: standard_adresseaccountcreate
POST /api/AdresseAccountEdit — edit account (alias: AccountEdit) | perm: standard_adresseaccountedit
POST /api/AdresseKontaktCreate — create contact | perm: standard_adressekontaktcreate
POST /api/AdresseKontaktEdit — edit contact | perm: standard_adressekontaktedit
POST /api/AdresseKontaktList — list contacts | perm: standard_adressekontaktlist
POST /api/AdresseKontaktGet — get contact | perm: standard_adressekontaktget

# Articles (7)
POST /api/ArtikelCreate — create article | perm: standard_artikelcreate
POST /api/ArtikelEdit — edit article | perm: standard_artikeledit
POST /api/ArtikelGet — get article | perm: standard_artikelget
POST /api/ArtikelList — list articles | perm: standard_artikellist
POST /api/ArtikelkategorienList — list categories | perm: standard_artikelkategorienlist
POST /api/ArtikelkontingenteGet — get contingents | perm: standard_artikelkontingenteget
POST /api/PreiseEdit — edit prices | perm: standard_preiseedit

# BOM (4)
POST /api/ArtikelStuecklisteCreate — create BOM entry | perm: standard_artikelstuecklistecreate
POST /api/ArtikelStuecklisteEdit — edit BOM entry | perm: standard_artikelstuecklisteedit
POST /api/ArtikelStuecklisteList — list BOM entries | perm: standard_artikelstuecklistelist
POST /api/ArtikelStueckliste — get full BOM | perm: standard_artikelstueckliste

# Quotes (7)
POST /api/AngebotCreate — create quote | perm: standard_angebotcreate
POST /api/AngebotEdit — edit quote | perm: standard_angebotedit
POST /api/AngebotGet — get quote | perm: standard_angebotget
POST /api/AngebotFreigabe — release quote | perm: standard_angebotfreigabe
POST /api/AngebotVersenden — send quote | perm: standard_angebotversenden
POST /api/AngebotArchivieren — archive quote | perm: standard_angebotarchivieren
POST /api/AngebotZuAuftrag — convert quote to order | perm: standard_angebotzuauftrag

# Sales Orders (9)
POST /api/AuftragCreate — create order | perm: standard_auftragcreate
POST /api/AuftragEdit — edit order | perm: standard_auftragedit
POST /api/AuftragGet — get order | perm: standard_auftragget
POST /api/AuftragFreigabe — release order | perm: standard_auftragfreigabe
POST /api/AuftragVersenden — send order confirmation | perm: standard_auftragversenden
POST /api/AuftragArchivieren — archive order | perm: standard_auftragarchivieren
POST /api/AuftragAbschliessen — close order | perm: standard_auftragabschliessen
POST /api/AuftragZuRechnung — convert order to invoice | perm: standard_auftragzurechnung
POST /api/WeiterfuehrenAuftragZuRechnung — continue order->invoice | perm: standard_weiterfuehrenauftragzurechnung

# Invoices (8)
POST /api/RechnungCreate — create invoice | perm: standard_rechnungcreate
POST /api/RechnungEdit — edit invoice | perm: standard_rechnungedit
POST /api/RechnungGet — get invoice | perm: standard_rechnungget
POST /api/RechnungFreigabe — release invoice | perm: standard_rechnungfreigabe
POST /api/RechnungVersenden — send invoice | perm: standard_rechnungversenden
POST /api/RechnungArchivieren — archive invoice | perm: standard_rechnungarchivieren
POST /api/RechnungVersendetMarkieren — mark invoice sent | perm: standard_rechnungversendetmarkieren
POST /api/RechnungAlsBezahltMarkieren — mark invoice paid | perm: standard_rechnungalsbezahltmarkieren

# Delivery Notes (6)
POST /api/LieferscheinCreate — create delivery note | perm: standard_lieferscheincreate
POST /api/LieferscheinEdit — edit delivery note | perm: standard_lieferscheinedit
POST /api/LieferscheinGet — get delivery note | perm: standard_lieferscheinget
POST /api/LieferscheinFreigabe — release | perm: standard_lieferscheinfreigabe
POST /api/LieferscheinVersenden — send | perm: standard_lieferscheinversenden
POST /api/LieferscheinArchivieren — archive | perm: standard_lieferscheinarchivieren

# Credit Notes (7)
POST /api/GutschriftCreate — create credit note | perm: standard_gutschriftcreate
POST /api/GutschriftEdit — edit credit note | perm: standard_gutschriftedit
POST /api/GutschriftGet — get credit note | perm: standard_gutschriftget
POST /api/GutschriftFreigabe — release | perm: standard_gutschriftfreigabe
POST /api/GutschriftVersenden — send | perm: standard_gutschriftversenden
POST /api/GutschriftArchivieren — archive | perm: standard_gutschriftarchivieren
POST /api/WeiterfuehrenRechnungZuGutschrift — continue invoice->credit | perm: standard_weiterfuehrenrechnungzugutschrift

# Returns (3)
POST /api/RetoureCreate — create return | perm: standard_retourecreate
POST /api/RetoureEdit — edit return | perm: standard_retoureedit
POST /api/RetoureGet — get return | perm: standard_retoureget

# Purchase Orders (4)
POST /api/BestellungCreate — create PO | perm: standard_bestellungcreate
POST /api/BestellungEdit — edit PO | perm: standard_bestellungedit
POST /api/BestellungGet — get PO | perm: standard_bestellungget
POST /api/BestellungFreigabe — release PO | perm: standard_bestellungfreigabe

# Documents Generic (7)
POST /api/BelegeList — list all docs | perm: standard_belegelist
POST /api/BelegGet — get any doc by typ+id | perm: standard_belegget
POST /api/BelegPDF — get doc as PDF | perm: standard_belegpdf
POST /api/BelegPDFHeader — get PDF header info | perm: standard_belegpdfheader
POST /api/BelegOhnePositionenList — list docs without line items | perm: standard_belegohnepositionenlist
POST /api/BelegCreate — generic doc create (dispatcher) | perm: standard_belegcreate
POST /api/BelegEdit — generic doc edit (dispatcher) | perm: standard_belegedit

# Projects (4)
POST /api/ProjektCreate | POST /api/ProjektEdit | POST /api/ProjektGet | POST /api/ProjektListe

# Subscriptions (8)
POST /api/AdresseAboArtikelCreate | POST /api/AdresseAboArtikelEdit | POST /api/AdresseAboArtikelGet | POST /api/AdresseAboArtikelList
POST /api/AdresseAboGruppeCreate | POST /api/AdresseAboGruppeEdit | POST /api/AdresseAboGruppeGet | POST /api/AdresseAboGruppeList

# Delivery Addresses (2)
POST /api/LieferadresseCreate | POST /api/LieferadresseEdit

# Groups (4)
POST /api/GruppeCreate | POST /api/GruppeEdit | POST /api/GruppeGet | POST /api/GruppenList

# Contacts (2)
POST /api/AnsprechpartnerCreate | POST /api/AnsprechpartnerEdit

# Users (5)
POST /api/BenutzerCreate | POST /api/BenutzerEdit | POST /api/BenutzerGet | POST /api/BenutzerList | POST /api/BenutzerGetRFID

# Time Tracking (7)
POST /api/ZeiterfassungCreate | POST /api/ZeiterfassungEdit | POST /api/ZeiterfassungDelete | POST /api/ZeiterfassungGet
POST /api/StechuhrStatusGet | POST /api/StechuhrStatusSet | POST /api/StechuhrSummary

# Files (5)
POST /api/DateiDownload | POST /api/DateiVorschau | POST /api/DateiList | POST /api/DateiHeader | POST /api/Shopimages

# Auth/Sessions (4)
POST /api/AccountLogin | POST /api/AccountList | POST /api/SessionStart | POST /api/SessionClose

# Reports/Export (2)
POST /api/BerichteGet | POST /api/ExportVorlageGet

# Mapping (2)
POST /api/MappingGet | POST /api/MappingSet

# System (3)
POST /api/ServerTimeGet | POST /api/Etikettendrucker | POST /api/Custom

# Travel Expenses (1)
POST /api/ReisekostenVersenden

---
## Known Bugs & Gotchas

1. REST v1 Adressen POST/PUT: Routes exist but return false — use Legacy AdresseCreate/AdresseEdit
2. REST v1 Artikel: Read-only, POST/PUT commented out — use Legacy ArtikelCreate/ArtikelEdit
3. REST v1 Laender filter bezeichnung_en: BUG searches bezeichnung_de column instead
4. REST v1 Auftraege selectIdsQuery: Wrong alias s.id instead of au.id — may cause SQL errors
5. REST v1 Rechnungen Protocol: Exposes wrong FK (lieferschein instead of rechnung) — masked by columns override
6. Permission missing returns 401 (not 403) — code 7421
7. Validation errors return 400 (not 422) — code 7453
8. Zahlungsweisen/Versandarten: soft-deleted records permanently hidden from API
9. Gruppen: only 8 of 50+ DB columns exposed
10. Artikel: no preis/waehrung/aktiv fields — prices via include=verkaufspreise, active via inaktiv(inverted)
