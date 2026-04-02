import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { OpenXEClient } from "../client/openxe-client.js";
import { DateString } from "../schemas/common.js";
import { fetchFilteredList, FilteredListResult, MAX_LIST_RESULTS, applySlimMode } from "../utils/field-filter.js";
import { applyAggregate, AggregateOp, applySort, applyLimit, applyFields, applyWhere, formatAsTable, formatAsCsv, formatAsIds } from "../utils/smart-filters.js";
import { truncateWithWarning } from "../utils/field-filter.js";

const SubscriptionCreateInput = z.object({
  adresse: z.number().int().positive().describe("Customer address ID"),
  bezeichnung: z.string().describe("Subscription name/description (required by API)"),
  artikel: z.number().int().positive().optional().describe("Article ID (numeric). Provide either artikel or artikelnummer."),
  artikelnummer: z.string().optional().describe("Article number string (alternative to artikel ID)"),
  preisart: z.enum(["monat", "jahr", "wochen", "einmalig", "30tage", "360tage"]).describe("Pricing type / interval: monat, jahr, wochen, einmalig, 30tage, 360tage"),
  dokumenttyp: z.enum(["rechnung", "auftrag"]).optional().describe("Document type to generate: rechnung or auftrag"),
  zahlzyklus: z.number().int().positive().optional().describe("Payment cycle (number of intervals between billings)"),
  startdatum: DateString.optional().describe("Start date YYYY-MM-DD"),
  enddatum: z.string().optional().describe("End date YYYY-MM-DD"),
  preis: z.number().optional().describe("Price override"),
  menge: z.number().positive().optional().describe("Quantity"),
  waehrung: z.string().optional().describe("Currency code (e.g. EUR)"),
  rabatt: z.number().optional().describe("Discount percentage"),
  gruppe: z.number().int().optional().describe("Subscription group ID"),
  projekt: z.number().int().optional().describe("Project ID"),
  reihenfolge: z.number().int().optional().describe("Sort order / position"),
});

const SubscriptionEditInput = z
  .object({
    id: z.number().int().positive().describe("Subscription ID"),
  })
  .catchall(z.unknown());

const CrmDocumentCreateInput = z.object({
  adresse_from: z.number().int().positive().describe("Sender address ID"),
  adresse_to: z.number().int().positive().optional().describe("Recipient address ID"),
  typ: z.enum(["email", "brief", "telefon", "notiz"]).describe("Document type"),
  betreff: z.string().describe("Subject"),
  content: z.string().optional().describe("Content/body"),
  datum: z.string().optional().describe("Date YYYY-MM-DD (auto-set to today if omitted)"),
  uhrzeit: z.string().optional().describe("Time HH:mm:ss (auto-set to now if omitted)"),
  bearbeiter: z.string().optional().describe("Author/creator name (defaults to 'API')"),
  projekt: z.number().int().optional().describe("Project ID"),
});

const TrackingCreateInput = z.object({
  tracking: z.string().describe("Tracking-Nummer (z.B. DHL Sendungsnummer)"),
  lieferschein: z.string().optional().describe("Lieferschein-Belegnummer (z.B. '300001')"),
  auftrag: z.string().optional().describe("Auftrags-Belegnummer (alternative zu lieferschein)"),
  internet: z.string().optional().describe("Internet-Bestellnummer (alternative zu lieferschein)"),
  gewicht: z.string().describe("Gewicht in kg (z.B. '2.5')"),
  anzahlpakete: z.string().describe("Anzahl Pakete (z.B. '1')"),
  versendet_am: z.string().describe("Versanddatum YYYY-MM-DD (z.B. '2026-04-01')"),
});

const ResubmissionCreateInput = z.object({
  bezeichnung: z.string().min(3).describe("Title (min 3 chars)"),
  datum_erinnerung: DateString.describe("Reminder date YYYY-MM-DD"),
  zeit_erinnerung: z.string().regex(/^\d{2}:\d{2}:\d{2}$/).describe("Reminder time HH:mm:ss"),
  prio: z.number().int().min(0).max(1).optional().describe("Priority (0 or 1)"),
  adresse: z.number().int().optional().describe("Related address ID"),
  projekt: z.number().int().optional().describe("Related project ID"),
  beschreibung: z.string().optional().describe("Description"),
  bearbeiter: z.string().optional().describe("Assigned user"),
  adresse_mitarbeiter: z.number().int().optional().describe("Employee address ID"),
  datum_angelegt: z.string().optional().describe("Creation date YYYY-MM-DD (auto-set to today if omitted)"),
  zeit_angelegt: z.string().optional().describe("Creation time HH:mm:ss (auto-set to now if omitted)"),
  oeffentlich: z.number().int().min(0).max(1).optional().describe("Visibility (1=visible to all, auto-set to 1 if omitted)"),
});

const FileUploadInput = z.object({
  dateiname: z.string().describe("Dateiname mit Endung (z.B. 'rechnung.pdf')"),
  titel: z.string().describe("Titel/Beschreibung der Datei"),
  file_content: z.string().describe("Dateiinhalt als Base64-String"),
  beschreibung: z.string().optional().describe("Optionale Beschreibung"),
  objekt_typ: z.string().describe("Objekttyp dem die Datei zugeordnet wird: auftrag, rechnung, lieferschein, angebot, gutschrift, artikel, adresse, bestellung, projekt"),
  objekt_id: z.string().describe("ID des Objekts (z.B. '1' fuer Auftrag mit ID 1)"),
  stichwort: z.string().optional().default("Anlage").describe("Stichwort/Kategorie (Standard: 'Anlage')"),
});

const ServerTimeInput = z.object({}).describe("No parameters required");

// --- Slim fields for subscriptions ---

const SUBSCRIPTION_SLIM_FIELDS = ["id", "bezeichnung", "adresse", "artikel", "artikelnummer", "preisart", "preis", "menge", "startdatum", "enddatum", "gruppe", "projekt"] as const;

// --- Aggregate schema (shared by list tools) ---

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
  .describe("Aggregation: 'count', {sum:'feld'}, {avg:'feld'}, {min:'feld'}, {max:'feld'}, {groupBy:'feld', sum?:'feld'}.");

const whereSchema = z.record(z.string(), z.record(z.string(), z.any())).optional().describe(
  'Client-seitige Filter. Beispiele: {bezeichnung: {contains: "Hosting"}}, {preis: {gt: 100}}'
);

// --- List/Get subscription input schemas ---

const ListSubscriptionsInput = z.object({
  adresse: z.number().int().optional().describe("Filter by customer address ID"),
  artikel: z.number().int().optional().describe("Filter by article ID"),
  gruppe: z.number().int().optional().describe("Filter by subscription group ID"),
  projekt: z.number().int().optional().describe("Filter by project ID"),
  bezeichnung: z.string().optional().describe("Filter by subscription name (client-side contains filter)"),
  include_deleted: z.boolean().optional().describe("Include deleted records (default: false)"),
  page: z.number().int().positive().optional().describe("Page number (default 1)"),
  items: z.number().int().positive().optional().describe("Items per page (default 20)"),
  sort_field: z.string().optional().describe("Sort field (e.g. 'bezeichnung', 'startdatum', 'preis')"),
  sort_order: z.enum(["asc", "desc"]).optional().default("asc").describe("Sort order"),
  limit: z.number().int().positive().max(200).optional().describe("Max results"),
  fields: z.array(z.string()).optional().describe("Only return these fields"),
  aggregate: AggregateSchema,
  format: z.enum(["json", "table", "csv", "ids"]).optional().default("json").describe("Output format: json, table, csv, ids"),
  where: whereSchema,
});

const GetSubscriptionInput = z.object({
  id: z.number().int().positive().describe("Subscription ID"),
});

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export const SUBSCRIPTION_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "openxe-list-subscriptions",
    description:
      "Liste aller Abo-Artikel (GET /v1/aboartikel). Kompakte Liste mit Schluesselfeldern. Optionale Filter: adresse, artikel, gruppe, projekt, bezeichnung. Smart Filter: where, sort_field, sort_order, limit, fields, format, aggregate.",
    inputSchema: zodToJsonSchema(ListSubscriptionsInput) as Record<
      string,
      unknown
    >,
  },
  {
    name: "openxe-get-subscription",
    description:
      "Einzelnen Abo-Artikel abrufen (GET /v1/aboartikel/{id}). Gibt alle Felder zurueck inkl. Artikel-, Gruppen- und Adressinformationen.",
    inputSchema: zodToJsonSchema(GetSubscriptionInput) as Record<
      string,
      unknown
    >,
  },
  {
    name: "openxe-create-subscription",
    description:
      "Abo-Artikel anlegen. Pflichtfelder: adresse, bezeichnung, preisart (monat/jahr/wochen/einmalig/30tage/360tage). Optional: artikel oder artikelnummer, dokumenttyp, zahlzyklus, startdatum, preis, menge, etc.",
    inputSchema: zodToJsonSchema(SubscriptionCreateInput) as Record<
      string,
      unknown
    >,
  },
  {
    name: "openxe-edit-subscription",
    description: "Edit a subscription. Required: id.",
    inputSchema: zodToJsonSchema(SubscriptionEditInput) as Record<
      string,
      unknown
    >,
  },
  {
    name: "openxe-delete-subscription",
    description:
      "Cancel/soft-delete a subscription (sets gekuendigt). Required: id.",
    inputSchema: zodToJsonSchema(
      z.object({ id: z.number().int().positive() })
    ) as Record<string, unknown>,
  },
  {
    name: "openxe-create-crm-document",
    description:
      "Create a CRM document (note, email log, call log, or letter). Required: adresse_from, typ (email/brief/telefon/notiz), betreff.",
    inputSchema: zodToJsonSchema(CrmDocumentCreateInput) as Record<
      string,
      unknown
    >,
  },
  {
    name: "openxe-create-tracking",
    description:
      "Create a tracking number for a shipment. Required: tracking, gewicht, anzahlpakete, versendet_am. One of lieferschein/auftrag/internet must also be provided to identify the shipment.",
    inputSchema: zodToJsonSchema(TrackingCreateInput) as Record<
      string,
      unknown
    >,
  },
  {
    name: "openxe-create-resubmission",
    description:
      "Create a task/reminder with due date. Required: bezeichnung (min 3 chars), datum_erinnerung (YYYY-MM-DD), zeit_erinnerung (HH:mm:ss).",
    inputSchema: zodToJsonSchema(ResubmissionCreateInput) as Record<
      string,
      unknown
    >,
  },
  {
    name: "openxe-upload-file",
    description:
      "Datei hochladen und einem Objekt zuordnen (Auftrag, Rechnung, Kunde, Artikel, etc.). Die Datei erscheint im OpenXE UI unter dem zugeordneten Objekt im Tab 'Dateien'. Pflichtfelder: dateiname, titel, file_content (Base64), objekt_typ, objekt_id.",
    inputSchema: zodToJsonSchema(FileUploadInput) as Record<string, unknown>,
  },
  {
    name: "openxe-server-time",
    description: "Get current server time from OpenXE.",
    inputSchema: zodToJsonSchema(ServerTimeInput) as Record<string, unknown>,
  },
];

// --- Helper: build list response with metadata wrapper ---

function buildListResponse(result: FilteredListResult, hint: string, format?: string, fields?: string[]): ToolResult {
  const data = result.data as any[];

  if (format === "table") return { content: [{ type: "text", text: formatAsTable(data, fields) }] };
  if (format === "csv") return { content: [{ type: "text", text: formatAsCsv(data, fields) }] };
  if (format === "ids") return { content: [{ type: "text", text: formatAsIds(data) }] };

  const response: Record<string, unknown> = {};
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

export async function handleSubscriptionTool(
  toolName: string,
  args: Record<string, unknown>,
  client: OpenXEClient
): Promise<ToolResult> {
  switch (toolName) {
    case "openxe-list-subscriptions": {
      const parsed = ListSubscriptionsInput.parse(args);
      const { bezeichnung, include_deleted, sort_field, sort_order, limit, fields, aggregate, format, where, ...serverParams } = parsed;

      // Build API query params (server-side filters)
      const apiParams: Record<string, string | number | undefined> = {};
      if (serverParams.adresse) apiParams.adresse = serverParams.adresse;
      if (serverParams.artikel) apiParams.artikel = serverParams.artikel;
      if (serverParams.gruppe) apiParams.gruppe = serverParams.gruppe;
      if (serverParams.projekt) apiParams.projekt = serverParams.projekt;

      const result = await fetchFilteredList(client, "/v1/aboartikel", apiParams, {
        slimFields: [...SUBSCRIPTION_SLIM_FIELDS],
        includeDeleted: include_deleted,
        skipSlim: !!(where || fields || bezeichnung),
        fetchAll: !!(where || bezeichnung),
      });

      let data: any[] = result.data;

      // Client-side bezeichnung filter
      if (bezeichnung) {
        const lower = bezeichnung.toLowerCase();
        data = data.filter((r: any) => String(r.bezeichnung ?? "").toLowerCase().includes(lower));
      }

      // Smart filters: where
      if (where) {
        data = applyWhere(data, where);
      }

      // Aggregate: return aggregation instead of data list
      if (aggregate) {
        const aggResult = applyAggregate(data, aggregate as AggregateOp);
        return { content: [{ type: "text", text: JSON.stringify(aggResult, null, 2) }] };
      }

      // Sort
      if (sort_field) {
        data = applySort(data, { field: sort_field, order: sort_order || "asc" });
      }
      // Limit
      if (limit) {
        data = applyLimit(data, limit);
      }
      // Fields or slim
      if (fields && fields.length > 0) {
        data = applyFields(data, fields);
      } else if (where || bezeichnung) {
        data = applySlimMode(data, [...SUBSCRIPTION_SLIM_FIELDS]) as any[];
      }
      // Truncate
      if (!limit) {
        const { data: trunc, truncated: truncFlag } = truncateWithWarning(data, MAX_LIST_RESULTS);
        result.data = trunc;
        result.meta.returned = trunc.length;
        result.meta.truncated = truncFlag || result.meta.truncated;
      } else {
        result.data = data;
        result.meta.returned = data.length;
      }

      return buildListResponse(result, "Fuer alle Details eines Abos nutze openxe-get-subscription mit der ID.", format);
    }

    case "openxe-get-subscription": {
      const { id } = GetSubscriptionInput.parse(args);
      const result = await client.get(`/v1/aboartikel/${id}`, { include: "artikel,gruppe,adresse" });
      return {
        content: [
          { type: "text", text: JSON.stringify(result.data, null, 2) },
        ],
      };
    }

    case "openxe-create-subscription": {
      const input = SubscriptionCreateInput.parse(args);
      const result = await client.post("/v1/aboartikel", input);
      return {
        content: [
          { type: "text", text: JSON.stringify(result.data, null, 2) },
        ],
      };
    }
    case "openxe-edit-subscription": {
      const { id, ...fields } = SubscriptionEditInput.parse(args);
      const result = await client.put(
        `/v1/aboartikel/${id}`,
        fields as Record<string, unknown>
      );
      return {
        content: [
          { type: "text", text: JSON.stringify(result.data, null, 2) },
        ],
      };
    }
    case "openxe-delete-subscription": {
      const { id } = z
        .object({ id: z.number().int().positive() })
        .parse(args);
      await client.delete(`/v1/aboartikel/${id}`);
      return {
        content: [
          {
            type: "text",
            text: `Subscription ${id} cancelled (soft-deleted).`,
          },
        ],
      };
    }
    case "openxe-create-crm-document": {
      const input = CrmDocumentCreateInput.parse(args);
      const data: Record<string, unknown> = { ...input };
      // Auto-set datum and uhrzeit if not provided
      if (!data.datum) {
        const now = new Date();
        data.datum = now.toISOString().split('T')[0]; // YYYY-MM-DD
      }
      if (!data.uhrzeit) {
        const now = new Date();
        data.uhrzeit = now.toTimeString().split(' ')[0]; // HH:mm:ss
      }
      // Default bearbeiter to "API" if not set
      if (!data.bearbeiter) {
        data.bearbeiter = "API";
      }
      const result = await client.post("/v1/crmdokumente", data);
      return {
        content: [
          { type: "text", text: JSON.stringify(result.data, null, 2) },
        ],
      };
    }
    case "openxe-create-tracking": {
      const input = TrackingCreateInput.parse(args);
      const result = await client.post("/v1/trackingnummern", input);
      return {
        content: [
          { type: "text", text: JSON.stringify(result.data, null, 2) },
        ],
      };
    }
    case "openxe-create-resubmission": {
      const input = ResubmissionCreateInput.parse(args);
      const data: Record<string, unknown> = { ...input };
      // Auto-set creation timestamp
      if (!data.datum_angelegt) {
        data.datum_angelegt = new Date().toISOString().split('T')[0];
      }
      if (!data.zeit_angelegt) {
        data.zeit_angelegt = new Date().toTimeString().split(' ')[0];
      }
      // Default oeffentlich to 1 (visible to all) if not set
      if (data.oeffentlich === undefined) {
        data.oeffentlich = 1;
      }
      // Default bearbeiter to adresse value if not set (so it shows up for someone)
      if (!data.bearbeiter && data.adresse) {
        data.bearbeiter = data.adresse;
      }
      const result = await client.post("/v1/wiedervorlagen", data);
      return {
        content: [
          { type: "text", text: JSON.stringify(result.data, null, 2) },
        ],
      };
    }
    case "openxe-upload-file": {
      const input = FileUploadInput.parse(args);
      // /v1/dateien requires x-www-form-urlencoded, not JSON
      const formData: Record<string, string> = {
        dateiname: input.dateiname,
        titel: input.titel,
        file_content: input.file_content,
      };
      if (input.beschreibung) formData.beschreibung = input.beschreibung;

      // Object binding via stichwoerter
      formData["stichwoerter[0][modul]"] = input.objekt_typ;
      formData["stichwoerter[0][id]"] = input.objekt_id;
      formData["stichwoerter[0][stichwort]"] = input.stichwort || "Anlage";

      const result = await client.postForm("/v1/dateien", formData);
      return {
        content: [
          { type: "text", text: JSON.stringify(result.data, null, 2) },
        ],
      };
    }
    case "openxe-server-time": {
      const result = await client.legacyPost("ServerTimeGet", {});
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
    default:
      return {
        content: [{ type: "text", text: `Unknown tool: ${toolName}` }],
        isError: true,
      };
  }
}
