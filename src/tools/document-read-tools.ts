import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { OpenXEClient } from "../client/openxe-client.js";
import { applySlimMode, truncateWithWarning, SLIM_FIELDS, MAX_LIST_RESULTS, filterDeleted, fetchFilteredList, FilteredListResult } from "../utils/field-filter.js";

// --- Shared schemas ---

const ListFilters = z.object({
  belegnr: z.string().optional().describe("Belegnummer (z.B. 'AU-2026-0001')"),
  kundennummer: z.string().optional().describe("Kundennummer"),
  status: z.string().optional().describe("Status des Belegs"),
  datum_gte: z
    .string()
    .optional()
    .describe("Datum ab (YYYY-MM-DD), filtert datum >= Wert"),
  datum_lte: z
    .string()
    .optional()
    .describe("Datum bis (YYYY-MM-DD), filtert datum <= Wert"),
  include_deleted: z
    .boolean()
    .optional()
    .describe("Mit include_deleted=true werden auch geloeschte Datensaetze angezeigt."),
});

const GetByIdInput = z.object({
  id: z.number().int().positive().describe("Beleg-ID"),
  include: z
    .string()
    .optional()
    .describe(
      "Komma-getrennte Include-Felder, z.B. 'positionen,protokoll'"
    ),
});

// --- Types ---

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

// --- Document type config ---

interface DocType {
  listName: string;
  getName: string;
  path: string;
  labelDe: string;
  slimKey: keyof typeof SLIM_FIELDS;
  hintDe: string;
}

const DOC_TYPES: DocType[] = [
  {
    listName: "openxe-list-quotes",
    getName: "openxe-get-quote",
    path: "angebote",
    labelDe: "Angebote",
    slimKey: "quote",
    hintDe: "Fuer Details nutze openxe-get-quote mit der ID.",
  },
  {
    listName: "openxe-list-orders",
    getName: "openxe-get-order",
    path: "auftraege",
    labelDe: "Aufträge",
    slimKey: "order",
    hintDe: "Fuer Details nutze openxe-get-order mit der ID.",
  },
  {
    listName: "openxe-list-invoices",
    getName: "openxe-get-invoice",
    path: "rechnungen",
    labelDe: "Rechnungen",
    slimKey: "invoice",
    hintDe: "Fuer Details nutze openxe-get-invoice mit der ID.",
  },
  {
    listName: "openxe-list-delivery-notes",
    getName: "openxe-get-delivery-note",
    path: "lieferscheine",
    labelDe: "Lieferscheine",
    slimKey: "deliveryNote",
    hintDe: "Fuer Details nutze openxe-get-delivery-note mit der ID.",
  },
  {
    listName: "openxe-list-credit-memos",
    getName: "openxe-get-credit-memo",
    path: "gutschriften",
    labelDe: "Gutschriften",
    slimKey: "creditMemo",
    hintDe: "Fuer Details nutze openxe-get-credit-memo mit der ID.",
  },
];

// --- Build tool definitions ---

export const DOCUMENT_READ_TOOL_DEFINITIONS: ToolDefinition[] = DOC_TYPES.flatMap(
  (dt) => [
    {
      name: dt.listName,
      description: `${dt.labelDe} auflisten (GET /v1/belege/${dt.path}). Gibt eine kompakte Liste zurueck (nur Schluesselfelder: id, belegnr, status, name, datum, summe). Fuer alle Details eines Eintrags nutze ${dt.getName}. Optionale Filter: belegnr, kundennummer, status, datum_gte, datum_lte. Mit include_deleted=true werden auch geloeschte Datensaetze angezeigt.`,
      inputSchema: zodToJsonSchema(ListFilters) as Record<string, unknown>,
    },
    {
      name: dt.getName,
      description: `Einzelnes Dokument aus ${dt.labelDe} abrufen (GET /v1/belege/${dt.path}/{id}). Gibt ALLE Felder eines einzelnen Datensatzes zurueck. Optional: include (z.B. 'positionen,protokoll').`,
      inputSchema: zodToJsonSchema(GetByIdInput) as Record<string, unknown>,
    },
  ]
);

// --- Lookup maps ---

const LIST_TOOL_PATH: Record<string, string> = {};
const LIST_TOOL_SLIM: Record<string, readonly string[]> = {};
const LIST_TOOL_HINT: Record<string, string> = {};
const GET_TOOL_PATH: Record<string, string> = {};

for (const dt of DOC_TYPES) {
  LIST_TOOL_PATH[dt.listName] = dt.path;
  LIST_TOOL_SLIM[dt.listName] = SLIM_FIELDS[dt.slimKey];
  LIST_TOOL_HINT[dt.listName] = dt.hintDe;
  GET_TOOL_PATH[dt.getName] = dt.path;
}

// --- Helper: unwrap nested API data ---

function unwrapList(rawData: unknown): any[] {
  if (Array.isArray(rawData)) {
    return rawData;
  }
  if (rawData && typeof rawData === 'object') {
    const obj = rawData as Record<string, unknown>;
    if (obj.data && Array.isArray(obj.data)) {
      return obj.data;
    }
    return [rawData];
  }
  return [];
}

// --- Handler ---

export async function handleDocumentReadTool(
  toolName: string,
  args: Record<string, unknown>,
  client: OpenXEClient
): Promise<ToolResult> {
  // List tools
  const listPath = LIST_TOOL_PATH[toolName];
  if (listPath) {
    const filters = ListFilters.parse(args);
    const params: Record<string, string> = {};
    if (filters.belegnr) params.belegnr = filters.belegnr;
    if (filters.kundennummer) params.kundennummer = filters.kundennummer;
    if (filters.status) params.status = filters.status;
    if (filters.datum_gte) params.datum_gte = filters.datum_gte;
    if (filters.datum_lte) params.datum_lte = filters.datum_lte;

    const slimFields = LIST_TOOL_SLIM[toolName];
    const result = await fetchFilteredList(client, `/v1/belege/${listPath}`, params, {
      slimFields: [...slimFields],
      includeDeleted: filters.include_deleted,
    });

    // Build info string
    let info = `${result.meta.returned} Ergebnisse`;
    if (result.meta.filtered_out > 0) {
      info += ` (${result.meta.filtered_out} geloeschte ausgeblendet). Fuer alle: include_deleted=true`;
    }
    if (result.meta.truncated) {
      info += ` — Liste gekuerzt, es gibt weitere Eintraege. Nutze Filter zum Eingrenzen.`;
    }

    const response: Record<string, unknown> = {
      _info: info,
      _hint: LIST_TOOL_HINT[toolName],
      data: result.data,
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  }

  // Get-by-ID tools
  const getPath = GET_TOOL_PATH[toolName];
  if (getPath) {
    const { id, include } = GetByIdInput.parse(args);
    const params: Record<string, string> = {};
    if (include) params.include = include;

    const result = await client.get(`/v1/belege/${getPath}/${id}`, params);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result.data, null, 2),
        },
      ],
    };
  }

  return {
    content: [{ type: "text", text: `Unknown document-read tool: ${toolName}` }],
    isError: true,
  };
}
