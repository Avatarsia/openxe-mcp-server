import { z } from "zod";
import { PaginationParams, SortDirection, DateString } from "./common.js";

/** Shared filter fields across all document types. */
const BaseDocumentFilter = z.object({
  status: z.string().optional().describe("Status filter (LIKE)"),
  belegnr: z.string().optional().describe("Document number (%LIKE%)"),
  belegnr_equals: z.string().optional().describe("Exact document number"),
  kundennummer: z.string().optional().describe("Customer number (%LIKE%)"),
  kundennummer_equals: z
    .string()
    .optional()
    .describe("Exact customer number"),
  datum_gte: z
    .string()
    .optional()
    .describe("Date from (>=, YYYY-MM-DD)"),
  datum_lte: z.string().optional().describe("Date to (<=, YYYY-MM-DD)"),
  projekt: z.string().optional().describe("Project filter"),
});

export const QuoteListParams = PaginationParams.extend({
  filter: BaseDocumentFilter.optional(),
  sort: z.enum(["belegnr", "datum"]).optional(),
  direction: SortDirection,
  include: z
    .string()
    .optional()
    .describe("Comma-separated: positionen,protokoll"),
});

export const OrderListParams = PaginationParams.extend({
  filter: BaseDocumentFilter.extend({
    internet: z.string().optional().describe("Internet/shop reference"),
    angebotid: z.number().int().optional().describe("Source quote ID"),
  }).optional(),
  sort: z.enum(["belegnr", "datum"]).optional(),
  direction: SortDirection,
  include: z.string().optional(),
});

export const InvoiceListParams = PaginationParams.extend({
  filter: BaseDocumentFilter.extend({
    auftragid: z.number().int().optional().describe("Source order ID"),
  }).optional(),
  sort: z.enum(["belegnr", "datum"]).optional(),
  direction: SortDirection,
  include: z.string().optional(),
});

export const DeliveryNoteListParams = PaginationParams.extend({
  filter: BaseDocumentFilter.extend({
    auftrag: z
      .string()
      .optional()
      .describe("Order reference (smart: resolves belegnr to id)"),
    auftragid: z.number().int().optional().describe("Source order ID"),
  }).optional(),
  sort: z.enum(["belegnr", "datum"]).optional(),
  direction: SortDirection,
  include: z.string().optional(),
});

export const CreditMemoListParams = PaginationParams.extend({
  filter: BaseDocumentFilter.extend({
    rechnungid: z.number().int().optional().describe("Source invoice ID"),
  }).optional(),
  sort: z.enum(["belegnr", "datum"]).optional(),
  direction: SortDirection,
  include: z.string().optional(),
});

export const DocumentGetParams = z.object({
  id: z.number().int().positive().describe("Document ID"),
  include: z.string().optional().describe("Comma-separated: positionen,protokoll"),
});

/** Line item for document creation. Only nummer, menge, preis — do NOT include bezeichnung (causes PDF formatting issues). */
const PositionInput = z.object({
  nummer: z
    .union([z.number().int(), z.string()])
    .describe("Article number (Artikelnummer) or article ID"),
  menge: z.number().positive().describe("Quantity"),
  preis: z.number().optional().describe("Unit price (overrides default)"),
});

export const OrderCreateInput = z.object({
  adresse: z.number().int().positive().describe("Customer address ID"),
  datum: z.string().optional().describe("Order date (YYYY-MM-DD)"),
  projekt: z.string().optional().describe("Project reference"),
  positionen: z
    .array(PositionInput)
    .min(1)
    .describe("Line items (at least one)"),
  zahlungsweise: z.string().optional().describe("Payment method"),
  lieferbedingung: z.string().optional().describe("Delivery terms"),
  freitext: z.string().optional().describe("Free text / notes"),
  internebezeichnung: z.string().optional().describe("Internal note (not printed on document)"),
  versandart: z.string().optional().describe("Shipping method"),
  waehrung: z.string().optional().describe("Currency (e.g. EUR, USD)"),
  lieferdatum: z.string().optional().describe("Delivery date YYYY-MM-DD"),
});

export const QuoteCreateInput = z.object({
  adresse: z.number().int().positive().describe("Customer address ID"),
  datum: z.string().optional().describe("Quote date (YYYY-MM-DD)"),
  positionen: z
    .array(
      z.object({
        nummer: z.union([z.number().int(), z.string()]).describe("Article number or ID"),
        menge: z.number().positive().describe("Quantity"),
        preis: z.number().optional().describe("Unit price override"),
      })
    )
    .min(1),
  gueltigbis: z.string().optional().describe("Valid until date (YYYY-MM-DD)"),
  freitext: z.string().optional().describe("Free text / notes on document"),
  internebezeichnung: z.string().optional().describe("Internal note"),
  projekt: z.string().optional().describe("Project"),
  zahlungsweise: z.string().optional().describe("Payment method"),
  lieferbedingung: z.string().optional().describe("Delivery terms"),
});

export const InvoiceCreateInput = z.object({
  adresse: z.number().int().positive().describe("Customer address ID"),
  datum: z.string().optional().describe("Invoice date (YYYY-MM-DD)"),
  positionen: z
    .array(
      z.object({
        nummer: z.union([z.number().int(), z.string()]).describe("Article number or ID"),
        menge: z.number().positive().describe("Quantity"),
        preis: z.number().describe("Unit price"),
      })
    )
    .min(1),
  freitext: z.string().optional().describe("Free text"),
  internebezeichnung: z.string().optional().describe("Internal note"),
  projekt: z.string().optional().describe("Project"),
  zahlungsweise: z.string().optional().describe("Payment method"),
  zahlungszieltage: z.string().optional().describe("Payment term days"),
});

export const DeliveryNoteCreateInput = z.object({
  adresse: z.number().int().positive().describe("Customer address ID"),
  auftragid: z.number().int().optional().describe("Source order ID"),
  positionen: z
    .array(
      z.object({
        nummer: z.union([z.number().int(), z.string()]).describe("Article number or ID"),
        menge: z.number().positive().describe("Quantity"),
      })
    )
    .min(1),
});

export const CreditNoteCreateInput = z.object({
  adresse: z.number().int().positive().describe("Customer address ID"),
  rechnungid: z.number().int().optional().describe("Source invoice ID"),
  positionen: z
    .array(
      z.object({
        nummer: z.union([z.number().int(), z.string()]).describe("Article number or ID"),
        menge: z.number().positive().describe("Quantity"),
        preis: z.number().describe("Unit price"),
      })
    )
    .min(1),
});

export const DocumentIdInput = z.object({
  id: z.number().int().positive().describe("Document ID"),
});

export const BelegPDFInput = z.object({
  typ: z
    .enum(["angebot", "auftrag", "rechnung", "lieferschein", "gutschrift", "bestellung"])
    .describe("Document type"),
  id: z.number().int().positive().describe("Document ID"),
});

// Purchase Order schemas
export const ListPurchaseOrdersInput = z.object({
  status: z.string().optional().describe("Filter by status: offen, freigegeben, bestellt, angemahnt, empfangen"),
  belegnr: z.string().optional().describe("Filter by Belegnummer"),
  lieferantennummer: z.string().optional().describe("Filter by Lieferantennummer"),
  name: z.string().optional().describe("Filter by supplier name (contains)"),
  datum_gte: z.string().optional().describe("Orders from date (YYYY-MM-DD)"),
  datum_lte: z.string().optional().describe("Orders until date (YYYY-MM-DD)"),
  projekt: z.string().optional().describe("Filter by project"),
  // Smart filters
  where: z.string().optional().describe("Client-side filter: field_operator_value (e.g. gesamtsumme_gte_100)"),
  sort: z.string().optional().describe("Sort: field_asc or field_desc"),
  limit: z.number().optional().describe("Max results"),
  fields: z.string().optional().describe("Comma-separated fields to return"),
  zeitraum: z.string().optional().describe("Time period: heute, diese-woche, dieser-monat, letzter-monat, letzte-N-tage"),
  status_preset: z.string().optional().describe("Business preset: offene-bestellungen, ueberfaellige-lieferungen"),
  format: z.string().optional().describe("Output format: table, csv, ids"),
  aggregate: z.string().optional().describe("Aggregate: count, sum_field, avg_field, min_field, max_field, groupBy_field"),
  includePositionen: z.boolean().optional().describe("Include line items"),
  includeProtokoll: z.boolean().optional().describe("Include protocol/audit log"),
  includeDeleted: z.boolean().optional().describe("Include deleted records"),
});

export const GetPurchaseOrderInput = z.object({
  id: z.string().describe("Purchase order ID"),
});

export const CreatePurchaseOrderInput = z.object({
  adresse: z.string().describe("Supplier address ID"),
  projekt: z.string().optional().describe("Project"),
  lieferdatum: z.string().optional().describe("Delivery date YYYY-MM-DD"),
  einkaeufer: z.string().optional().describe("Buyer name"),
  zahlungsweise: z.string().optional().describe("Payment method"),
  versandart: z.string().optional().describe("Shipping method"),
  freitext: z.string().optional().describe("Free text"),
  internebezeichnung: z.string().optional().describe("Internal note"),
  datum: z.string().optional().describe("Order date YYYY-MM-DD, defaults to today"),
  waehrung: z.string().optional().describe("Currency (e.g. EUR, USD)"),
  positionen: z.array(z.object({
    nummer: z.string().describe("Article number"),
    menge: z.number().describe("Quantity"),
    preis: z.number().optional().describe("Unit price (uses Einkaufspreis if omitted)"),
    bezeichnunglieferant: z.string().optional().describe("Supplier article name"),
    bestellnummer: z.string().optional().describe("Supplier article number"),
    lieferdatum: z.string().optional().describe("Position delivery date YYYY-MM-DD"),
  })).describe("Line items"),
});

export const EditPurchaseOrderInput = z.object({
  id: z.string().describe("Purchase order ID"),
  lieferdatum: z.string().optional(),
  einkaeufer: z.string().optional(),
  zahlungsweise: z.string().optional(),
  versandart: z.string().optional(),
  freitext: z.string().optional(),
  internebezeichnung: z.string().optional(),
  projekt: z.string().optional().describe("Project"),
  datum: z.string().optional().describe("Order date YYYY-MM-DD"),
  waehrung: z.string().optional().describe("Currency (e.g. EUR, USD)"),
});

export const EditOrderInput = z.object({
  id: z.string().describe("Order ID"),
  datum: z.string().optional().describe("Order date YYYY-MM-DD"),
  lieferdatum: z.string().optional().describe("Delivery date YYYY-MM-DD"),
  projekt: z.string().optional().describe("Project"),
  zahlungsweise: z.string().optional().describe("Payment method"),
  versandart: z.string().optional().describe("Shipping method"),
  freitext: z.string().optional().describe("Free text / notes on document"),
  internebezeichnung: z.string().optional().describe("Internal note (not on document)"),
  lieferbedingung: z.string().optional().describe("Delivery terms"),
}).describe("Edit an existing sales order");

export const EditInvoiceInput = z.object({
  id: z.string().describe("Invoice ID"),
  datum: z.string().optional().describe("Invoice date YYYY-MM-DD"),
  projekt: z.string().optional().describe("Project"),
  zahlungsweise: z.string().optional().describe("Payment method"),
  zahlungszieltage: z.string().optional().describe("Payment term days"),
  freitext: z.string().optional().describe("Free text"),
  internebezeichnung: z.string().optional().describe("Internal note"),
}).describe("Edit an existing invoice");

export const EditQuoteInput = z.object({
  id: z.string().describe("Quote ID"),
  datum: z.string().optional().describe("Quote date YYYY-MM-DD"),
  gueltigbis: z.string().optional().describe("Valid until YYYY-MM-DD"),
  projekt: z.string().optional().describe("Project"),
  zahlungsweise: z.string().optional().describe("Payment method"),
  freitext: z.string().optional().describe("Free text"),
  internebezeichnung: z.string().optional().describe("Internal note"),
  lieferbedingung: z.string().optional().describe("Delivery terms"),
}).describe("Edit an existing quote");

export const EditDeliveryNoteInput = z.object({
  id: z.string().describe("Delivery note ID"),
  datum: z.string().optional().describe("Date YYYY-MM-DD"),
  projekt: z.string().optional().describe("Project"),
  versandart: z.string().optional().describe("Shipping method"),
  freitext: z.string().optional().describe("Free text"),
  internebezeichnung: z.string().optional().describe("Internal note"),
}).describe("Edit an existing delivery note");

export const EditCreditMemoInput = z.object({
  id: z.string().describe("Credit memo ID"),
  datum: z.string().optional().describe("Date YYYY-MM-DD"),
  projekt: z.string().optional().describe("Project"),
  zahlungsweise: z.string().optional().describe("Payment method"),
  freitext: z.string().optional().describe("Free text"),
  internebezeichnung: z.string().optional().describe("Internal note"),
}).describe("Edit an existing credit memo");

export const ReleasePurchaseOrderInput = z.object({
  id: z.string().describe("Purchase order ID"),
});

/** Where-clause for filtering documents (passed as query params to REST v1). */
const WhereClause = z.record(z.string()).describe(
  "Key-value filter (z.B. {status: 'freigegeben', kundennummer: '10001'})"
);

export const BatchPDFInput = z.object({
  typ: z
    .enum(["rechnung", "auftrag", "angebot", "lieferschein", "gutschrift"])
    .describe("Belegtyp"),
  ids: z
    .array(z.number().int().positive())
    .optional()
    .describe("Explizite Liste von Beleg-IDs"),
  status_preset: z
    .string()
    .optional()
    .describe("Status-Filter (z.B. 'freigegeben', 'versendet')"),
  zeitraum: z
    .string()
    .optional()
    .describe("Zeitraum als Datum-ab (YYYY-MM-DD). Filtert datum >= Wert"),
  where: WhereClause.optional().describe(
    "Beliebige REST-v1 Filter als Key-Value-Paare"
  ),
});
