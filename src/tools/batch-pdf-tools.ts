import { zodToJsonSchema } from "zod-to-json-schema";
import { OpenXEClient } from "../client/openxe-client.js";
import { BatchPDFInput } from "../schemas/document.js";

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

// --- Constants ---

const MAX_BATCH_SIZE = 20;

/** Maps typ to REST v1 list path. */
const TYP_TO_PATH: Record<string, string> = {
  rechnung: "rechnungen",
  auftrag: "auftraege",
  angebot: "angebote",
  lieferschein: "lieferscheine",
  gutschrift: "gutschriften",
};

// --- Tool definition ---

export const BATCH_PDF_TOOL_DEFINITION: ToolDefinition = {
  name: "openxe-batch-pdf",
  description:
    "Mehrere Beleg-PDFs auf einmal herunterladen (max 20). " +
    "Entweder ids[] direkt angeben ODER mit status_preset / zeitraum / where filtern. " +
    "Gibt Array mit {id, belegnr, filename, size_bytes, base64} zurueck.",
  inputSchema: zodToJsonSchema(BatchPDFInput) as Record<string, unknown>,
};

// --- Helper: resolve IDs from filters ---

async function resolveIds(
  client: OpenXEClient,
  typ: string,
  statusPreset?: string,
  zeitraum?: string,
  where?: Record<string, string>
): Promise<Array<{ id: number; belegnr: string }>> {
  const path = TYP_TO_PATH[typ];
  if (!path) throw new Error(`Unbekannter Belegtyp: ${typ}`);

  const params: Record<string, string> = {};

  // Apply where-clause filters
  if (where) {
    for (const [key, value] of Object.entries(where)) {
      params[key] = value;
    }
  }

  // status_preset overrides any status in where
  if (statusPreset) {
    params.status = statusPreset;
  }

  // zeitraum maps to datum_gte
  if (zeitraum) {
    params.datum_gte = zeitraum;
  }

  // Fetch up to MAX_BATCH_SIZE + 1 to detect overflow
  params.items = String(MAX_BATCH_SIZE + 1);
  params.page = "1";

  const result = await client.get<any[]>(`/v1/belege/${path}`, params);
  const rawData = result.data;

  let list: any[];
  if (Array.isArray(rawData)) {
    list = rawData;
  } else if (rawData && typeof rawData === "object" && (rawData as any).data && Array.isArray((rawData as any).data)) {
    list = (rawData as any).data;
  } else {
    list = [];
  }

  // Filter out deleted records
  list = list.filter((r) => {
    if (String(r.geloescht || "0") === "1") return false;
    if (String(r.belegnr || "").startsWith("DEL")) return false;
    return true;
  });

  return list.map((r) => ({
    id: Number(r.id),
    belegnr: String(r.belegnr || ""),
  }));
}

// --- Handler ---

export async function handleBatchPDFTool(
  toolName: string,
  args: Record<string, unknown>,
  client: OpenXEClient
): Promise<ToolResult> {
  if (toolName !== "openxe-batch-pdf") {
    return {
      content: [{ type: "text", text: `Unknown batch-pdf tool: ${toolName}` }],
      isError: true,
    };
  }

  const input = BatchPDFInput.parse(args);
  const { typ, ids, status_preset, zeitraum, where } = input;

  // Step 1: Resolve IDs
  let documents: Array<{ id: number; belegnr: string }>;

  if (ids && ids.length > 0) {
    // Direct ID list — belegnr will be filled from PDF response metadata
    documents = ids.map((id) => ({ id, belegnr: "" }));
  } else if (status_preset || zeitraum || where) {
    documents = await resolveIds(client, typ, status_preset, zeitraum, where);
  } else {
    return {
      content: [
        {
          type: "text",
          text: "Fehler: Entweder ids[] oder mindestens ein Filter (status_preset, zeitraum, where) muss angegeben werden.",
        },
      ],
      isError: true,
    };
  }

  // Step 2: Enforce safety limit
  if (documents.length > MAX_BATCH_SIZE) {
    return {
      content: [
        {
          type: "text",
          text: `Zu viele Belege: ${documents.length} gefunden, maximal ${MAX_BATCH_SIZE} erlaubt. Bitte Filter eingrenzen.`,
        },
      ],
      isError: true,
    };
  }

  if (documents.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            _info: "Keine Belege gefunden fuer die angegebenen Filter.",
            results: [],
          }, null, 2),
        },
      ],
    };
  }

  // Step 3: Download each PDF
  const results: Array<{
    id: number;
    belegnr: string;
    filename: string;
    size_bytes: number;
    base64: string;
  }> = [];

  const errors: Array<{ id: number; error: string }> = [];

  for (const doc of documents) {
    try {
      const raw = await client.getRaw("/BelegPDF", {
        beleg: typ,
        id: String(doc.id),
      });

      const filename = `${typ}-${doc.id}.pdf`;
      const base64 = raw.data.toString("base64");

      results.push({
        id: doc.id,
        belegnr: doc.belegnr,
        filename,
        size_bytes: raw.data.length,
        base64,
      });
    } catch (err: any) {
      errors.push({
        id: doc.id,
        error: err?.message ?? String(err),
      });
    }
  }

  // Step 4: Return combined result
  const response: Record<string, unknown> = {
    _info: `${results.length} PDFs heruntergeladen` +
      (errors.length > 0 ? `, ${errors.length} Fehler` : ""),
    total_requested: documents.length,
    total_downloaded: results.length,
    results,
  };

  if (errors.length > 0) {
    response.errors = errors;
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(response, null, 2),
      },
    ],
  };
}
