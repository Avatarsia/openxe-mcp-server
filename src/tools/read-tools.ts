import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { OpenXEClient } from "../client/openxe-client.js";
import { applySlimMode, truncateWithWarning, SLIM_FIELDS, MAX_LIST_RESULTS, filterDeleted, fetchFilteredList, FilteredListResult } from "../utils/field-filter.js";
import { applyAggregate, AggregateOp, applySort, applyLimit, applyFields, formatAsTable, formatAsCsv, formatAsIds, applyWhere } from "../utils/smart-filters.js";

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

// --- Where schema (shared by all list tools) ---

const whereSchema = z.record(z.string(), z.record(z.string(), z.any())).optional().describe(
  'Client-seitige Filter. Beispiele: {plz: {startsWith: "2"}}, {email: {empty: true}}, {name: {contains: "Mueller"}}'
);

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
  sort_field: z.string().optional().describe("Sortierfeld (z.B. 'name', 'datum', 'gesamtsumme')"),
  sort_order: z.enum(["asc", "desc"]).optional().default("asc").describe("Sortierreihenfolge"),
  limit: z.number().int().positive().max(200).optional().describe("Maximale Anzahl Ergebnisse"),
  fields: z.array(z.string()).optional().describe("Nur diese Felder zurueckgeben (z.B. ['name','plz','kundennummer'])"),
  aggregate: AggregateSchema,
  format: z.enum(["json", "table", "csv", "ids"]).optional().default("json").describe("Ausgabeformat: json (Standard), table (kompakte Tabelle), csv (Semikolon-getrennt), ids (nur IDs)"),
  where: whereSchema,
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
  sort_field: z.string().optional().describe("Sortierfeld (z.B. 'name', 'datum', 'gesamtsumme')"),
  sort_order: z.enum(["asc", "desc"]).optional().default("asc").describe("Sortierreihenfolge"),
  limit: z.number().int().positive().max(200).optional().describe("Maximale Anzahl Ergebnisse"),
  fields: z.array(z.string()).optional().describe("Nur diese Felder zurueckgeben (z.B. ['name','plz','kundennummer'])"),
  aggregate: AggregateSchema,
  format: z.enum(["json", "table", "csv", "ids"]).optional().default("json").describe("Ausgabeformat: json (Standard), table (kompakte Tabelle), csv (Semikolon-getrennt), ids (nur IDs)"),
  where: whereSchema,
});

const GetArticleInput = z.object({
  id: z.number().int().positive().describe("Article ID"),
  include: z
    .string()
    .optional()
    .describe(
      "Comma-separated includes: verkaufspreise, lagerbestand, dateien, projekt"
    ),
  includeEinkaufspreise: z
    .boolean()
    .optional()
    .describe(
      "Include purchase prices (Einkaufspreise) — fetched via Legacy API since REST v1 doesn't support this include"
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
  sort_field: z.string().optional().describe("Sortierfeld (z.B. 'name', 'datum', 'gesamtsumme')"),
  sort_order: z.enum(["asc", "desc"]).optional().default("asc").describe("Sortierreihenfolge"),
  limit: z.number().int().positive().max(200).optional().describe("Maximale Anzahl Ergebnisse"),
  fields: z.array(z.string()).optional().describe("Nur diese Felder zurueckgeben (z.B. ['name','plz','kundennummer'])"),
  aggregate: AggregateSchema,
  format: z.enum(["json", "table", "csv", "ids"]).optional().default("json").describe("Ausgabeformat: json (Standard), table (kompakte Tabelle), csv (Semikolon-getrennt), ids (nur IDs)"),
  where: whereSchema,
});

const ListShippingMethodsInput = z.object({
  include_deleted: z
    .boolean()
    .optional()
    .describe("Mit include_deleted=true werden auch geloeschte Datensaetze angezeigt."),
  page: z.number().int().positive().optional().describe("Page number (default 1)"),
  items: z.number().int().positive().optional().describe("Items per page (default 20)"),
  sort_field: z.string().optional().describe("Sortierfeld (z.B. 'name', 'datum', 'gesamtsumme')"),
  sort_order: z.enum(["asc", "desc"]).optional().default("asc").describe("Sortierreihenfolge"),
  limit: z.number().int().positive().max(200).optional().describe("Maximale Anzahl Ergebnisse"),
  fields: z.array(z.string()).optional().describe("Nur diese Felder zurueckgeben (z.B. ['name','plz','kundennummer'])"),
  aggregate: AggregateSchema,
  format: z.enum(["json", "table", "csv", "ids"]).optional().default("json").describe("Ausgabeformat: json (Standard), table (kompakte Tabelle), csv (Semikolon-getrennt), ids (nur IDs)"),
  where: whereSchema,
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
  sort_field: z.string().optional().describe("Sortierfeld (z.B. 'name', 'datum', 'gesamtsumme')"),
  sort_order: z.enum(["asc", "desc"]).optional().default("asc").describe("Sortierreihenfolge"),
  limit: z.number().int().positive().max(200).optional().describe("Maximale Anzahl Ergebnisse"),
  fields: z.array(z.string()).optional().describe("Nur diese Felder zurueckgeben (z.B. ['name','plz','kundennummer'])"),
  aggregate: AggregateSchema,
  format: z.enum(["json", "table", "csv", "ids"]).optional().default("json").describe("Ausgabeformat: json (Standard), table (kompakte Tabelle), csv (Semikolon-getrennt), ids (nur IDs)"),
  where: whereSchema,
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
      "Liste aller Artikel (GET /v1/artikel). Gibt eine kompakte Liste zurueck (nur Schluesselfelder). Fuer alle Details eines Artikels nutze openxe-get-article. Optionale Filter: name_de, nummer, typ, projekt. Include: verkaufspreise, lagerbestand, dateien, projekt. HINWEIS: Preise nur mit include=verkaufspreise sichtbar. Einkaufspreise sind nur ueber openxe-get-article (Einzelartikel) mit includeEinkaufspreise=true verfuegbar. Mit include_deleted=true werden auch geloeschte Datensaetze angezeigt.",
    inputSchema: zodToJsonSchema(ListArticlesInput) as Record<string, unknown>,
  },
  {
    name: "openxe-get-article",
    description:
      "Einzelnen Artikel abrufen (GET /v1/artikel/{id}). Gibt ALLE Felder eines einzelnen Datensatzes zurueck. Include: verkaufspreise, lagerbestand, dateien, projekt. Mit includeEinkaufspreise=true werden Einkaufspreise (Staffelpreise, Lieferanten) via Legacy API ergaenzt.",
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
      const { name: nameFilter, email, land, include_deleted, sort_field, sort_order, limit, fields, aggregate, format, where, ...serverParams } = args;

      // Only kundennummer goes to the server
      const apiParams: Record<string, string | number | undefined> = {};
      if (serverParams.kundennummer) apiParams.kundennummer = serverParams.kundennummer;

      const result = await fetchFilteredList(client, "/v1/adressen", apiParams, {
        slimFields: SLIM_FIELDS.address,
        includeDeleted: include_deleted,
        skipSlim: !!(where || fields || nameFilter || email || land),
        fetchAll: !!(where || nameFilter || email || land),
      });

      // Client-side filters (name, email, land)
      let data: any[] = result.data;
      if (nameFilter) {
        const lowerFilter = nameFilter.toLowerCase();
        data = data.filter((a: any) => {
          const n = String(a.name ?? "").toLowerCase();
          const fn = String(a.firma ?? "").toLowerCase();
          return n.includes(lowerFilter) || fn.includes(lowerFilter);
        });
      }
      if (email) {
        const lowerEmail = email.toLowerCase();
        data = data.filter((a: any) =>
          String(a.email ?? "").toLowerCase().includes(lowerEmail)
        );
      }
      if (land) {
        const upperLand = land.toUpperCase();
        data = data.filter((a: any) => String(a.land ?? "").toUpperCase() === upperLand);
      }

      // applyWhere -- on full data (before slim)
      if (where) {
        data = applyWhere(data, where);
      }

      // Aggregate: return aggregation result instead of data list
      if (aggregate) {
        const aggResult = applyAggregate(data, aggregate as AggregateOp);
        return { content: [{ type: "text", text: JSON.stringify(aggResult, null, 2) }] };
      }

      // 4. applySort
      if (sort_field) {
        data = applySort(data, { field: sort_field, order: sort_order || "asc" });
      }
      // 5. applyLimit
      if (limit) {
        data = applyLimit(data, limit);
      }
      // 6. applyFields OR applySlimMode (fields overrides slim)
      if (fields && fields.length > 0) {
        data = applyFields(data, fields);
      } else if (where || nameFilter || email || land) {
        data = applySlimMode(data, [...SLIM_FIELDS.address]) as any[];
      }
      // 7. truncateWithWarning (only if no explicit limit was set)
      if (!limit) {
        const { data: truncated, truncated: wasTruncated } = truncateWithWarning(data, MAX_LIST_RESULTS);
        result.data = truncated;
        result.meta.returned = truncated.length;
        result.meta.truncated = wasTruncated || result.meta.truncated;
      } else {
        result.data = data;
        result.meta.returned = data.length;
      }

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
      const { include_deleted: includeDeletedArt, page: _p, items: _i, sort_field: sfArt, sort_order: soArt, limit: limArt, fields: fldsArt, aggregate: aggArt, format: fmtArt, where: whereArt, ...filterArgs } = args;
      const apiParams: Record<string, string | number | undefined> = {};
      if (filterArgs.name_de) apiParams.name_de = filterArgs.name_de;
      if (filterArgs.nummer) apiParams.nummer = filterArgs.nummer;
      if (filterArgs.typ) apiParams.typ = filterArgs.typ;
      if (filterArgs.projekt) apiParams.projekt = filterArgs.projekt;
      if (filterArgs.include) apiParams.include = filterArgs.include;

      const result = await fetchFilteredList(client, "/v1/artikel", apiParams, {
        slimFields: SLIM_FIELDS.article,
        includeDeleted: includeDeletedArt,
        skipSlim: !!(whereArt || fldsArt),
        fetchAll: !!whereArt,
      });

      // applyWhere -- on full data (before slim)
      let dataArt: any[] = result.data;
      if (whereArt) {
        dataArt = applyWhere(dataArt, whereArt);
      }

      if (aggArt) {
        const aggResult = applyAggregate(dataArt, aggArt as AggregateOp);
        return { content: [{ type: "text", text: JSON.stringify(aggResult, null, 2) }] };
      }

      if (sfArt) {
        dataArt = applySort(dataArt, { field: sfArt, order: soArt || "asc" });
      }
      if (limArt) {
        dataArt = applyLimit(dataArt, limArt);
      }
      if (fldsArt && fldsArt.length > 0) {
        dataArt = applyFields(dataArt, fldsArt);
      } else if (whereArt || fldsArt) {
        dataArt = applySlimMode(dataArt, [...SLIM_FIELDS.article]) as any[];
      }
      if (!limArt) {
        const { data: trunc, truncated: truncFlag } = truncateWithWarning(dataArt, MAX_LIST_RESULTS);
        result.data = trunc;
        result.meta.returned = trunc.length;
        result.meta.truncated = truncFlag || result.meta.truncated;
      } else {
        result.data = dataArt;
        result.meta.returned = dataArt.length;
      }

      return buildListResponse(result, "Fuer alle Details eines Artikels nutze openxe-get-article mit der ID.", fmtArt);
    }

    case "openxe-get-article": {
      const { id, include, includeEinkaufspreise } = GetArticleInput.parse(input);
      const apiParams: Record<string, string | number | undefined> = {};
      if (include) apiParams.include = include;

      const result = await client.get(`/v1/artikel/${id}`, apiParams);
      const data = result.data;

      if (includeEinkaufspreise) {
        const legacyResult = await client.legacyPost("ArtikelGet", { id });
        const legacyData = legacyResult.data as any;
        if (legacyData?.einkaufspreise) {
          const ek = legacyData.einkaufspreise;
          // Normalize staffelpreis to always be an array
          if (ek.staffelpreis && !Array.isArray(ek.staffelpreis)) {
            ek.staffelpreis = [ek.staffelpreis];
          }
          (data as any).einkaufspreise = ek;
        }
      }

      return {
        content: [
          { type: "text", text: JSON.stringify(data, null, 2) },
        ],
      };
    }

    case "openxe-list-categories": {
      const args = ListCategoriesInput.parse(input);
      const { include_deleted: includeDeletedCat, page: _p2, items: _i2, sort_field: sfCat, sort_order: soCat, limit: limCat, fields: fldsCat, aggregate: aggCat, format: fmtCat, where: whereCat, ...filterArgs } = args;
      const apiParams: Record<string, string | number | undefined> = {};
      if (filterArgs.bezeichnung) apiParams.bezeichnung = filterArgs.bezeichnung;
      if (filterArgs.parent !== undefined) apiParams.parent = filterArgs.parent;
      if (filterArgs.projekt) apiParams.projekt = filterArgs.projekt;

      const result = await fetchFilteredList(client, "/v1/artikelkategorien", apiParams, {
        slimFields: SLIM_FIELDS.category,
        includeDeleted: includeDeletedCat,
        skipSlim: !!(whereCat || fldsCat),
        fetchAll: !!whereCat,
      });

      let dataCat: any[] = result.data;
      if (whereCat) {
        dataCat = applyWhere(dataCat, whereCat);
      }

      if (aggCat) {
        const aggResult = applyAggregate(dataCat, aggCat as AggregateOp);
        return { content: [{ type: "text", text: JSON.stringify(aggResult, null, 2) }] };
      }

      if (sfCat) {
        dataCat = applySort(dataCat, { field: sfCat, order: soCat || "asc" });
      }
      if (limCat) {
        dataCat = applyLimit(dataCat, limCat);
      }
      if (fldsCat && fldsCat.length > 0) {
        dataCat = applyFields(dataCat, fldsCat);
      } else if (whereCat || fldsCat) {
        dataCat = applySlimMode(dataCat, [...SLIM_FIELDS.category]) as any[];
      }
      if (!limCat) {
        const { data: trunc, truncated: truncFlag } = truncateWithWarning(dataCat, MAX_LIST_RESULTS);
        result.data = trunc;
        result.meta.returned = trunc.length;
        result.meta.truncated = truncFlag || result.meta.truncated;
      } else {
        result.data = dataCat;
        result.meta.returned = dataCat.length;
      }

      return buildListResponse(result, "Fuer Details einer Kategorie nutze die jeweilige Kategorie-ID.", fmtCat);
    }

    case "openxe-list-shipping-methods": {
      const args = ListShippingMethodsInput.parse(input);
      const { include_deleted: includeDeletedShip, page: _p3, items: _i3, sort_field: sfShip, sort_order: soShip, limit: limShip, fields: fldsShip, aggregate: aggShip, format: fmtShip, where: whereShip } = args;

      const result = await fetchFilteredList(client, "/v1/versandarten", {}, {
        slimFields: SLIM_FIELDS.shippingMethod,
        includeDeleted: includeDeletedShip,
        skipSlim: !!(whereShip || fldsShip),
        fetchAll: !!whereShip,
      });

      let dataShip: any[] = result.data;
      if (whereShip) {
        dataShip = applyWhere(dataShip, whereShip);
      }

      if (aggShip) {
        const aggResult = applyAggregate(dataShip, aggShip as AggregateOp);
        return { content: [{ type: "text", text: JSON.stringify(aggResult, null, 2) }] };
      }

      if (sfShip) {
        dataShip = applySort(dataShip, { field: sfShip, order: soShip || "asc" });
      }
      if (limShip) {
        dataShip = applyLimit(dataShip, limShip);
      }
      if (fldsShip && fldsShip.length > 0) {
        dataShip = applyFields(dataShip, fldsShip);
      } else if (whereShip || fldsShip) {
        dataShip = applySlimMode(dataShip, [...SLIM_FIELDS.shippingMethod]) as any[];
      }
      if (!limShip) {
        const { data: trunc, truncated: truncFlag } = truncateWithWarning(dataShip, MAX_LIST_RESULTS);
        result.data = trunc;
        result.meta.returned = trunc.length;
        result.meta.truncated = truncFlag || result.meta.truncated;
      } else {
        result.data = dataShip;
        result.meta.returned = dataShip.length;
      }

      return buildListResponse(result, "Versandarten-Liste. Nutze die ID fuer Zuordnungen.", fmtShip);
    }

    case "openxe-list-files": {
      const args = ListFilesInput.parse(input);
      const { include_deleted: includeDeletedFile, page: _p4, items: _i4, sort_field: sfFile, sort_order: soFile, limit: limFile, fields: fldsFile, aggregate: aggFile, format: fmtFile, where: whereFile, ...filterArgs } = args;
      const apiParams: Record<string, string | number | undefined> = {};
      if (filterArgs.objekt) apiParams.objekt = filterArgs.objekt;
      if (filterArgs.parameter) apiParams.parameter = filterArgs.parameter;
      if (filterArgs.stichwort) apiParams.stichwort = filterArgs.stichwort;

      const result = await fetchFilteredList(client, "/v1/dateien", apiParams, {
        slimFields: SLIM_FIELDS.file,
        includeDeleted: includeDeletedFile,
        skipSlim: !!(whereFile || fldsFile),
        fetchAll: !!whereFile,
      });

      let dataFile: any[] = result.data;
      if (whereFile) {
        dataFile = applyWhere(dataFile, whereFile);
      }

      if (aggFile) {
        const aggResult = applyAggregate(dataFile, aggFile as AggregateOp);
        return { content: [{ type: "text", text: JSON.stringify(aggResult, null, 2) }] };
      }

      if (sfFile) {
        dataFile = applySort(dataFile, { field: sfFile, order: soFile || "asc" });
      }
      if (limFile) {
        dataFile = applyLimit(dataFile, limFile);
      }
      if (fldsFile && fldsFile.length > 0) {
        dataFile = applyFields(dataFile, fldsFile);
      } else if (whereFile || fldsFile) {
        dataFile = applySlimMode(dataFile, [...SLIM_FIELDS.file]) as any[];
      }
      if (!limFile) {
        const { data: trunc, truncated: truncFlag } = truncateWithWarning(dataFile, MAX_LIST_RESULTS);
        result.data = trunc;
        result.meta.returned = trunc.length;
        result.meta.truncated = truncFlag || result.meta.truncated;
      } else {
        result.data = dataFile;
        result.meta.returned = dataFile.length;
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
