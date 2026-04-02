import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { OpenXEClient } from "../client/openxe-client.js";
import {
  OrderCreateInput,
  QuoteCreateInput,
  InvoiceCreateInput,
  CreditNoteCreateInput,
  DocumentIdInput,
  BelegPDFInput,
  EditOrderInput,
  EditInvoiceInput,
  EditQuoteInput,
  EditDeliveryNoteInput,
  EditCreditMemoInput,
} from "../schemas/document.js";

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
}

interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export const DOCUMENT_TOOL_DEFINITIONS: ToolDefinition[] = [
  // === Create ===
  {
    name: "openxe-create-order",
    description:
      "Create a sales order (Auftrag) via Legacy API. Required: adresse (customer ID), positionen (line items with nummer + menge). Optional: datum, projekt, zahlungsweise, lieferbedingung, freitext. Workflow: Create order -> openxe-convert-order-to-invoice (WeiterfuehrenAuftragZuRechnung) creates linked invoice + delivery note.",
    inputSchema: zodToJsonSchema(OrderCreateInput) as Record<string, unknown>,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "openxe-create-quote",
    description:
      "Create a quote (Angebot) via Legacy API. Required: adresse, positionen. Optional: datum, gueltigbis.",
    inputSchema: zodToJsonSchema(QuoteCreateInput) as Record<string, unknown>,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "openxe-create-invoice",
    description:
      "Create a standalone invoice (Rechnung) via Legacy API. For order-linked invoices, prefer openxe-convert-order-to-invoice instead. Required: adresse, positionen (with preis on each item).",
    inputSchema: zodToJsonSchema(InvoiceCreateInput) as Record<string, unknown>,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "openxe-create-credit-note",
    description:
      "Create a credit note (Gutschrift). Required: adresse, positionen (with preis). Optional: rechnungid to link to invoice.",
    inputSchema: zodToJsonSchema(CreditNoteCreateInput) as Record<
      string,
      unknown
    >,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },

  // === Workflow ===
  {
    name: "openxe-convert-quote-to-order",
    description:
      "Convert an existing quote (Angebot) to a sales order (Auftrag). Required: id (quote ID).",
    inputSchema: zodToJsonSchema(DocumentIdInput) as Record<string, unknown>,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "openxe-convert-order-to-invoice",
    description:
      "Convert a sales order to a linked invoice + delivery note via WeiterfuehrenAuftragZuRechnung. This is the standard workflow — creates invoice and delivery note in one step. Required: id (order ID).",
    inputSchema: zodToJsonSchema(DocumentIdInput) as Record<string, unknown>,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "openxe-release-order",
    description:
      "Release/approve a sales order for processing. Required: id.",
    inputSchema: zodToJsonSchema(DocumentIdInput) as Record<string, unknown>,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "openxe-release-invoice",
    description: "Release/finalize an invoice. Required: id.",
    inputSchema: zodToJsonSchema(DocumentIdInput) as Record<string, unknown>,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "openxe-mark-invoice-paid",
    description: "Mark an invoice as paid. Required: id.",
    inputSchema: zodToJsonSchema(DocumentIdInput) as Record<string, unknown>,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "openxe-delete-draft-invoice",
    description:
      "Delete a DRAFT invoice (only works if belegnr is empty or '0'). Cascades to positions and protocol entries. Required: id.",
    inputSchema: zodToJsonSchema(DocumentIdInput) as Record<string, unknown>,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },

  // === Edit ===
  {
    name: "openxe-edit-order",
    description:
      "Auftrag bearbeiten via Legacy API (AuftragEdit). Aendert Kopffelder — Positionen koennen nach Erstellung nicht geaendert werden. Required: id. Optional: datum, projekt, zahlungsweise, lieferbedingung, freitext, internebezeichnung, versandart, lieferdatum.",
    inputSchema: zodToJsonSchema(EditOrderInput) as Record<string, unknown>,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "openxe-edit-invoice",
    description:
      "Rechnung bearbeiten via Legacy API (RechnungEdit). Aendert Kopffelder — Positionen koennen nach Erstellung nicht geaendert werden. Required: id. Optional: datum, projekt, zahlungsweise, zahlungszieltage, freitext, internebezeichnung.",
    inputSchema: zodToJsonSchema(EditInvoiceInput) as Record<string, unknown>,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "openxe-edit-quote",
    description:
      "Angebot bearbeiten via Legacy API (AngebotEdit). Aendert Kopffelder — Positionen koennen nach Erstellung nicht geaendert werden. Required: id. Optional: datum, gueltigbis, projekt, zahlungsweise, lieferbedingung, freitext, internebezeichnung.",
    inputSchema: zodToJsonSchema(EditQuoteInput) as Record<string, unknown>,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "openxe-edit-delivery-note",
    description:
      "Lieferschein bearbeiten via Legacy API (LieferscheinEdit). Aendert Kopffelder — Positionen koennen nach Erstellung nicht geaendert werden. Required: id. Optional: datum, projekt, versandart, freitext, internebezeichnung.",
    inputSchema: zodToJsonSchema(EditDeliveryNoteInput) as Record<
      string,
      unknown
    >,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "openxe-edit-credit-memo",
    description:
      "Gutschrift bearbeiten via Legacy API (GutschriftEdit). Aendert Kopffelder — Positionen koennen nach Erstellung nicht geaendert werden. Required: id. Optional: datum, projekt, zahlungsweise, freitext, internebezeichnung.",
    inputSchema: zodToJsonSchema(EditCreditMemoInput) as Record<
      string,
      unknown
    >,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },

  // === PDF ===
  {
    name: "openxe-get-document-pdf",
    description:
      "Get any document as PDF (base64 encoded). Required: typ (angebot|auftrag|rechnung|lieferschein|gutschrift|bestellung), id.",
    inputSchema: zodToJsonSchema(BelegPDFInput) as Record<string, unknown>,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
];

const LEGACY_ACTION_MAP: Record<string, string> = {
  "openxe-create-order": "AuftragCreate",
  "openxe-create-quote": "AngebotCreate",
  "openxe-create-invoice": "RechnungCreate",
  "openxe-create-credit-note": "GutschriftCreate",
  "openxe-convert-quote-to-order": "AngebotZuAuftrag",
  "openxe-convert-order-to-invoice": "WeiterfuehrenAuftragZuRechnung",
  "openxe-release-order": "AuftragFreigabe",
  "openxe-release-invoice": "RechnungFreigabe",
  "openxe-mark-invoice-paid": "RechnungAlsBezahltMarkieren",
  "openxe-edit-order": "AuftragEdit",
  "openxe-edit-invoice": "RechnungEdit",
  "openxe-edit-quote": "AngebotEdit",
  "openxe-edit-delivery-note": "LieferscheinEdit",
  "openxe-edit-credit-memo": "GutschriftEdit",
};

/**
 * JSON wrapper key per Legacy endpoint.
 * OpenXE Legacy API expects some endpoints to receive data wrapped in an
 * entity-named key, e.g. {"auftrag": {...fields...}}.
 * Endpoints with `null` use flat JSON (no wrapper).
 */
const LEGACY_WRAPPER_KEY: Record<string, string | null> = {
  "openxe-create-order": "auftrag",
  "openxe-create-quote": "angebot",
  "openxe-create-invoice": "rechnung",
  "openxe-create-credit-note": "gutschrift",
  "openxe-convert-quote-to-order": null,
  "openxe-convert-order-to-invoice": null,
  "openxe-release-order": null,
  "openxe-release-invoice": null,
  "openxe-mark-invoice-paid": null,
  "openxe-edit-order": "auftrag",
  "openxe-edit-invoice": "rechnung",
  "openxe-edit-quote": "angebot",
  "openxe-edit-delivery-note": "lieferschein",
  "openxe-edit-credit-memo": "gutschrift",
};

const SCHEMA_MAP: Record<string, z.ZodSchema> = {
  "openxe-create-order": OrderCreateInput,
  "openxe-create-quote": QuoteCreateInput,
  "openxe-create-invoice": InvoiceCreateInput,
  "openxe-create-credit-note": CreditNoteCreateInput,
  "openxe-convert-quote-to-order": DocumentIdInput,
  "openxe-convert-order-to-invoice": DocumentIdInput,
  "openxe-release-order": DocumentIdInput,
  "openxe-release-invoice": DocumentIdInput,
  "openxe-mark-invoice-paid": DocumentIdInput,
  "openxe-edit-order": EditOrderInput,
  "openxe-edit-invoice": EditInvoiceInput,
  "openxe-edit-quote": EditQuoteInput,
  "openxe-edit-delivery-note": EditDeliveryNoteInput,
  "openxe-edit-credit-memo": EditCreditMemoInput,
};

export async function handleDocumentTool(
  toolName: string,
  args: Record<string, unknown>,
  client: OpenXEClient
): Promise<ToolResult> {
  // Special case: delete draft invoice uses REST v1 DELETE
  if (toolName === "openxe-delete-draft-invoice") {
    const { id } = DocumentIdInput.parse(args);
    await client.delete(`/v1/belege/rechnungen/${id}`);
    return {
      content: [
        {
          type: "text",
          text: `Draft invoice ${id} deleted successfully (positions and protocol entries cascaded).`,
        },
      ],
    };
  }

  // Special case: BelegPDF uses GET params and returns binary PDF
  if (toolName === "openxe-get-document-pdf") {
    const input = BelegPDFInput.parse(args);
    const result = await client.getRaw("/BelegPDF", {
      beleg: input.typ,
      id: String(input.id),
    });
    const base64 = result.data.toString("base64");
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              filename: `${input.typ}-${input.id}.pdf`,
              content_type: result.contentType,
              size_bytes: result.data.length,
              base64: base64,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  // All other document tools use Legacy API
  const action = LEGACY_ACTION_MAP[toolName];
  const schema = SCHEMA_MAP[toolName];

  if (!action || !schema) {
    return {
      content: [{ type: "text", text: `Unknown document tool: ${toolName}` }],
      isError: true,
    };
  }

  const input = schema.parse(args);

  // Wrap data in entity key if required by this endpoint
  const wrapperKey = LEGACY_WRAPPER_KEY[toolName];
  const payload =
    wrapperKey != null
      ? { [wrapperKey]: input as Record<string, unknown> }
      : (input as Record<string, unknown>);

  const result = await client.legacyPost(action, payload);

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}
