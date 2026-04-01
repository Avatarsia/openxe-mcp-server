import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { OpenXEClient } from "../client/openxe-client.js";
import { DateString } from "../schemas/common.js";

const SubscriptionCreateInput = z.object({
  adresse: z.number().int().positive().describe("Customer address ID"),
  artikel: z.number().int().positive().describe("Article ID"),
  menge: z.number().positive().describe("Quantity"),
  intervall_monate: z.number().int().positive().describe("Interval in months"),
  startdatum: DateString.describe("Start date YYYY-MM-DD"),
  preis: z.number().optional().describe("Price override"),
  waehrung: z.string().optional().describe("Currency code"),
  enddatum: z.string().optional().describe("End date YYYY-MM-DD"),
  abogruppe: z.number().int().optional().describe("Subscription group ID"),
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
  datum: z.string().optional().describe("Date YYYY-MM-DD"),
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
    name: "openxe-create-subscription",
    description:
      "Create a recurring subscription item. Required: adresse, artikel, menge, intervall_monate, startdatum.",
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

export async function handleSubscriptionTool(
  toolName: string,
  args: Record<string, unknown>,
  client: OpenXEClient
): Promise<ToolResult> {
  switch (toolName) {
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
      const result = await client.post("/v1/crmdokumente", input);
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
      const result = await client.post("/v1/wiedervorlagen", input);
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
