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
  applyFields,
  applyWhere,
  applyStatusPreset,
  getStatusPresetNames,
  parseZeitraum,
  formatAsTable,
  formatAsCsv,
  formatAsIds,
} from "../utils/smart-filters.js";
import {
  fetchPurchaseOrdersWithMeta,
  PURCHASE_ORDER_SCAN_CAP,
} from "../utils/purchase-order-fetch.js";

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

// --- List Purchase Orders ---

async function handleListPurchaseOrders(
  args: Record<string, unknown>,
  client: OpenXEClient
): Promise<ToolResult> {
  const filters = ListPurchaseOrdersInput.parse(args);

  // Validate status_preset up-front — reject unknown presets with a clear
  // error instead of silently passing them through applyStatusPreset
  // (which would return all records unfiltered).
  if (filters.status_preset) {
    const valid = getStatusPresetNames("purchaseOrders");
    if (!valid.includes(filters.status_preset)) {
      return {
        content: [
          {
            type: "text",
            text:
              `Unbekanntes status_preset: "${filters.status_preset}". ` +
              `Erlaubt: ${valid.join(" | ")}. ` +
              `Fuer Business-Presets (offene-bestellungen, ueberfaellige-lieferungen) ` +
              `stattdessen openxe-business-query nutzen.`,
          },
        ],
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

  // Use the shared robust fetcher (BelegeList -> BestellungGet scan with 5000 cap / 50 misses)
  const fetched = await fetchPurchaseOrdersWithMeta(client);
  const rawData: any[] = fetched.orders;
  const strategy = fetched.strategy === "belegelist" ? "BelegeList" : "BestellungGet (Scan)";
  const fetchTruncated = fetched.truncated;

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

  // Scan-cap warning (source 1): the fetcher hit PURCHASE_ORDER_SCAN_CAP, so the
  // result is an under-count. Surfaces as `_warning` on JSON and as a second
  // TextContent on plain-text formats.
  const scanCapWarning = fetchTruncated
    ? `WARNUNG: Bestellungs-Scan hat den Cap von ${PURCHASE_ORDER_SCAN_CAP} IDs erreicht — Ergebnis ist eine Untergrenze. Grenze die Abfrage ein (z.B. lieferantennummer, datum_gte).`
    : null;

  // MAX_LIST_RESULTS truncation (source 2): same pattern as read-tools /
  // document-read-tools / subscription-tools. Must run BEFORE the format
  // branches so that plain-text formats (table/csv/ids) honor MAX_LIST_RESULTS
  // just like JSON — otherwise format=csv without limit can dump the whole
  // FETCH_ALL_SAFETY_CAP=10000 set into the context.
  // User limit has precedence: if set we use it as effective cap, otherwise
  // MAX_LIST_RESULTS. Limit is applied HERE (not earlier via applyLimit) so
  // we can track whether the cap actually kicked in and emit a warning.
  const effectiveMax = typeof filters.limit === "number" && filters.limit > MAX_LIST_RESULTS
    ? filters.limit
    : (filters.limit ?? MAX_LIST_RESULTS);
  let truncated = false;
  {
    const result = truncateWithWarning(data, effectiveMax);
    data = result.data as any[];
    truncated = result.truncated;
  }

  // Max-list-results warning (source 2): emitted when MAX_LIST_RESULTS capped
  // the result. Same wording as read-tools/document-read-tools/subscription.
  const listCapWarning = truncated
    ? `WARNUNG: Ergebnis wurde nach ${effectiveMax} Eintraegen abgeschnitten. Verwende \`where\`, \`limit\` oder die tool-spezifischen Filter (siehe Tool-Beschreibung) um das Ergebnis einzugrenzen.`
    : null;

  // Output format (plain-text branches): append BOTH warnings as separate
  // TextContent items when applicable, so downstream parsers still see clean
  // raw text in content[0] while the LLM learns the list is capped.
  if (filters.format === "table" || filters.format === "csv" || filters.format === "ids") {
    const rawText =
      filters.format === "table" ? formatAsTable(data)
      : filters.format === "csv" ? formatAsCsv(data)
      : formatAsIds(data);
    const content: Array<{ type: "text"; text: string }> = [{ type: "text", text: rawText }];
    if (scanCapWarning) content.push({ type: "text", text: scanCapWarning });
    if (listCapWarning) content.push({ type: "text", text: listCapWarning });
    return { content };
  }

  // Build info string (JSON path)
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
  if (scanCapWarning) {
    response._warning = scanCapWarning;
  }

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
