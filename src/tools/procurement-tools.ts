import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { OpenXEClient } from "../client/openxe-client.js";
import {
  ListPurchaseOrdersInput,
  GetPurchaseOrderInput,
  CreatePurchaseOrderInput,
  EditPurchaseOrderInput,
  ReleasePurchaseOrderInput,
} from "../schemas/document.js";
import {
  applySlimMode,
  truncateWithWarning,
  SLIM_FIELDS,
  MAX_LIST_RESULTS,
  filterDeleted,
} from "../utils/field-filter.js";
import {
  applyAggregate,
  AggregateOp,
  applySort,
  applyLimit,
  applyFields,
  applyWhere,
  applyStatusPreset,
  parseZeitraum,
  formatAsTable,
  formatAsCsv,
  formatAsIds,
} from "../utils/smart-filters.js";

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

export const PROCUREMENT_TOOL_DEFINITIONS: ToolDefinition[] = [
  // === Read ===
  {
    name: "openxe-list-purchase-orders",
    description:
      "Bestellungen (Purchase Orders) auflisten via Legacy API. Gibt kompakte Liste zurueck (Schluesselfelder: id, belegnr, status, name, lieferantennummer, datum, lieferdatum, gesamtsumme). " +
      "Optionale Filter: status (offen/freigegeben/bestellt/angemahnt/empfangen), belegnr, lieferantennummer, name, datum_gte, datum_lte, projekt, zeitraum. " +
      "Status-Presets: offen, freigegeben, bestellt, angemahnt, empfangen, aktiv. " +
      "Smart Filter: where, sort, limit, fields, format (json/table/csv/ids), aggregate. " +
      "Fuer Details nutze openxe-get-purchase-order mit der ID.",
    inputSchema: zodToJsonSchema(ListPurchaseOrdersInput) as Record<string, unknown>,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "openxe-get-purchase-order",
    description:
      "Einzelne Bestellung (Purchase Order) abrufen via Legacy API (BestellungGet). " +
      "Gibt ALLE Felder zurueck inkl. verschachtelter artikelliste.position[] mit Positionsdetails.",
    inputSchema: zodToJsonSchema(GetPurchaseOrderInput) as Record<string, unknown>,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },

  // === Write ===
  {
    name: "openxe-create-purchase-order",
    description:
      "Neue Bestellung (Purchase Order) erstellen via Legacy API (BestellungCreate). " +
      "Required: adresse (Lieferanten-ID), positionen (mind. 1 Position mit nummer + menge). " +
      "Optional: projekt, lieferdatum, einkaeufer, zahlungsweise, versandart, freitext, internebezeichnung. " +
      "Preis pro Position: wenn nicht angegeben wird der Einkaufspreis aus dem Artikelstamm verwendet.",
    inputSchema: zodToJsonSchema(CreatePurchaseOrderInput) as Record<string, unknown>,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "openxe-edit-purchase-order",
    description:
      "Bestellung (Purchase Order) bearbeiten via Legacy API (BestellungEdit). " +
      "Required: id. Optional: lieferdatum, einkaeufer, zahlungsweise, versandart, freitext, internebezeichnung.",
    inputSchema: zodToJsonSchema(EditPurchaseOrderInput) as Record<string, unknown>,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "openxe-release-purchase-order",
    description:
      "Bestellung (Purchase Order) freigeben via Legacy API (BestellungFreigabe). " +
      "Aendert Status von 'offen' auf 'freigegeben'. Required: id.",
    inputSchema: zodToJsonSchema(ReleasePurchaseOrderInput) as Record<string, unknown>,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },
];

// --- Slim fields for purchase orders ---

const PURCHASE_ORDER_SLIM_FIELDS = [...SLIM_FIELDS.purchaseOrder];

// --- Helper: unwrap legacy response data into an array ---

function unwrapLegacyList(data: unknown): any[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    // Some Legacy endpoints nest the list under a key
    if (Array.isArray(obj.data)) return obj.data;
    if (Array.isArray(obj.bestellung)) return obj.bestellung;
    // Single record — wrap in array
    if (obj.id || obj.belegnr) return [data];
    // Check for any array value inside
    for (const val of Object.values(obj)) {
      if (Array.isArray(val)) return val;
    }
    // Non-empty object might be a single record
    if (Object.keys(obj).length > 0) return [data];
  }
  return [];
}

// --- Helper: fetch purchase orders via iterative BestellungGet ---

async function fetchPurchaseOrdersByIteration(
  client: OpenXEClient,
  maxId: number = 200
): Promise<any[]> {
  const orders: any[] = [];
  let consecutiveFailures = 0;

  for (let id = 1; id <= maxId; id++) {
    try {
      const result = await client.legacyPost("BestellungGet", { id: String(id) });
      if (result.success && result.data) {
        orders.push(result.data);
        consecutiveFailures = 0;
      } else {
        consecutiveFailures++;
      }
    } catch {
      consecutiveFailures++;
    }

    // Stop after 3 consecutive failures — likely past last ID
    if (consecutiveFailures >= 3) break;
  }

  return orders;
}

// --- List Purchase Orders ---

async function handleListPurchaseOrders(
  args: Record<string, unknown>,
  client: OpenXEClient
): Promise<ToolResult> {
  const filters = ListPurchaseOrdersInput.parse(args);

  // Resolve zeitraum shortcut into datum_gte / datum_lte
  if (filters.zeitraum) {
    const { von, bis } = parseZeitraum(filters.zeitraum);
    if (!filters.datum_gte) filters.datum_gte = von;
    if (!filters.datum_lte) filters.datum_lte = bis;
  }

  // Strategy 1: Try BelegeList with typ=bestellung
  let rawData: any[] = [];
  let strategy = "BelegeList";

  try {
    const result = await client.legacyPost("BelegeList", { typ: "bestellung" });
    if (result.success && result.data) {
      rawData = unwrapLegacyList(result.data);
    }
  } catch {
    // BelegeList not available — fall through
  }

  // Strategy 2: Fall back to iterative BestellungGet
  if (rawData.length === 0) {
    strategy = "BestellungGet (iterativ)";
    rawData = await fetchPurchaseOrdersByIteration(client);
  }

  // Apply basic server-side-like filters client-side (since Legacy API doesn't support query params)
  let data = rawData;

  // DEL filter
  if (!filters.includeDeleted) {
    data = filterDeleted(data);
  }

  const totalFromApi = rawData.length;
  const filteredOut = totalFromApi - data.length;

  // Client-side filters on known fields
  if (filters.status) {
    data = data.filter((r: any) => String(r.status || "").toLowerCase() === filters.status!.toLowerCase());
  }
  if (filters.belegnr) {
    data = data.filter((r: any) => String(r.belegnr || "").includes(filters.belegnr!));
  }
  if (filters.lieferantennummer) {
    data = data.filter((r: any) => String(r.lieferantennummer || "").includes(filters.lieferantennummer!));
  }
  if (filters.name) {
    data = data.filter((r: any) => String(r.name || "").toLowerCase().includes(filters.name!.toLowerCase()));
  }
  if (filters.datum_gte) {
    data = data.filter((r: any) => String(r.datum || "") >= filters.datum_gte!);
  }
  if (filters.datum_lte) {
    data = data.filter((r: any) => String(r.datum || "") <= filters.datum_lte!);
  }
  if (filters.projekt) {
    data = data.filter((r: any) => String(r.projekt || "").includes(filters.projekt!));
  }

  // applyWhere — advanced client-side filter
  if (filters.where) {
    // Parse where from string format if needed
    let whereClause: Record<string, any>;
    if (typeof filters.where === "string") {
      try {
        whereClause = JSON.parse(filters.where);
      } catch {
        whereClause = {};
      }
    } else {
      whereClause = filters.where as Record<string, any>;
    }
    data = applyWhere(data, whereClause);
  }

  // Apply status preset
  if (filters.status_preset) {
    data = applyStatusPreset(data, "purchaseOrders", filters.status_preset);
  }

  // Aggregate: return aggregation result instead of data list
  if (filters.aggregate) {
    let aggOp: AggregateOp;
    if (typeof filters.aggregate === "string") {
      // Parse string format: "count", "sum_field", "groupBy_field"
      if (filters.aggregate === "count") {
        aggOp = "count";
      } else {
        const parts = filters.aggregate.split("_");
        const op = parts[0];
        const field = parts.slice(1).join("_");
        aggOp = { [op]: field } as AggregateOp;
      }
    } else {
      aggOp = filters.aggregate as AggregateOp;
    }
    const aggResult = applyAggregate(data, aggOp);
    return { content: [{ type: "text", text: JSON.stringify(aggResult, null, 2) }] };
  }

  // Sort
  if (filters.sort) {
    let sortField: string;
    let sortOrder: "asc" | "desc" = "asc";
    if (typeof filters.sort === "string") {
      const parts = filters.sort.split("_");
      const lastPart = parts[parts.length - 1];
      if (lastPart === "asc" || lastPart === "desc") {
        sortOrder = lastPart;
        sortField = parts.slice(0, -1).join("_");
      } else {
        sortField = filters.sort;
      }
    } else {
      sortField = filters.sort;
    }
    data = applySort(data, { field: sortField, order: sortOrder });
  }

  // Limit
  if (filters.limit) {
    data = applyLimit(data, filters.limit);
  }

  // Fields or slim projection
  const needsSlim = !filters.fields;
  if (filters.fields) {
    const fieldList = typeof filters.fields === "string"
      ? filters.fields.split(",").map((f: string) => f.trim())
      : filters.fields as string[];
    data = applyFields(data, fieldList);
  } else {
    data = applySlimMode(data, PURCHASE_ORDER_SLIM_FIELDS) as any[];
  }

  // Output format
  if (filters.format === "table") return { content: [{ type: "text", text: formatAsTable(data) }] };
  if (filters.format === "csv") return { content: [{ type: "text", text: formatAsCsv(data) }] };
  if (filters.format === "ids") return { content: [{ type: "text", text: formatAsIds(data) }] };

  // Truncate (only if no explicit limit was set)
  let truncated = false;
  if (!filters.limit) {
    const result = truncateWithWarning(data, MAX_LIST_RESULTS);
    data = result.data as any[];
    truncated = result.truncated;
  }

  // Build info string
  let info = `${data.length} Ergebnisse (via ${strategy})`;
  if (filteredOut > 0) {
    info += ` (${filteredOut} geloeschte ausgeblendet). Fuer alle: includeDeleted=true`;
  }
  if (truncated) {
    info += ` — Liste gekuerzt, es gibt weitere Eintraege. Nutze Filter zum Eingrenzen.`;
  }

  const response: Record<string, unknown> = {
    _info: info,
    _hint: "Fuer Details nutze openxe-get-purchase-order mit der ID.",
    data,
  };

  return {
    content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
  };
}

// --- Get Purchase Order ---

async function handleGetPurchaseOrder(
  args: Record<string, unknown>,
  client: OpenXEClient
): Promise<ToolResult> {
  const { id } = GetPurchaseOrderInput.parse(args);

  const result = await client.legacyPost("BestellungGet", { id });

  // Parse positions from nested artikelliste.position
  const data = result.data as Record<string, unknown> | undefined;
  if (data) {
    const artikelliste = data.artikelliste as Record<string, unknown> | undefined;
    if (artikelliste) {
      let positions = artikelliste.position;
      // Ensure positions is always an array (single position comes as object)
      if (positions && !Array.isArray(positions)) {
        positions = [positions];
        artikelliste.position = positions;
      }
    }
  }

  return {
    content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
  };
}

// --- Create Purchase Order ---

async function handleCreatePurchaseOrder(
  args: Record<string, unknown>,
  client: OpenXEClient
): Promise<ToolResult> {
  const input = CreatePurchaseOrderInput.parse(args);

  // Build Legacy API payload structure
  const positions = input.positionen.map((pos) => {
    const position: Record<string, unknown> = {
      nummer: pos.nummer,
      menge: pos.menge,
    };
    if (pos.preis !== undefined) position.preis = pos.preis;
    if (pos.bezeichnunglieferant) position.bezeichnunglieferant = pos.bezeichnunglieferant;
    if (pos.bestellnummer) position.bestellnummer = pos.bestellnummer;
    if (pos.lieferdatum) position.lieferdatum = pos.lieferdatum;
    return position;
  });

  const payload: Record<string, unknown> = {
    bestellung: {
      adresse: input.adresse,
      artikelliste: {
        position: positions,
      },
    },
  };

  // Add optional fields to the bestellung wrapper
  const bestellung = payload.bestellung as Record<string, unknown>;
  if (input.projekt) bestellung.projekt = input.projekt;
  if (input.lieferdatum) bestellung.lieferdatum = input.lieferdatum;
  if (input.einkaeufer) bestellung.einkaeufer = input.einkaeufer;
  if (input.zahlungsweise) bestellung.zahlungsweise = input.zahlungsweise;
  if (input.versandart) bestellung.versandart = input.versandart;
  if (input.freitext) bestellung.freitext = input.freitext;
  if (input.internebezeichnung) bestellung.internebezeichnung = input.internebezeichnung;
  if (input.datum) bestellung.datum = input.datum;
  if (input.waehrung) bestellung.waehrung = input.waehrung;

  const result = await client.legacyPost("BestellungCreate", payload);

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}

// --- Edit Purchase Order ---

async function handleEditPurchaseOrder(
  args: Record<string, unknown>,
  client: OpenXEClient
): Promise<ToolResult> {
  const input = EditPurchaseOrderInput.parse(args);

  // Build payload with bestellung wrapper (same pattern as create)
  const fields: Record<string, unknown> = { id: input.id };
  if (input.lieferdatum) fields.lieferdatum = input.lieferdatum;
  if (input.einkaeufer) fields.einkaeufer = input.einkaeufer;
  if (input.zahlungsweise) fields.zahlungsweise = input.zahlungsweise;
  if (input.versandart) fields.versandart = input.versandart;
  if (input.freitext) fields.freitext = input.freitext;
  if (input.internebezeichnung) fields.internebezeichnung = input.internebezeichnung;
  if (input.projekt) fields.projekt = input.projekt;
  if (input.datum) fields.datum = input.datum;
  if (input.waehrung) fields.waehrung = input.waehrung;

  const payload = { bestellung: fields };

  const result = await client.legacyPost("BestellungEdit", payload);

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}

// --- Release Purchase Order ---

async function handleReleasePurchaseOrder(
  args: Record<string, unknown>,
  client: OpenXEClient
): Promise<ToolResult> {
  const { id } = ReleasePurchaseOrderInput.parse(args);

  // Workflow endpoints use flat payload (no wrapper), same as AuftragFreigabe/RechnungFreigabe
  const result = await client.legacyPost("BestellungFreigabe", { id });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

// --- Main Handler ---

export async function handleProcurementTool(
  toolName: string,
  args: Record<string, unknown>,
  client: OpenXEClient
): Promise<ToolResult> {
  switch (toolName) {
    case "openxe-list-purchase-orders":
      return handleListPurchaseOrders(args, client);
    case "openxe-get-purchase-order":
      return handleGetPurchaseOrder(args, client);
    case "openxe-create-purchase-order":
      return handleCreatePurchaseOrder(args, client);
    case "openxe-edit-purchase-order":
      return handleEditPurchaseOrder(args, client);
    case "openxe-release-purchase-order":
      return handleReleasePurchaseOrder(args, client);
    default:
      return {
        content: [{ type: "text", text: `Unknown procurement tool: ${toolName}` }],
        isError: true,
      };
  }
}
