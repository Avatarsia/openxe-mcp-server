import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { OpenXEClient } from "../client/openxe-client.js";
import { applySlimMode, truncateWithWarning, SLIM_FIELDS, MAX_LIST_RESULTS } from "../utils/field-filter.js";

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
  page: z.number().int().positive().optional().describe("Page number (default 1)"),
  items: z.number().int().positive().optional().describe("Items per page (default 20)"),
  full: z.boolean().optional().describe("Return all fields (default false = slim mode with key fields only)"),
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
  page: z.number().int().positive().optional().describe("Page number (default 1)"),
  items: z.number().int().positive().optional().describe("Items per page (default 20)"),
  full: z.boolean().optional().describe("Return all fields (default false = slim mode with key fields only)"),
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
  page: z.number().int().positive().optional().describe("Page number (default 1)"),
  items: z.number().int().positive().optional().describe("Items per page (default 20)"),
  full: z.boolean().optional().describe("Return all fields (default false = slim mode with key fields only)"),
});

const ListShippingMethodsInput = z.object({
  page: z.number().int().positive().optional().describe("Page number (default 1)"),
  items: z.number().int().positive().optional().describe("Items per page (default 20)"),
  full: z.boolean().optional().describe("Return all fields (default false = slim mode with key fields only)"),
});

const ListFilesInput = z.object({
  objekt: z.string().optional().describe("Filter by object type (e.g. Artikel, Adresse)"),
  parameter: z.string().optional().describe("Filter by object ID (parameter value)"),
  stichwort: z.string().optional().describe("Filter by keyword/tag"),
  page: z.number().int().positive().optional().describe("Page number (default 1)"),
  items: z.number().int().positive().optional().describe("Items per page (default 20)"),
  full: z.boolean().optional().describe("Return all fields (default false = slim mode with key fields only)"),
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
      "Liste aller Adressen/Kunden (List all addresses/customers). GET /v1/adressen. Optionale Filter: kundennummer, name, email, land. HINWEIS: Nur kundennummer wird serverseitig gefiltert; name/email/land werden clientseitig gefiltert. Gibt standardmaessig nur Schluesselfelder zurueck. Mit full=true werden alle Felder geladen.",
    inputSchema: zodToJsonSchema(ListAddressesInput) as Record<string, unknown>,
  },
  {
    name: "openxe-get-address",
    description:
      "Einzelne Adresse abrufen (Get a single address by ID). GET /v1/adressen/{id}.",
    inputSchema: zodToJsonSchema(GetAddressInput) as Record<string, unknown>,
  },
  {
    name: "openxe-list-articles",
    description:
      "Liste aller Artikel (List all articles). GET /v1/artikel. Optionale Filter: name_de, nummer, typ, projekt. Include: verkaufspreise, lagerbestand, dateien, projekt. HINWEIS: Preise nur mit include=verkaufspreise sichtbar. Gibt standardmaessig nur Schluesselfelder zurueck. Mit full=true werden alle Felder geladen.",
    inputSchema: zodToJsonSchema(ListArticlesInput) as Record<string, unknown>,
  },
  {
    name: "openxe-get-article",
    description:
      "Einzelnen Artikel abrufen (Get a single article by ID). GET /v1/artikel/{id}. Include: verkaufspreise, lagerbestand, dateien, projekt.",
    inputSchema: zodToJsonSchema(GetArticleInput) as Record<string, unknown>,
  },
  {
    name: "openxe-list-categories",
    description:
      "Liste aller Artikelkategorien (List all article categories). GET /v1/artikelkategorien. Optionale Filter: bezeichnung, parent, projekt. Gibt standardmaessig nur Schluesselfelder zurueck. Mit full=true werden alle Felder geladen.",
    inputSchema: zodToJsonSchema(ListCategoriesInput) as Record<string, unknown>,
  },
  {
    name: "openxe-list-shipping-methods",
    description:
      "Liste aller Versandarten (List all shipping methods). GET /v1/versandarten. Gibt standardmaessig nur Schluesselfelder zurueck. Mit full=true werden alle Felder geladen.",
    inputSchema: zodToJsonSchema(ListShippingMethodsInput) as Record<string, unknown>,
  },
  {
    name: "openxe-list-files",
    description:
      "Liste aller Dateien/Anhaenge (List all file attachments). GET /v1/dateien. Optionale Filter: objekt, parameter, stichwort. Gibt standardmaessig nur Schluesselfelder zurueck. Mit full=true werden alle Felder geladen.",
    inputSchema: zodToJsonSchema(ListFilesInput) as Record<string, unknown>,
  },
];

// --- Handler ---

export async function handleReadTool(
  name: string,
  input: Record<string, unknown>,
  client: OpenXEClient
): Promise<ToolResult> {
  switch (name) {
    case "openxe-list-addresses": {
      const args = ListAddressesInput.parse(input);
      const { name: nameFilter, email, land, full, ...serverParams } = args;

      // Only kundennummer, page, items go to the server
      const apiParams: Record<string, string | number | undefined> = {};
      if (serverParams.kundennummer) apiParams.kundennummer = serverParams.kundennummer;
      if (serverParams.page) apiParams.page = serverParams.page;
      if (serverParams.items) apiParams.items = serverParams.items;

      const result = await client.get("/v1/adressen", apiParams);

      // Client-side filtering for fields the server ignores
      let data = result.data as Record<string, unknown>[];
      if (Array.isArray(data)) {
        if (nameFilter) {
          const lowerFilter = nameFilter.toLowerCase();
          data = data.filter((a) => {
            const n = String(a.name ?? "").toLowerCase();
            const fn = String(a.firma ?? "").toLowerCase();
            return n.includes(lowerFilter) || fn.includes(lowerFilter);
          });
        }
        if (email) {
          const lowerEmail = email.toLowerCase();
          data = data.filter((a) =>
            String(a.email ?? "").toLowerCase().includes(lowerEmail)
          );
        }
        if (land) {
          const upperLand = land.toUpperCase();
          data = data.filter((a) => String(a.land ?? "").toUpperCase() === upperLand);
        }
      }

      if (!full) {
        data = applySlimMode(data, SLIM_FIELDS.address) as Record<string, unknown>[];
        const { data: truncated, truncated: wasTruncated, total } = truncateWithWarning(data, MAX_LIST_RESULTS);
        data = truncated;
        if (wasTruncated) {
          return { content: [{ type: "text", text: `Zeige ${truncated.length} von ${total} Ergebnissen. Nutze Filter oder full=true fuer alle.\n\n` + JSON.stringify(data, null, 2) }] };
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              full ? { data, pagination: result.pagination } : { data },
              null,
              2
            ),
          },
        ],
      };
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
      const { full, ...filterArgs } = args;
      const apiParams: Record<string, string | number | undefined> = {};
      if (filterArgs.name_de) apiParams.name_de = filterArgs.name_de;
      if (filterArgs.nummer) apiParams.nummer = filterArgs.nummer;
      if (filterArgs.typ) apiParams.typ = filterArgs.typ;
      if (filterArgs.projekt) apiParams.projekt = filterArgs.projekt;
      if (filterArgs.include) apiParams.include = filterArgs.include;
      if (filterArgs.page) apiParams.page = filterArgs.page;
      if (filterArgs.items) apiParams.items = filterArgs.items;

      const result = await client.get("/v1/artikel", apiParams);
      let data = Array.isArray(result.data) ? result.data : [];

      if (!full) {
        data = applySlimMode(data, SLIM_FIELDS.article) as any[];
        const { data: truncated, truncated: wasTruncated, total } = truncateWithWarning(data, MAX_LIST_RESULTS);
        data = truncated;
        if (wasTruncated) {
          return { content: [{ type: "text", text: `Zeige ${truncated.length} von ${total} Ergebnissen. Nutze Filter oder full=true fuer alle.\n\n` + JSON.stringify(data, null, 2) }] };
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              full ? { data, pagination: result.pagination } : { data },
              null,
              2
            ),
          },
        ],
      };
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
      const { full, ...filterArgs } = args;
      const apiParams: Record<string, string | number | undefined> = {};
      if (filterArgs.bezeichnung) apiParams.bezeichnung = filterArgs.bezeichnung;
      if (filterArgs.parent !== undefined) apiParams.parent = filterArgs.parent;
      if (filterArgs.projekt) apiParams.projekt = filterArgs.projekt;
      if (filterArgs.page) apiParams.page = filterArgs.page;
      if (filterArgs.items) apiParams.items = filterArgs.items;

      const result = await client.get("/v1/artikelkategorien", apiParams);
      let data = Array.isArray(result.data) ? result.data : [];

      if (!full) {
        data = applySlimMode(data, SLIM_FIELDS.category) as any[];
        const { data: truncated, truncated: wasTruncated, total } = truncateWithWarning(data, MAX_LIST_RESULTS);
        data = truncated;
        if (wasTruncated) {
          return { content: [{ type: "text", text: `Zeige ${truncated.length} von ${total} Ergebnissen. Nutze Filter oder full=true fuer alle.\n\n` + JSON.stringify(data, null, 2) }] };
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              full ? { data, pagination: result.pagination } : { data },
              null,
              2
            ),
          },
        ],
      };
    }

    case "openxe-list-shipping-methods": {
      const args = ListShippingMethodsInput.parse(input);
      const { full, ...filterArgs } = args;
      const apiParams: Record<string, string | number | undefined> = {};
      if (filterArgs.page) apiParams.page = filterArgs.page;
      if (filterArgs.items) apiParams.items = filterArgs.items;

      const result = await client.get("/v1/versandarten", apiParams);
      let data = Array.isArray(result.data) ? result.data : [];

      if (!full) {
        data = applySlimMode(data, SLIM_FIELDS.shipping) as any[];
        const { data: truncated, truncated: wasTruncated, total } = truncateWithWarning(data, MAX_LIST_RESULTS);
        data = truncated;
        if (wasTruncated) {
          return { content: [{ type: "text", text: `Zeige ${truncated.length} von ${total} Ergebnissen. Nutze Filter oder full=true fuer alle.\n\n` + JSON.stringify(data, null, 2) }] };
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              full ? { data, pagination: result.pagination } : { data },
              null,
              2
            ),
          },
        ],
      };
    }

    case "openxe-list-files": {
      const args = ListFilesInput.parse(input);
      const { full, ...filterArgs } = args;
      const apiParams: Record<string, string | number | undefined> = {};
      if (filterArgs.objekt) apiParams.objekt = filterArgs.objekt;
      if (filterArgs.parameter) apiParams.parameter = filterArgs.parameter;
      if (filterArgs.stichwort) apiParams.stichwort = filterArgs.stichwort;
      if (filterArgs.page) apiParams.page = filterArgs.page;
      if (filterArgs.items) apiParams.items = filterArgs.items;

      const result = await client.get("/v1/dateien", apiParams);
      let data = Array.isArray(result.data) ? result.data : [];

      if (!full) {
        data = applySlimMode(data, SLIM_FIELDS.file) as any[];
        const { data: truncated, truncated: wasTruncated, total } = truncateWithWarning(data, MAX_LIST_RESULTS);
        data = truncated;
        if (wasTruncated) {
          return { content: [{ type: "text", text: `Zeige ${truncated.length} von ${total} Ergebnissen. Nutze Filter oder full=true fuer alle.\n\n` + JSON.stringify(data, null, 2) }] };
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              full ? { data, pagination: result.pagination } : { data },
              null,
              2
            ),
          },
        ],
      };
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown read tool: ${name}` }],
        isError: true,
      };
  }
}
