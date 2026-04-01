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
  adresse: z.number().int().positive().describe("Address ID"),
  typ: z.enum(["notiz", "email", "telefonat"]).describe("Document type"),
  betreff: z.string().describe("Subject"),
  inhalt: z.string().optional().describe("Content/body"),
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
  betreff: z.string().describe("Subject"),
  faellig_am: DateString.describe("Due date YYYY-MM-DD"),
  beschreibung: z.string().optional().describe("Description"),
  adresse: z.number().int().optional().describe("Related address ID"),
  bearbeiter: z.string().optional().describe("Assigned user"),
  prioritaet: z
    .enum(["niedrig", "normal", "hoch", "dringend"])
    .optional()
    .describe("Priority"),
  modul: z.string().optional().describe("Related module"),
  parameter: z.number().int().optional().describe("Related entity ID"),
});

const FileUploadInput = z.object({
  filename: z.string().describe("File name"),
  content_base64: z.string().describe("Base64-encoded file content"),
  objekt: z.string().describe("Object type: Artikel, Adresse, Auftrag, etc."),
  parameter: z.number().int().describe("Object ID"),
  titel: z.string().optional().describe("File title"),
  beschreibung: z.string().optional().describe("File description"),
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
      "Create a CRM document (note, email log, or call log). Required: adresse, typ, betreff.",
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
      "Create a task/reminder with due date. Required: betreff, faellig_am.",
    inputSchema: zodToJsonSchema(ResubmissionCreateInput) as Record<
      string,
      unknown
    >,
  },
  {
    name: "openxe-upload-file",
    description:
      "Upload a file attached to an object (article, address, order, etc.). Required: filename, content_base64, objekt, parameter.",
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
      const result = await client.post("/v1/crm_dokumente", input);
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
        filename: input.filename,
        content_base64: input.content_base64,
        objekt: input.objekt,
        parameter: String(input.parameter),
      };
      if (input.titel) formData.titel = input.titel;
      if (input.beschreibung) formData.beschreibung = input.beschreibung;
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
