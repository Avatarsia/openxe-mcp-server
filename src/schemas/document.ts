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
