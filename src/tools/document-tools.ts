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
} from "../schemas/document.js";

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
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
  },
  {
    name: "openxe-create-quote",
    description:
      "Create a quote (Angebot) via Legacy API. Required: adresse, positionen. Optional: datum, gueltigbis.",
    inputSchema: zodToJsonSchema(QuoteCreateInput) as Record<string, unknown>,
  },
  {
    name: "openxe-create-invoice",
    description:
      "Create a standalone invoice (Rechnung) via Legacy API. For order-linked invoices, prefer openxe-convert-order-to-invoice instead. Required: adresse, positionen (with preis on each item).",
    inputSchema: zodToJsonSchema(InvoiceCreateInput) as Record<string, unknown>,
  },
  {
    name: "openxe-create-credit-note",
    description:
      "Create a credit note (Gutschrift). Required: adresse, positionen (with preis). Optional: rechnungid to link to invoice.",
    inputSchema: zodToJsonSchema(CreditNoteCreateInput) as Record<
      string,
      unknown
    >,
  },

  // === Workflow ===
  {
    name: "openxe-convert-quote-to-order",
    description:
      "Convert an existing quote (Angebot) to a sales order (Auftrag). Required: id (quote ID).",
    inputSchema: zodToJsonSchema(DocumentIdInput) as Record<string, unknown>,
  },
  {
    name: "openxe-convert-order-to-invoice",
    description:
      "Convert a sales order to a linked invoice + delivery note via WeiterfuehrenAuftragZuRechnung. This is the standard workflow — creates invoice and delivery note in one step. Required: id (order ID).",
    inputSchema: zodToJsonSchema(DocumentIdInput) as Record<string, unknown>,
  },
  {
    name: "openxe-release-order",
    description:
      "Release/approve a sales order for processing. Required: id.",
    inputSchema: zodToJsonSchema(DocumentIdInput) as Record<string, unknown>,
  },
  {
    name: "openxe-release-invoice",
    description: "Release/finalize an invoice. Required: id.",
    inputSchema: zodToJsonSchema(DocumentIdInput) as Record<string, unknown>,
  },
  {
    name: "openxe-mark-invoice-paid",
    description: "Mark an invoice as paid. Required: id.",
    inputSchema: zodToJsonSchema(DocumentIdInput) as Record<string, unknown>,
  },
  {
    name: "openxe-delete-draft-invoice",
    description:
      "Delete a DRAFT invoice (only works if belegnr is empty or '0'). Cascades to positions and protocol entries. Required: id.",
    inputSchema: zodToJsonSchema(DocumentIdInput) as Record<string, unknown>,
  },

  // === PDF ===
  {
    name: "openxe-get-document-pdf",
    description:
      "Get any document as PDF (base64 encoded). Required: typ (angebot|auftrag|rechnung|lieferschein|gutschrift), id.",
    inputSchema: zodToJsonSchema(BelegPDFInput) as Record<string, unknown>,
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
  "openxe-get-document-pdf": "BelegPDF",
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
  "openxe-convert-quote-to-order": "angebot",
  "openxe-convert-order-to-invoice": "auftrag",
  "openxe-release-order": "auftrag",
  "openxe-release-invoice": "rechnung",
  "openxe-mark-invoice-paid": "rechnung",
  "openxe-get-document-pdf": null, // BelegPDF uses flat {typ, id}
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
  "openxe-get-document-pdf": BelegPDFInput,
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

  // Special handling for PDF — return base64 content
  if (toolName === "openxe-get-document-pdf" && result.data) {
    const pdfData = result.data as { base64: string; filename: string };
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              filename: pdfData.filename,
              base64_length: pdfData.base64?.length ?? 0,
              base64: pdfData.base64,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}
