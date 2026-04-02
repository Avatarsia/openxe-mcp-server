import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { OpenXEClient } from "../client/openxe-client.js";
import { DateString } from "../schemas/common.js";

// --- Input Schemas ---

const ClockStatusInput = z.object({
  adresse: z
    .number()
    .int()
    .positive()
    .describe("Mitarbeiter-Adress-ID (Pflichtfeld)"),
});

const ClockActionInput = z.object({
  cmd: z
    .enum(["kommen", "gehen", "pausestart", "pausestop"])
    .describe("Stechuhr-Aktion: kommen (einstempeln), gehen (ausstempeln), pausestart, pausestop"),
  user: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Benutzer-ID (optional, Server nutzt Login-User als Fallback)"),
  adresse: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Mitarbeiter-Adress-ID (optional, Fallback wenn user nicht gesetzt)"),
});

const ClockSummaryInput = z.object({
  adresse: z
    .number()
    .int()
    .positive()
    .describe("Mitarbeiter-Adress-ID (Pflichtfeld)"),
});

const TimeEntryListInput = z.object({
  adresse: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Mitarbeiter-Adress-ID"),
  kundennummer: z.string().optional().describe("Kundennummer"),
  projekt: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Projekt-ID"),
  von: z.string().optional().describe("Startdatum YYYY-MM-DD"),
  bis: z.string().optional().describe("Enddatum YYYY-MM-DD"),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Offset fuer Paginierung"),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Max. Anzahl Ergebnisse"),
});

const TimeEntryCreateInput = z.object({
  mitarbeiternummer: z
    .string()
    .optional()
    .describe("Mitarbeiternummer (alternativ zu adresse)"),
  adresse: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Mitarbeiter-Adress-ID (alternativ zu mitarbeiternummer)"),
  aufgabe: z.string().describe("Taetigkeitsbeschreibung (Pflichtfeld)"),
  von: z.string().describe("Startzeit YYYY-MM-DD HH:mm:ss (Pflichtfeld)"),
  bis: z.string().describe("Endzeit YYYY-MM-DD HH:mm:ss (Pflichtfeld)"),
}).refine(
  (data) => data.mitarbeiternummer !== undefined || data.adresse !== undefined,
  { message: "Entweder mitarbeiternummer oder adresse muss angegeben werden" }
);

const TimeEntryEditInput = z
  .object({
    id: z
      .number()
      .int()
      .positive()
      .describe("Zeiterfassungs-ID (Pflichtfeld)"),
  })
  .catchall(z.unknown());

const TimeEntryDeleteInput = z.object({
  id: z
    .number()
    .int()
    .positive()
    .describe("Zeiterfassungs-ID (Pflichtfeld)"),
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

// --- Tool Definitions ---

export const TIME_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "openxe-clock-status",
    description:
      "Stechuhr-Status eines Mitarbeiters abfragen (eingestempelt/ausgestempelt, aktuelle Pause). Pflichtfeld: adresse (Mitarbeiter-Adress-ID).",
    inputSchema: zodToJsonSchema(ClockStatusInput) as Record<string, unknown>,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "openxe-clock-action",
    description:
      "Ein-/Ausstempeln oder Pause starten/stoppen. Pflichtfeld: cmd (kommen/gehen/pausestart/pausestop). Optional: user (Benutzer-ID), adresse (Mitarbeiter-Adress-ID als Fallback).",
    inputSchema: zodToJsonSchema(ClockActionInput) as Record<string, unknown>,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "openxe-clock-summary",
    description:
      "Wochen-Zeituebersicht: Soll-/Ist-Stunden, Ueberstunden, Urlaubstage. Pflichtfeld: adresse (Mitarbeiter-Adress-ID).",
    inputSchema: zodToJsonSchema(ClockSummaryInput) as Record<string, unknown>,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "openxe-list-time-entries",
    description:
      "Zeiterfassungs-Eintraege auflisten mit optionalen Filtern (adresse, kundennummer, projekt, von, bis, offset, limit).",
    inputSchema: zodToJsonSchema(TimeEntryListInput) as Record<string, unknown>,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "openxe-create-time-entry",
    description:
      "Neuen Zeiterfassungs-Eintrag erstellen. Pflichtfelder: aufgabe, von (YYYY-MM-DD HH:mm:ss), bis (YYYY-MM-DD HH:mm:ss). Mitarbeiter via mitarbeiternummer oder adresse.",
    inputSchema: zodToJsonSchema(TimeEntryCreateInput) as Record<string, unknown>,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "openxe-edit-time-entry",
    description:
      "Zeiterfassungs-Eintrag bearbeiten. Pflichtfeld: id. Weitere Felder optional (aufgabe, von, bis, etc.).",
    inputSchema: zodToJsonSchema(TimeEntryEditInput) as Record<string, unknown>,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "openxe-delete-time-entry",
    description:
      "Zeiterfassungs-Eintrag loeschen. Pflichtfeld: id.",
    inputSchema: zodToJsonSchema(TimeEntryDeleteInput) as Record<string, unknown>,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },
];

// --- Handler ---

export async function handleTimeTool(
  toolName: string,
  args: Record<string, unknown>,
  client: OpenXEClient
): Promise<ToolResult> {
  switch (toolName) {
    case "openxe-clock-status": {
      const input = ClockStatusInput.parse(args);
      const result = await client.legacyPost("StechuhrStatusGet", {
        adresse: input.adresse,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    case "openxe-clock-action": {
      const input = ClockActionInput.parse(args);
      const params: Record<string, unknown> = { cmd: input.cmd };
      if (input.user !== undefined) params.user = input.user;
      if (input.adresse !== undefined) params.adresse = input.adresse;
      const result = await client.legacyPost("StechuhrStatusSet", params);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    case "openxe-clock-summary": {
      const input = ClockSummaryInput.parse(args);
      const result = await client.legacyPost("StechuhrSummary", {
        adresse: input.adresse,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    case "openxe-list-time-entries": {
      const input = TimeEntryListInput.parse(args);
      const params: Record<string, unknown> = {};
      if (input.adresse !== undefined) params.adresse = input.adresse;
      if (input.kundennummer !== undefined) params.kundennummer = input.kundennummer;
      if (input.projekt !== undefined) params.projekt = input.projekt;
      if (input.von !== undefined) params.von = input.von;
      if (input.bis !== undefined) params.bis = input.bis;
      if (input.offset !== undefined) params.offset = input.offset;
      if (input.limit !== undefined) params.limit = input.limit;
      const result = await client.legacyPost("ZeiterfassungGet", params);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    case "openxe-create-time-entry": {
      const input = TimeEntryCreateInput.parse(args);
      const params: Record<string, unknown> = {
        aufgabe: input.aufgabe,
        von: input.von,
        bis: input.bis,
      };
      if (input.mitarbeiternummer !== undefined)
        params.mitarbeiternummer = input.mitarbeiternummer;
      if (input.adresse !== undefined) params.adresse = input.adresse;
      const result = await client.legacyPost("ZeiterfassungCreate", params);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    case "openxe-edit-time-entry": {
      const { id, ...fields } = TimeEntryEditInput.parse(args);
      const params: Record<string, unknown> = { id, ...fields };
      const result = await client.legacyPost("ZeiterfassungEdit", params);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    case "openxe-delete-time-entry": {
      const input = TimeEntryDeleteInput.parse(args);
      const result = await client.legacyPost("ZeiterfassungDelete", {
        id: input.id,
      });
      return {
        content: [
          {
            type: "text",
            text: `Zeiteintrag ${input.id} geloescht. ${JSON.stringify(result, null, 2)}`,
          },
        ],
      };
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown tool: ${toolName}` }],
        isError: true,
      };
  }
}
