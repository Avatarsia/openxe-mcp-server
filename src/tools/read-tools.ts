import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { OpenXEClient } from "../client/openxe-client.js";
import { applySlimMode, truncateWithWarning, SLIM_FIELDS, MAX_LIST_RESULTS, filterDeleted, fetchFilteredList, FilteredListResult } from "../utils/field-filter.js";
import { applyAggregate, AggregateOp, formatAsTable, formatAsCsv, formatAsIds } from "../utils/smart-filters.js";

// --- Aggregate schema (shared by all list tools) ---

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

// --- Input Schemas ---

const ListAddressesInput = z.object({
  kundennummer: z
    .string()
    .optional()
    .describe("Filter by customer number (Kundennummer). Only server-side filter that works reliably."),
  name: z
    .string()
    .optional()
    .describe("Filter by name (client-side filtering -- server ignores this filter)."),
  email: z
    .string()
    .optional()
    .describe("Filter by email (client-side filtering -- server ignores this filter)."),
  land: z
    .string()
    .optional()
    .describe("Filter by country ISO code, e.g. DE (client-side filtering -- server ignores this filter)."),
  include_deleted: z
    .boolean()
    .optional()
    .describe("Mit include_deleted=true werden auch geloeschte Datensaetze angezeigt."),
  page: z.number().int().positive().optional().describe("Page number (default 1)"),
  items: z.number().int().positive().optional().describe("Items per page (default 20)"),
  aggregate: AggregateSchema,
  format: z.enum(["json", "table", "csv", "ids"]).optional().default("json").describe("Ausgabeformat: json (Standard), table (kompakte Tabelle), csv (Semikolon-getrennt), ids (nur IDs)"),
});

const GetAddressInput = z.object({
  id: z.number().int().positive().describe("Address ID"),
});

const ListArticlesInput = z.object({
  name_de: z.string().optional().describe("Filter by German article name"),
  nummer: z.string().optional().describe("Filter by article number"),
  typ: z.string().optional().describe("Filter by type (produkt, dienstleistung, etc.)"),
  projekt: z.string().optional().describe("Filter by project"),
  include: z
    .string()
    .optional()
    .describe(
      "Comma-separated includes: verkaufspreise, lagerbestand, dateien, projekt. Use verkaufspreise to get prices."
    ),
  include_deleted: z
    .boolean()
    .optional()
    .describe("Mit include_deleted=true werden auch geloeschte Datensaetze angezeigt."),
  page: z.number().int().positive().optional().describe("Page number (default 1)"),
  items: z.number().int().positive().optional().describe("Items per page (default 20)"),
  aggregate: AggregateSchema,
  format: z.enum(["json", "table", "csv", "ids"]).optional().default("json").describe("Ausgabeformat: json (Standard), table (kompakte Tabelle), csv (Semikolon-getrennt), ids (nur IDs)"),
});

const GetArticleInput = z.object({
  id: z.number().int().positive().describe("Article ID"),
  include: z
    .string()
    .optional()
    .describe(
      "Comma-separated includes: verkaufspreise, lagerbestand, dateien, projekt"
    ),
});

const ListCategoriesInput = z.object({
  bezeichnung: z.string().optional().describe("Filter by category name"),
  parent: z.number().int().optional().describe("Filter by parent category ID"),
  projekt: z.string().optional().describe("Filter by project"),
  include_deleted: z
    .boolean()
    .optional()
    .describe("Mit include_deleted=true werden auch geloeschte Datensaetze angezeigt."),
  page: z.number().int().positive().optional().describe("Page number (default 1)"),
  items: z.number().int().positive().optional().describe("Items per page (default 20)"),
  aggregate: AggregateSchema,
  format: z.enum(["json", "table", "csv", "ids"]).optional().default("json").describe("Ausgabeformat: json (Standard), table (kompakte Tabelle), csv (Semikolon-getrennt), ids (nur IDs)"),
});

const ListShippingMethodsInput = z.object({
  include_deleted: z
    .boolean()
    .optional()
    .describe("Mit include_deleted=true werden auch geloeschte Datensaetze angezeigt."),
  page: z.number().int().positive().optional().describe("Page number (default 1)"),
  items: z.number().int().positive().optional().describe("Items per page (default 20)"),
  aggregate: AggregateSchema,
  format: z.enum(["json", "table", "csv", "ids"]).optional().default("json").describe("Ausgabeformat: json (Standard), table (kompakte Tabelle), csv (Semikolon-getrennt), ids (nur IDs)"),
});

const ListFilesInput = z.object({
  objekt: z.string().optional().describe("Filter by object type (e.g. Artikel, Adresse)"),
  parameter: z.string().optional().describe("Filter by object ID (parameter value)"),
  stichwort: z.string().optional().describe("Filter by keyword/tag"),
  include_deleted: z
    .boolean()
    .optional()
    .describe("Mit include_deleted=true werden auch geloeschte Datensaetze angezeigt."),
  page: z.number().int().positive().optional().describe("Page number (default 1)"),
  items: z.number().int().positive().optional().describe("Items per page (default 20)"),
  aggregate: AggregateSchema,
  format: z.enum(["json", "table", "csv", "ids"]).optional().default("json").describe("Ausgabeformat: json (Standard), table (kompakte Tabelle), csv (Semikolon-getrennt), ids (nur IDs)"),
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

// --- Tool Definitions ---

export const READ_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "openxe-list-addresses",
    description:
      "Liste aller Adressen/Kunden (GET /v1/adressen). Gibt eine kompakte Liste zurueck (nur Schluesselfelder). Fuer alle Details eines Eintrags nutze openxe-get-address. Optionale Filter: kundennummer, name, email, land. HINWEIS: Nur kundennummer wird serverseitig gefiltert; name/email/land werden clientseitig gefiltert. Mit include_deleted=true werden auch geloeschte Datensaetze angezeigt.",
    inputSchema: zodToJsonSchema(ListAddressesInput) as Record<string, unknown>,
  },
  {
    name: "openxe-get-address",
    description:
      "Einzelne Adresse abrufen (GET /v1/adressen/{id}). Gibt ALLE Felder eines einzelnen Datensatzes zurueck.",
    inputSchema: zodToJsonSchema(GetAddressInput) as Record<string, unknown>,
  },
  {
    name: "openxe-list-articles",
    description:
      "Liste aller Artikel (GET /v1/artikel). Gibt eine kompakte Liste zurueck (nur Schluesselfelder). Fuer alle Details eines Artikels nutze openxe-get-article. Optionale Filter: name_de, nummer, typ, projekt. Include: verkaufspreise, lagerbestand, dateien, projekt. HINWEIS: Preise nur mit include=verkaufspreise sichtbar. Mit include_deleted=true werden auch geloeschte Datensaetze angezeigt.",
    inputSchema: zodToJsonSchema(ListArticlesInput) as Record<string, unknown>,
  },
  {
    name: "openxe-get-article",
    description:
      "Einzelnen Artikel abrufen (GET /v1/artikel/{id}). Gibt ALLE Felder eines einzelnen Datensatzes zurueck. Include: verkaufspreise, lagerbestand, dateien, projekt.",
    inputSchema: zodToJsonSchema(GetArticleInput) as Record<string, unknown>,
  },
  {
    name: "openxe-list-categories",
    description:
      "Liste aller Artikelkategorien (GET /v1/artikelkategorien). Gibt eine kompakte Liste zurueck (nur Schluesselfelder). Optionale Filter: bezeichnung, parent, projekt. Mit include_deleted=true werden auch geloeschte Datensaetze angezeigt.",
    inputSchema: zodToJsonSchema(ListCategoriesInput) as Record<string, unknown>,
  },
  {
    name: "openxe-list-shipping-methods",
    description:
      "Liste aller Versandarten (GET /v1/versandarten). Gibt eine kompakte Liste zurueck (nur Schluesselfelder). Mit include_deleted=true werden auch geloeschte Datensaetze angezeigt.",
    inputSchema: zodToJsonSchema(ListShippingMethodsInput) as Record<string, unknown>,
  },
  {
    name: "openxe-list-files",
    description:
      "Liste aller Dateien/Anhaenge (GET /v1/dateien). Gibt eine kompakte Liste zurueck (nur Schluesselfelder). Optionale Filter: objekt, parameter, stichwort. Mit include_deleted=true werden auch geloeschte Datensaetze angezeigt.",
    inputSchema: zodToJsonSchema(ListFilesInput) as Record<string, unknown>,
  },
];

// --- Helper: build list response with metadata wrapper ---

function buildListResponse(result: FilteredListResult, hint: string, format?: string, fields?: string[]): ToolResult {
  const data = result.data as any[];

  // Apply non-JSON formats BEFORE wrapping in metadata
  if (format === "table") return { content: [{ type: "text", text: formatAsTable(data, fields) }] };
  if (format === "csv") return { content: [{ type: "text", text: formatAsCsv(data, fields) }] };
  if (format === "ids") return { content: [{ type: "text", text: formatAsIds(data) }] };

  // Default: json with metadata wrapper
  const response: Record<string, unknown> = {};

  // Build info string
  let info = `${result.meta.returned} Ergebnisse`;
  if (result.meta.filtered_out > 0) {
    info += ` (${result.meta.filtered_out} geloeschte ausgeblendet). Fuer alle: include_deleted=true`;
  }
  if (result.meta.truncated) {
    info += ` — Liste gekuerzt, es gibt weitere Eintraege. Nutze Filter zum Eingrenzen.`;
  }

  response._info = info;
  response._hint = hint;
  response.data = result.data;

  return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
}

// --- Handler ---

export async function handleReadTool(
  name: string,
  input: Record<string, unknown>,
  client: OpenXEClient
): Promise<ToolResult> {
  switch (name) {
    case "openxe-list-addresses": {
      const args = ListAddressesInput.parse(input);
      const { name: nameFilter, email, land, include_deleted, aggregate, format, ...serverParams } = args;

      // Only kundennummer goes to the server
      const apiParams: Record<string, string | number | undefined> = {};
      if (serverParams.kundennummer) apiParams.kundennummer = serverParams.kundennummer;

      const result = await fetchFilteredList(client, "/v1/adressen", apiParams, {
        includeDeleted: include_deleted,
      });

      // Client-side filters (name, email, land)
      let filtered = result.data;
      if (nameFilter) {
        const lowerFilter = nameFilter.toLowerCase();
        filtered = filtered.filter((a: any) => {
          const n = String(a.name ?? "").toLowerCase();
          const fn = String(a.firma ?? "").toLowerCase();
          return n.includes(lowerFilter) || fn.includes(lowerFilter);
        });
      }
      if (email) {
        const lowerEmail = email.toLowerCase();
        filtered = filtered.filter((a: any) =>
          String(a.email ?? "").toLowerCase().includes(lowerEmail)
        );
      }
      if (land) {
        const upperLand = land.toUpperCase();
        filtered = filtered.filter((a: any) => String(a.land ?? "").toUpperCase() === upperLand);
      }

      // Aggregate: return aggregation result instead of data list
      if (aggregate) {
        const aggResult = applyAggregate(filtered, aggregate as AggregateOp);
        return { content: [{ type: "text", text: JSON.stringify(aggResult, null, 2) }] };
      }

      const slimmed = applySlimMode(filtered, [...SLIM_FIELDS.address]) as Record<string, unknown>[];
      const { data: truncated, truncated: wasTruncated } = truncateWithWarning(slimmed, MAX_LIST_RESULTS);

      // Update meta to reflect client-side filtering and truncation
      result.data = truncated;
      result.meta.returned = truncated.length;
      result.meta.truncated = wasTruncated || result.meta.truncated;

      return buildListResponse(result, "Fuer alle Details eines Eintrags nutze openxe-get-address mit der ID.", format);
    }

    case "openxe-get-address": {
      const { id } = GetAddressInput.parse(input);
      const result = await client.get(`/v1/adressen/${id}`);
      return {
        content: [
          { type: "text", text: JSON.stringify(result.data, null, 2) },
        ],
      };
    }

    case "openxe-list-articles": {
      const args = ListArticlesInput.parse(input);
      const { include_deleted: includeDeletedArt, page: _p, items: _i, aggregate: aggArt, format: fmtArt, ...filterArgs } = args;
      const apiParams: Record<string, string | number | undefined> = {};
      if (filterArgs.name_de) apiParams.name_de = filterArgs.name_de;
      if (filterArgs.nummer) apiParams.nummer = filterArgs.nummer;
      if (filterArgs.typ) apiParams.typ = filterArgs.typ;
      if (filterArgs.projekt) apiParams.projekt = filterArgs.projekt;
      if (filterArgs.include) apiParams.include = filterArgs.include;

      const result = await fetchFilteredList(client, "/v1/artikel", apiParams, {
        slimFields: SLIM_FIELDS.article,
        includeDeleted: includeDeletedArt,
      });

      if (aggArt) {
        const aggResult = applyAggregate(result.data, aggArt as AggregateOp);
        return { content: [{ type: "text", text: JSON.stringify(aggResult, null, 2) }] };
      }

      return buildListResponse(result, "Fuer alle Details eines Artikels nutze openxe-get-article mit der ID.", fmtArt);
    }

    case "openxe-get-article": {
      const { id, include } = GetArticleInput.parse(input);
      const apiParams: Record<string, string | number | undefined> = {};
      if (include) apiParams.include = include;

      const result = await client.get(`/v1/artikel/${id}`, apiParams);
      return {
        content: [
          { type: "text", text: JSON.stringify(result.data, null, 2) },
        ],
      };
    }

    case "openxe-list-categories": {
      const args = ListCategoriesInput.parse(input);
      const { include_deleted: includeDeletedCat, page: _p, items: _i, aggregate: aggCat, format: fmtCat, ...filterArgs } = args;
      const apiParams: Record<string, string | number | undefined> = {};
      if (filterArgs.bezeichnung) apiParams.bezeichnung = filterArgs.bezeichnung;
      if (filterArgs.parent !== undefined) apiParams.parent = filterArgs.parent;
      if (filterArgs.projekt) apiParams.projekt = filterArgs.projekt;

      const result = await fetchFilteredList(client, "/v1/artikelkategorien", apiParams, {
        slimFields: SLIM_FIELDS.category,
        includeDeleted: includeDeletedCat,
      });

      if (aggCat) {
        const aggResult = applyAggregate(result.data, aggCat as AggregateOp);
        return { content: [{ type: "text", text: JSON.stringify(aggResult, null, 2) }] };
      }

      return buildListResponse(result, "Fuer Details einer Kategorie nutze die jeweilige Kategorie-ID.", fmtCat);
    }

    case "openxe-list-shipping-methods": {
      const args = ListShippingMethodsInput.parse(input);
      const { include_deleted: includeDeletedShip, page: _p, items: _i, aggregate: aggShip, format: fmtShip } = args;

      const result = await fetchFilteredList(client, "/v1/versandarten", {}, {
        slimFields: SLIM_FIELDS.shippingMethod,
        includeDeleted: includeDeletedShip,
      });

      if (aggShip) {
        const aggResult = applyAggregate(result.data, aggShip as AggregateOp);
        return { content: [{ type: "text", text: JSON.stringify(aggResult, null, 2) }] };
      }

      return buildListResponse(result, "Versandarten-Liste. Nutze die ID fuer Zuordnungen.", fmtShip);
    }

    case "openxe-list-files": {
      const args = ListFilesInput.parse(input);
      const { include_deleted: includeDeletedFile, page: _p, items: _i, aggregate: aggFile, format: fmtFile, ...filterArgs } = args;
      const apiParams: Record<string, string | number | undefined> = {};
      if (filterArgs.objekt) apiParams.objekt = filterArgs.objekt;
      if (filterArgs.parameter) apiParams.parameter = filterArgs.parameter;
      if (filterArgs.stichwort) apiParams.stichwort = filterArgs.stichwort;

      const result = await fetchFilteredList(client, "/v1/dateien", apiParams, {
        slimFields: SLIM_FIELDS.file,
        includeDeleted: includeDeletedFile,
      });

      if (aggFile) {
        const aggResult = applyAggregate(result.data, aggFile as AggregateOp);
        return { content: [{ type: "text", text: JSON.stringify(aggResult, null, 2) }] };
      }

      return buildListResponse(result, "Datei-Liste. Nutze die ID fuer weitere Operationen.", fmtFile);
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown read tool: ${name}` }],
        isError: true,
      };
  }
}
