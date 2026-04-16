import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { OpenXEClient } from "../client/openxe-client.js";
import { applySlimMode, truncateWithWarning, SLIM_FIELDS, MAX_LIST_RESULTS, filterDeleted, fetchFilteredList, FilteredListResult, FETCH_ALL_SAFETY_CAP } from "../utils/field-filter.js";
import { applyAggregate, AggregateOp, applySort, applyLimit, applyFields, parseZeitraum, formatAsTable, formatAsCsv, formatAsCsvPositions, formatAsIds, applyWhere, applyStatusPreset, getStatusPresetNames, filterArrayElementsByWhere, WhereClause } from "../utils/smart-filters.js";

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
      "Status preset. Welche Werte erlaubt sind, haengt vom konkreten List-Tool ab " +
      "(quotes: offen/angenommen/abgelehnt; orders: offen/entwurf; invoices: offen/unbezahlt/bezahlt/ueberfaellig/entwurf/mahnkandidaten; " +
      "lieferscheine und gutschriften unterstuetzen status_preset derzeit nicht). " +
      "Unbekannte oder nicht unterstuetzte Werte werden mit Fehler abgewiesen."
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
  format: z.enum(["json", "table", "csv", "csv-positions", "ids"]).optional().default("json").describe("Ausgabeformat: json (Standard), table (kompakte Tabelle), csv (Semikolon-getrennt), csv-positions (eine Zeile pro Belegposition, mit Kundennummer/Belegnr/Datum als Prefix), ids (nur IDs)"),
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
  (dt) => {
    const validPresets = dt.statusEntity ? getStatusPresetNames(dt.statusEntity) : [];
    const presetHint = validPresets.length > 0
      ? `status_preset (${validPresets.join(" | ")})`
      : "status_preset wird fuer dieses Tool nicht unterstuetzt";
    return [
    {
      name: dt.listName,
      description: `${dt.labelDe} auflisten (GET /v1/belege/${dt.path}). Gibt eine kompakte Liste zurueck (nur Schluesselfelder: id, belegnr, status, name, datum, summe). Fuer alle Details eines Eintrags nutze ${dt.getName}. Optionale Filter: belegnr, kundennummer, status, datum_gte, datum_lte, zeitraum (z.B. 'dieser-monat', 'Q3-2025'), ${presetHint}. Mit include_deleted=true werden auch geloeschte Datensaetze angezeigt.`,
      inputSchema: zodToJsonSchema(ListFilters) as Record<string, unknown>,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: dt.getName,
      description: `Einzelnes Dokument aus ${dt.labelDe} abrufen (GET /v1/belege/${dt.path}/{id}). Gibt ALLE Felder eines einzelnen Datensatzes zurueck. Optional: include (z.B. 'positionen,protokoll').`,
      inputSchema: zodToJsonSchema(GetByIdInput) as Record<string, unknown>,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
  ];
  }
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

/** True when any where-key targets a nested positions field. */
function hasPositionsFilter(where: WhereClause | undefined): boolean {
  if (!where) return false;
  return Object.keys(where).some(k => k.startsWith("positionen."));
}

/**
 * Enrich each position with a computed `gesamtpreis` field (menge * preis).
 * Lieferschein positions have no `preis` and end up with an empty string.
 * Mutates the records in place — only used right before CSV export.
 */
function enrichPositionsWithGesamtpreis(records: any[]): void {
  for (const rec of records) {
    if (!Array.isArray(rec?.positionen)) continue;
    for (const pos of rec.positionen) {
      if (pos == null) continue;
      if (pos.preis === undefined || pos.preis === null || pos.preis === "") {
        pos.gesamtpreis = "";
        continue;
      }
      const menge = parseFloat(pos.menge);
      const preis = parseFloat(pos.preis);
      if (isNaN(menge) || isNaN(preis)) {
        pos.gesamtpreis = "";
      } else {
        pos.gesamtpreis = (Math.round(menge * preis * 100) / 100).toFixed(2);
      }
    }
  }
}

const CSV_POSITIONS_HEADER_FIELDS = ["kundennummer", "belegnr", "datum"];
const CSV_POSITIONS_POSITION_FIELDS = [
  "nummer",
  "bezeichnung",
  "beschreibung",
  "menge",
  "einheit",
  "preis",
  "gesamtpreis",
];

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
    // Strict status_preset validation -- reject unknown or unsupported values
    // BEFORE any API call so invalid input never silently reaches the server
    // or the client-side applyStatusPreset no-op path.
    if (filters.status_preset) {
      const entity = LIST_TOOL_STATUS_ENTITY[toolName];
      if (!entity) {
        return {
          content: [{
            type: "text",
            text: `Tool "${toolName}" unterstuetzt kein status_preset. Nutze stattdessen den direkten "status"-Filter oder ein anderes List-Tool.`,
          }],
          isError: true,
        };
      }
      const valid = getStatusPresetNames(entity);
      if (!valid.includes(filters.status_preset)) {
        return {
          content: [{
            type: "text",
            text: `Unbekanntes status_preset: "${filters.status_preset}". Erlaubt fuer ${toolName}: ${valid.join(" | ")}.`,
          }],
          isError: true,
        };
      }
    }
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

    // Positions are pulled in whenever a where-clause references them OR
    // the caller asked for the csv-positions output format.
    const needsPositions =
      filters.format === "csv-positions" || hasPositionsFilter(filters.where);
    if (needsPositions) params.include = "positionen";

    const slimFields = LIST_TOOL_SLIM[toolName];
    const effectiveMaxDoc = typeof filters.limit === "number" && filters.limit > MAX_LIST_RESULTS ? filters.limit : MAX_LIST_RESULTS;
    // aggregate/sort_field MUST run on the full dataset, not just the first
    // page — otherwise count/sum/top-N are silently wrong when more than
    // MAX_LIST_RESULTS records exist. skipSlim must also be on, so the field
    // referenced by aggregate/sort is still present when those ops run.
    const needsFullScanDoc = !!(filters.where || needsPositions || filters.aggregate || filters.sort_field);
    const result = await fetchFilteredList(client, `/v1/belege/${listPath}`, params, {
      slimFields: [...slimFields],
      includeDeleted: filters.include_deleted,
      skipSlim: !!(filters.where || filters.fields || needsPositions || filters.aggregate || filters.sort_field),
      fetchAll: needsFullScanDoc,
      maxResults: effectiveMaxDoc,
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

    // csv-positions runs BEFORE slim/fields projection so that the
    // `positionen` array is still present on each record.
    if (filters.format === "csv-positions") {
      // Reduce each beleg's `positionen` array to those entries that satisfy
      // the positionen.*-where-clauses themselves. Without this the export
      // would include every position of a matching beleg, not the targeted
      // ones (e.g. when filtering by positionen.nummer).
      let csvData = data;
      if (filters.where && hasPositionsFilter(filters.where)) {
        csvData = data.map(beleg => {
          if (!Array.isArray(beleg?.positionen)) return beleg;
          return {
            ...beleg,
            positionen: filterArrayElementsByWhere(beleg.positionen, filters.where!, "positionen"),
          };
        });
      }
      enrichPositionsWithGesamtpreis(csvData);
      const csv = formatAsCsvPositions(
        csvData,
        "positionen",
        CSV_POSITIONS_HEADER_FIELDS,
        CSV_POSITIONS_POSITION_FIELDS,
      );
      // content[0] stays a clean RFC-4180 CSV stream that downstream parsers
      // (Excel, pandas, COPY ... FROM STDIN) can ingest unchanged. If the
      // underlying fetch was truncated, the warning rides as a separate
      // TextContent item so the LLM still sees it without polluting the CSV.
      const content: { type: "text"; text: string }[] = [{ type: "text", text: csv }];
      if (result.meta.truncated) {
        content.push({
          type: "text",
          text: `WARNUNG: Safety-Cap von ${FETCH_ALL_SAFETY_CAP} Belegen erreicht — Ergebnis ist eine Untergrenze.`,
        });
      }
      return { content };
    }

    // Slim or fields projection
    if (filters.fields && filters.fields.length > 0) {
      data = applyFields(data, filters.fields);
    } else if (filters.where || filters.fields || needsPositions || filters.sort_field) {
      // slim was skipped in fetchFilteredList, apply it now.
      // sort_field triggers skipSlim upstream (Task P), so re-project here;
      // otherwise raw fetched records (incl. non-slim fields) leak out.
      data = applySlimMode(data, [...slimFields]) as any[];
    }

    // Truncate (only if no explicit limit was set). Must happen BEFORE any
    // non-JSON format branch so table/csv/ids also honor MAX_LIST_RESULTS
    // and can emit a truncation warning consistently.
    if (!filters.limit) {
      const { data: truncDoc, truncated: truncDocFlag } = truncateWithWarning(data, MAX_LIST_RESULTS);
      data = truncDoc as any[];
      result.data = truncDoc;
      result.meta.returned = truncDoc.length;
      result.meta.truncated = truncDocFlag || result.meta.truncated;
    } else {
      result.data = data;
      result.meta.returned = data.length;
    }

    // Apply non-JSON output formats (after field projection + truncation).
    // If the underlying fetch was truncated by MAX_LIST_RESULTS, emit a second
    // TextContent item so downstream parsers still see a clean raw stream in
    // content[0] while the LLM learns that the list is incomplete.
    const appendTruncWarning = (text: string, cap: number = MAX_LIST_RESULTS) => {
      const content: Array<{ type: "text"; text: string }> = [{ type: "text", text }];
      if (result.meta.truncated) {
        content.push({
          type: "text",
          text: `WARNUNG: Ergebnis wurde nach ${cap} Eintraegen abgeschnitten. Verwende Filter (where, status_preset, zeitraum) oder \`limit\` um genauer einzugrenzen.`,
        });
      }
      return { content };
    };
    if (filters.format === "table") return appendTruncWarning(formatAsTable(data), effectiveMaxDoc);
    if (filters.format === "csv") return appendTruncWarning(formatAsCsv(data), effectiveMaxDoc);
    if (filters.format === "ids") return appendTruncWarning(formatAsIds(data), effectiveMaxDoc);

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
