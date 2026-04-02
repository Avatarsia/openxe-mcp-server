import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { OpenXEClient } from "../client/openxe-client.js";
import { applySlimMode, truncateWithWarning, SLIM_FIELDS, MAX_LIST_RESULTS, filterDeleted, fetchFilteredList, FilteredListResult } from "../utils/field-filter.js";
import { applyAggregate, AggregateOp, applySort, applyLimit, applyFields, parseZeitraum, formatAsTable, formatAsCsv, formatAsIds, applyWhere, applyStatusPreset } from "../utils/smart-filters.js";

// --- Aggregate schema ---

const AggregateSchema = z
  .union([
    z.literal("count"),
    z.object({ sum: z.string() }),
    z.object({ avg: z.string() }),
    z.object({ min: z.string() }),
    z.object({ max: z.string() }),
    z.object({ groupBy: z.string(), count: z.boolean().optional(), sum: z.string().optional() }),
  ])
  .optional()
  .describe("Aggregation: 'count', {sum:'feld'}, {avg:'feld'}, {min:'feld'}, {max:'feld'}, {groupBy:'feld', sum?:'feld'}. Wird STATT der Datenliste zurueckgegeben.");

// --- Where schema ---

const whereSchema = z.record(z.string(), z.record(z.string(), z.any())).optional().describe(
  'Client-seitige Filter. Beispiele: {plz: {startsWith: "2"}}, {email: {empty: true}}, {name: {contains: "Mueller"}}'
);

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
  zeitraum: z
    .string()
    .optional()
    .describe(
      "Zeitraum-Shortcut: 'heute', 'diese-woche', 'dieser-monat', 'letzter-monat', 'letzte-30-tage', 'oktober-2025', 'Q3-2025', '2025'"
    ),
  status_preset: z
    .string()
    .optional()
    .describe(
      "Status-Shortcut: 'offen', 'unbezahlt', 'ueberfaellig', 'bezahlt', 'entwurf', 'mahnkandidaten'"
    ),
  include_deleted: z
    .boolean()
    .optional()
    .describe("Mit include_deleted=true werden auch geloeschte Datensaetze angezeigt."),
  sort_field: z.string().optional().describe("Sortierfeld (z.B. 'name', 'datum', 'gesamtsumme')"),
  sort_order: z.enum(["asc", "desc"]).optional().default("asc").describe("Sortierreihenfolge"),
  limit: z.number().int().positive().max(200).optional().describe("Maximale Anzahl Ergebnisse"),
  fields: z.array(z.string()).optional().describe("Nur diese Felder zurueckgeben (z.B. ['name','plz','kundennummer'])"),
  aggregate: AggregateSchema,
  format: z.enum(["json", "table", "csv", "ids"]).optional().default("json").describe("Ausgabeformat: json (Standard), table (kompakte Tabelle), csv (Semikolon-getrennt), ids (nur IDs)"),
  where: whereSchema,
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
  statusEntity?: string; // key into STATUS_PRESETS
}

const DOC_TYPES: DocType[] = [
  {
    listName: "openxe-list-quotes",
    getName: "openxe-get-quote",
    path: "angebote",
    labelDe: "Angebote",
    slimKey: "quote",
    hintDe: "Fuer Details nutze openxe-get-quote mit der ID.",
    statusEntity: "quotes",
  },
  {
    listName: "openxe-list-orders",
    getName: "openxe-get-order",
    path: "auftraege",
    labelDe: "Aufträge",
    slimKey: "order",
    hintDe: "Fuer Details nutze openxe-get-order mit der ID.",
    statusEntity: "orders",
  },
  {
    listName: "openxe-list-invoices",
    getName: "openxe-get-invoice",
    path: "rechnungen",
    labelDe: "Rechnungen",
    slimKey: "invoice",
    hintDe: "Fuer Details nutze openxe-get-invoice mit der ID.",
    statusEntity: "invoices",
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
      description: `${dt.labelDe} auflisten (GET /v1/belege/${dt.path}). Gibt eine kompakte Liste zurueck (nur Schluesselfelder: id, belegnr, status, name, datum, summe). Fuer alle Details eines Eintrags nutze ${dt.getName}. Optionale Filter: belegnr, kundennummer, status, datum_gte, datum_lte, zeitraum (z.B. 'dieser-monat', 'Q3-2025'), status_preset (z.B. 'offen', 'unbezahlt', 'ueberfaellig', 'bezahlt', 'entwurf', 'mahnkandidaten'). Mit include_deleted=true werden auch geloeschte Datensaetze angezeigt.`,
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
const LIST_TOOL_STATUS_ENTITY: Record<string, string> = {};
const GET_TOOL_PATH: Record<string, string> = {};

for (const dt of DOC_TYPES) {
  LIST_TOOL_PATH[dt.listName] = dt.path;
  LIST_TOOL_SLIM[dt.listName] = SLIM_FIELDS[dt.slimKey];
  LIST_TOOL_HINT[dt.listName] = dt.hintDe;
  if (dt.statusEntity) LIST_TOOL_STATUS_ENTITY[dt.listName] = dt.statusEntity;
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
    // Resolve zeitraum shortcut into datum_gte / datum_lte
    if (filters.zeitraum) {
      const { von, bis } = parseZeitraum(filters.zeitraum);
      if (!filters.datum_gte) filters.datum_gte = von;
      if (!filters.datum_lte) filters.datum_lte = bis;
    }
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
      skipSlim: !!(filters.where || filters.fields),
    });

    // applyWhere -- on full data (before slim)
    let data: any[] = result.data;
    if (filters.where) {
      data = applyWhere(data, filters.where);
      result.data = data;
    }

    // Apply status preset filter (client-side)
    if (filters.status_preset) {
      const entity = LIST_TOOL_STATUS_ENTITY[toolName];
      if (entity) {
        data = applyStatusPreset(data, entity, filters.status_preset);
        result.data = data;
        result.meta.returned = data.length;
      }
    }

    // Aggregate: return aggregation result instead of data list
    if (filters.aggregate) {
      const aggResult = applyAggregate(data, filters.aggregate as AggregateOp);
      return { content: [{ type: "text", text: JSON.stringify(aggResult, null, 2) }] };
    }

    // Sort + limit
    if (filters.sort_field) {
      data = applySort(data, { field: filters.sort_field, order: filters.sort_order || "asc" });
    }
    if (filters.limit) {
      data = applyLimit(data, filters.limit);
    }

    // Slim or fields projection
    if (filters.fields && filters.fields.length > 0) {
      data = applyFields(data, filters.fields);
    } else if (filters.where || filters.fields) {
      // slim was skipped in fetchFilteredList, apply it now
      data = applySlimMode(data, [...slimFields]) as any[];
    }

    // Apply non-JSON output formats (after field projection)
    if (filters.format === "table") return { content: [{ type: "text", text: formatAsTable(data) }] };
    if (filters.format === "csv") return { content: [{ type: "text", text: formatAsCsv(data) }] };
    if (filters.format === "ids") return { content: [{ type: "text", text: formatAsIds(data) }] };

    // Truncate (only if no explicit limit was set)
    if (!filters.limit) {
      const { data: truncDoc, truncated: truncDocFlag } = truncateWithWarning(data, MAX_LIST_RESULTS);
      result.data = truncDoc;
      result.meta.returned = truncDoc.length;
      result.meta.truncated = truncDocFlag || result.meta.truncated;
    } else {
      result.data = data;
      result.meta.returned = data.length;
    }

    // Build info string
    let info = `${result.meta.returned} Ergebnisse`;
    if (filters.status_preset) {
      info += ` (status_preset: ${filters.status_preset})`;
    }
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
