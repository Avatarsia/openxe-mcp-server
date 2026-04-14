import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { OpenXEClient } from "../client/openxe-client.js";
import { fetchFilteredList } from "../utils/field-filter.js";
import { fetchPurchaseOrdersWithMeta, PURCHASE_ORDER_SCAN_CAP } from "../utils/purchase-order-fetch.js";
import { BUSINESS_PRESETS, pickFields } from "../utils/smart-filters.js";

// --- Entity to API path mapping ---

const ENTITY_API_PATH: Record<string, string> = {
  "orders": "/v1/belege/auftraege",
  "invoices": "/v1/belege/rechnungen",
  "delivery-notes": "/v1/belege/lieferscheine",
  "quotes": "/v1/belege/angebote",
  "credit-memos": "/v1/belege/gutschriften",
  // NOTE: purchaseOrders use the Legacy API, not REST v1. The path below is a
  // Legacy API action marker — handled specially in the handler below.
  "purchaseOrders": "__legacy__/bestellungen",
};

// --- Types ---

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

// --- Input Schema ---

const presetNames = Object.keys(BUSINESS_PRESETS) as [string, ...string[]];

const BusinessQueryInput = z.object({
  preset: z
    .enum(presetNames)
    .describe(
      `Vordefinierte Abfrage. Verfuegbar: ${Object.entries(BUSINESS_PRESETS)
        .map(([k, v]) => `${k} (${v.description})`)
        .join(", ")}`
    ),
});

// --- Tool Definition ---

export const BUSINESS_QUERY_TOOL_DEFINITION: ToolDefinition = {
  name: "openxe-business-query",
  description:
    "Fuehrt vordefinierte Geschaeftsabfragen aus (z.B. offene Rechnungen, nicht versendete Auftraege, ueberfaellige Rechnungen). " +
    "Presets: " +
    Object.entries(BUSINESS_PRESETS)
      .map(([k, v]) => `${k} = ${v.description}`)
      .join("; "),
  inputSchema: zodToJsonSchema(BusinessQueryInput) as Record<string, unknown>,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
};

// --- Handler ---

export async function handleBusinessQueryTool(
  args: Record<string, unknown>,
  client: OpenXEClient
): Promise<ToolResult> {
  const { preset: presetName } = BusinessQueryInput.parse(args);

  const preset = BUSINESS_PRESETS[presetName];
  if (!preset) {
    const available = Object.keys(BUSINESS_PRESETS).join(", ");
    return {
      content: [
        {
          type: "text",
          text: `Unbekanntes Preset: "${presetName}". Verfuegbar: ${available}`,
        },
      ],
      isError: true,
    };
  }

  const apiPath = ENTITY_API_PATH[preset.entity];
  if (!apiPath) {
    return {
      content: [
        {
          type: "text",
          text: `Interner Fehler: Unbekannte Entity "${preset.entity}" fuer Preset "${presetName}"`,
        },
      ],
      isError: true,
    };
  }

  // Fetch all records for this entity (no server-side filter -- preset applies client-side)
  // Legacy API entities (purchaseOrders) need special handling
  let result: { data: any[]; meta: { total_from_api: number; filtered_out: number; truncated: boolean } };
  let purchaseOrderTruncated = false;
  if (apiPath.startsWith("__legacy__/")) {
    // Purchase orders use Legacy API — shared helper with BelegeList + BestellungGet fallback
    const po = await fetchPurchaseOrdersWithMeta(client);
    purchaseOrderTruncated = po.truncated;
    result = {
      data: po.orders,
      meta: { total_from_api: po.orders.length, filtered_out: 0, truncated: po.truncated },
    };
  } else {
    result = await fetchFilteredList(client, apiPath, {}, {
      fetchAll: true,
      skipSlim: true,
    });
  }

  // Apply the preset's filter
  const filtered = preset.filter(result.data);

  // Pick only the default fields
  const slimmed = filtered.map(r => pickFields(r, preset.defaultFields));

  // Build response
  const response: Record<string, unknown> = {
    _preset: presetName,
    _description: preset.description,
    _info: `${slimmed.length} Ergebnisse (von ${result.meta.total_from_api} gesamt abgerufen, ${result.meta.filtered_out} geloeschte ausgeblendet)`,
    data: slimmed,
  };
  if (purchaseOrderTruncated) {
    response._warning =
      `Purchase order scan hit the cap of ${PURCHASE_ORDER_SCAN_CAP} IDs — ` +
      `result is a lower bound.`;
  } else if (result.meta.truncated) {
    response._warning =
      "Dataset exceeds the safety cap — result is a lower bound. " +
      "Narrow the preset or raise FETCH_ALL_SAFETY_CAP.";
  }

  return {
    content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
  };
}
