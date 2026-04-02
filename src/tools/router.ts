import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { OpenXEClient } from "../client/openxe-client.js";
import { handleReadTool } from "./read-tools.js";
import { handleDocumentReadTool } from "./document-read-tools.js";
import { handleDocumentTool } from "./document-tools.js";
import { handleAddressTool } from "./address-tools.js";
import { handleSubscriptionTool } from "./subscription-tools.js";
import { handleTimeTool } from "./time-tools.js";
import { handleBusinessQueryTool } from "./business-query-tools.js";
import { handleBatchPDFTool } from "./batch-pdf-tools.js";
import { handleDashboardTool } from "./dashboard-tools.js";
import { handleProcurementTool } from "./procurement-tools.js";
import { BUSINESS_PRESETS } from "../utils/smart-filters.js";

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

// --- Action Registry ---

type Category = "stammdaten" | "belege" | "beschaffung" | "business" | "shop" | "zeiterfassung" | "system" | "dashboard";

interface ActionEntry {
  action: string;
  label: string;
  category: Category;
  handler: "read" | "document-read" | "document" | "address" | "subscription" | "time" | "business-query" | "batch-pdf" | "dashboard" | "procurement";
  toolName: string; // original openxe-* tool name
}

const ACTION_REGISTRY: ActionEntry[] = [
  // === Stammdaten ===
  { action: "list-addresses", label: "Kunden/Adressen auflisten [+Smart Filter] (Filter: kundennummer, name, land)", category: "stammdaten", handler: "read", toolName: "openxe-list-addresses" },
  { action: "get-address", label: "Adresse nach ID abrufen (alle Details)", category: "stammdaten", handler: "read", toolName: "openxe-get-address" },
  { action: "list-articles", label: "Artikel auflisten [+Smart Filter] (Filter: nummer, name_de; Include: verkaufspreise, lagerbestand)", category: "stammdaten", handler: "read", toolName: "openxe-list-articles" },
  { action: "get-article", label: "Artikel nach ID (alle Details + Preise + Lager + Einkaufspreise via includeEinkaufspreise)", category: "stammdaten", handler: "read", toolName: "openxe-get-article" },
  { action: "create-address", label: "Neuen Kunden anlegen (kundennummer=NEU fuer Autovergabe)", category: "stammdaten", handler: "address", toolName: "openxe-create-address" },
  { action: "edit-address", label: "Adresse bearbeiten", category: "stammdaten", handler: "address", toolName: "openxe-edit-address" },
  { action: "create-delivery-address", label: "Lieferadresse anlegen", category: "stammdaten", handler: "address", toolName: "openxe-create-delivery-address" },
  { action: "edit-delivery-address", label: "Lieferadresse bearbeiten", category: "stammdaten", handler: "address", toolName: "openxe-edit-delivery-address" },
  { action: "delete-delivery-address", label: "Lieferadresse loeschen", category: "stammdaten", handler: "address", toolName: "openxe-delete-delivery-address" },
  { action: "list-categories", label: "Artikelkategorien [+Smart Filter]", category: "stammdaten", handler: "read", toolName: "openxe-list-categories" },
  { action: "list-shipping", label: "Versandarten [+Smart Filter]", category: "stammdaten", handler: "read", toolName: "openxe-list-shipping-methods" },
  { action: "list-files", label: "Dateien/Anhaenge auflisten [+Smart Filter]", category: "stammdaten", handler: "read", toolName: "openxe-list-files" },

  // === Belege ===
  { action: "list-orders", label: "Auftraege auflisten [+Smart Filter] (Filter: belegnr, kundennummer, status, datum)", category: "belege", handler: "document-read", toolName: "openxe-list-orders" },
  { action: "get-order", label: "Auftrag nach ID (mit Positionen)", category: "belege", handler: "document-read", toolName: "openxe-get-order" },
  { action: "list-invoices", label: "Rechnungen auflisten [+Smart Filter]", category: "belege", handler: "document-read", toolName: "openxe-list-invoices" },
  { action: "get-invoice", label: "Rechnung nach ID (mit Positionen)", category: "belege", handler: "document-read", toolName: "openxe-get-invoice" },
  { action: "list-quotes", label: "Angebote auflisten [+Smart Filter]", category: "belege", handler: "document-read", toolName: "openxe-list-quotes" },
  { action: "get-quote", label: "Angebot nach ID", category: "belege", handler: "document-read", toolName: "openxe-get-quote" },
  { action: "list-delivery-notes", label: "Lieferscheine auflisten [+Smart Filter]", category: "belege", handler: "document-read", toolName: "openxe-list-delivery-notes" },
  { action: "get-delivery-note", label: "Lieferschein nach ID", category: "belege", handler: "document-read", toolName: "openxe-get-delivery-note" },
  { action: "list-credit-memos", label: "Gutschriften auflisten [+Smart Filter]", category: "belege", handler: "document-read", toolName: "openxe-list-credit-memos" },
  { action: "get-credit-memo", label: "Gutschrift nach ID", category: "belege", handler: "document-read", toolName: "openxe-get-credit-memo" },
  { action: "create-order", label: "Neuen Auftrag erstellen", category: "belege", handler: "document", toolName: "openxe-create-order" },
  { action: "create-quote", label: "Neues Angebot erstellen", category: "belege", handler: "document", toolName: "openxe-create-quote" },
  { action: "create-invoice", label: "Neue Rechnung erstellen", category: "belege", handler: "document", toolName: "openxe-create-invoice" },
  { action: "create-credit-note", label: "Gutschrift erstellen", category: "belege", handler: "document", toolName: "openxe-create-credit-note" },
  { action: "edit-order", label: "Auftrag bearbeiten (Header-Felder: id, lieferdatum, versandart, zahlungsweise, freitext, internebezeichnung)", category: "belege", handler: "document", toolName: "openxe-edit-order" },
  { action: "edit-invoice", label: "Rechnung bearbeiten (id, zahlungsweise, zahlungszieltage, freitext, internebezeichnung)", category: "belege", handler: "document", toolName: "openxe-edit-invoice" },
  { action: "edit-quote", label: "Angebot bearbeiten (id, gueltigbis, zahlungsweise, freitext, internebezeichnung, lieferbedingung)", category: "belege", handler: "document", toolName: "openxe-edit-quote" },
  { action: "edit-delivery-note", label: "Lieferschein bearbeiten (id, versandart, freitext, internebezeichnung)", category: "belege", handler: "document", toolName: "openxe-edit-delivery-note" },
  { action: "edit-credit-memo", label: "Gutschrift bearbeiten (id, zahlungsweise, freitext, internebezeichnung)", category: "belege", handler: "document", toolName: "openxe-edit-credit-memo" },
  { action: "convert-quote-to-order", label: "Angebot zu Auftrag weiterfuehren", category: "belege", handler: "document", toolName: "openxe-convert-quote-to-order" },
  { action: "convert-to-invoice", label: "Auftrag zu Rechnung weiterfuehren", category: "belege", handler: "document", toolName: "openxe-convert-order-to-invoice" },
  { action: "release-order", label: "Auftrag freigeben", category: "belege", handler: "document", toolName: "openxe-release-order" },
  { action: "release-invoice", label: "Rechnung freigeben", category: "belege", handler: "document", toolName: "openxe-release-invoice" },
  { action: "mark-invoice-paid", label: "Rechnung als bezahlt markieren", category: "belege", handler: "document", toolName: "openxe-mark-invoice-paid" },
  { action: "delete-draft-invoice", label: "Entwurfs-Rechnung loeschen", category: "belege", handler: "document", toolName: "openxe-delete-draft-invoice" },
  { action: "get-document-pdf", label: "PDF eines Belegs abrufen (typ + id)", category: "belege", handler: "document", toolName: "openxe-get-document-pdf" },
  { action: "batch-pdf", label: "Mehrere Beleg-PDFs herunterladen (max 20, Filter: ids/status/zeitraum/where)", category: "belege", handler: "batch-pdf", toolName: "openxe-batch-pdf" },

  // === Beschaffung (Einkauf) ===
  { action: "list-purchase-orders", label: "Bestellungen auflisten [+Smart Filter] (Filter: status, belegnr, lieferantennummer, name, zeitraum)", category: "beschaffung", handler: "procurement", toolName: "openxe-list-purchase-orders" },
  { action: "get-purchase-order", label: "Einzelne Bestellung mit Positionen abrufen", category: "beschaffung", handler: "procurement", toolName: "openxe-get-purchase-order" },
  { action: "create-purchase-order", label: "Neue Bestellung anlegen (adresse, positionen [{nummer, menge, preis}], lieferdatum, einkaeufer)", category: "beschaffung", handler: "procurement", toolName: "openxe-create-purchase-order" },
  { action: "edit-purchase-order", label: "Bestellung bearbeiten (id, lieferdatum, einkaeufer, versandart, ...)", category: "beschaffung", handler: "procurement", toolName: "openxe-edit-purchase-order" },
  { action: "release-purchase-order", label: "Bestellung freigeben", category: "beschaffung", handler: "procurement", toolName: "openxe-release-purchase-order" },

  // === Shop / Sonstiges ===
  { action: "create-subscription", label: "Abo-Artikel anlegen", category: "shop", handler: "subscription", toolName: "openxe-create-subscription" },
  { action: "edit-subscription", label: "Abo-Artikel bearbeiten", category: "shop", handler: "subscription", toolName: "openxe-edit-subscription" },
  { action: "delete-subscription", label: "Abo-Artikel kuendigen", category: "shop", handler: "subscription", toolName: "openxe-delete-subscription" },
  { action: "create-crm-document", label: "CRM-Dokument anlegen (Notiz/Email/Telefonat)", category: "shop", handler: "subscription", toolName: "openxe-create-crm-document" },
  { action: "create-tracking", label: "Trackingnummer anlegen", category: "shop", handler: "subscription", toolName: "openxe-create-tracking" },
  { action: "create-resubmission", label: "Wiedervorlage/Aufgabe anlegen", category: "shop", handler: "subscription", toolName: "openxe-create-resubmission" },
  { action: "upload-file", label: "Datei hochladen (an Auftrag/Kunde/Artikel etc. anhaengen)", category: "shop", handler: "subscription", toolName: "openxe-upload-file" },

  // === Zeiterfassung ===
  { action: "clock-status", label: "Stechuhr-Status abfragen (ein-/ausgestempelt)", category: "zeiterfassung", handler: "time", toolName: "openxe-clock-status" },
  { action: "clock-action", label: "Ein-/Ausstempeln (kommen/gehen/pausestart/pausestop)", category: "zeiterfassung", handler: "time", toolName: "openxe-clock-action" },
  { action: "clock-summary", label: "Wochen-Zeituebersicht (Soll/Ist, Ueberstunden, Urlaub)", category: "zeiterfassung", handler: "time", toolName: "openxe-clock-summary" },
  { action: "list-time-entries", label: "Zeiteintraege auflisten [+Smart Filter] (Filter: adresse, projekt, von, bis)", category: "zeiterfassung", handler: "time", toolName: "openxe-list-time-entries" },
  { action: "create-time-entry", label: "Zeiteintrag erstellen", category: "zeiterfassung", handler: "time", toolName: "openxe-create-time-entry" },
  { action: "edit-time-entry", label: "Zeiteintrag bearbeiten", category: "zeiterfassung", handler: "time", toolName: "openxe-edit-time-entry" },
  { action: "delete-time-entry", label: "Zeiteintrag loeschen", category: "zeiterfassung", handler: "time", toolName: "openxe-delete-time-entry" },

  // === Business Queries ===
  ...Object.entries(BUSINESS_PRESETS).map(([key, preset]) => ({
    action: `bq-${key}`,
    label: preset.description,
    category: "business" as Category,
    handler: "business-query" as const,
    toolName: "openxe-business-query",
  })),

  // === System ===
  { action: "server-time", label: "Serverzeit abrufen", category: "system", handler: "subscription", toolName: "openxe-server-time" },

  // === Dashboard ===
  { action: "dashboard", label: "KPI abrufen (umsatz-monat, umsatz-jahr, offene-auftraege, offene-rechnungen, ueberfaellige-rechnungen, top-kunde, auftragseingang-woche, artikel-anzahl, kunden-anzahl, offene-bestellungen, bestellvolumen-monat)", category: "dashboard", handler: "dashboard", toolName: "openxe-dashboard" },
];

// Build lookup map
const ACTION_MAP = new Map<string, ActionEntry>();
for (const entry of ACTION_REGISTRY) {
  ACTION_MAP.set(entry.action, entry);
}

// --- Discover Tool ---

const DiscoverInput = z.object({
  category: z
    .enum(["stammdaten", "belege", "beschaffung", "business", "shop", "zeiterfassung", "system", "dashboard", "alle"])
    .optional()
    .default("alle")
    .describe("Kategorie-Filter (default: alle)"),
});

export const DISCOVER_TOOL_DEFINITION: ToolDefinition = {
  name: "openxe-discover",
  description:
    "Zeigt alle verfuegbaren OpenXE-Aktionen. IMMER ZUERST AUFRUFEN wenn du nicht weisst welche Aktionen es gibt. Optional: category='stammdaten'/'belege'/'beschaffung'/'zeiterfassung'/'dashboard'/'alle'",
  inputSchema: zodToJsonSchema(DiscoverInput) as Record<string, unknown>,
};

const CATEGORY_LABELS: Record<Category, string> = {
  stammdaten: "Stammdaten",
  belege: "Belege",
  beschaffung: "Beschaffung (Einkauf)",
  business: "Business Queries",
  shop: "Shop / CRM / Sonstiges",
  zeiterfassung: "Zeiterfassung",
  system: "System",
  dashboard: "Dashboard",
};

const CATEGORY_ORDER: Category[] = ["stammdaten", "belege", "beschaffung", "business", "shop", "zeiterfassung", "system", "dashboard"];

export function handleDiscover(args: Record<string, unknown>): ToolResult {
  const { category } = DiscoverInput.parse(args);
  const categories = category === "alle" ? CATEGORY_ORDER : [category as Category];

  const lines: string[] = [];

  // Smart Filter documentation (shown at top for "alle" or when list categories are included)
  if (category === "alle" || ["stammdaten", "belege", "beschaffung"].includes(category as string)) {
    lines.push("=== Smart Filter (verfuegbar auf allen list-* Aktionen) ===");
    lines.push('where         Client-seitige Filter: {plz: {startsWith: "2"}}, {email: {empty: true}}, {name: {contains: "Mueller"}}');
    lines.push("              Operatoren: equals, contains, startsWith, endsWith, gt, lt, gte, lte, range, empty, notEmpty");
    lines.push('fields        Nur bestimmte Felder: ["kundennummer", "name", "plz"]');
    lines.push('sort_field    Sortieren nach Feld (z.B. "gesamtsumme", "datum", "name")');
    lines.push('sort_order    "asc" oder "desc"');
    lines.push("limit         Max. Ergebnisse (z.B. 10 fuer Top-10)");
    lines.push("format        Ausgabeformat: json, table, csv, ids");
    lines.push('zeitraum      Datum-Shortcut: "heute", "diese-woche", "letzter-monat", "oktober-2025", "Q3-2025", "2025"');
    lines.push('status_preset Status-Filter: "offen", "unbezahlt", "ueberfaellig", "bezahlt", "entwurf", "mahnkandidaten"');
    lines.push('aggregate     Aggregation: "count", {sum: "gesamtsumme"}, {groupBy: "land", count: true}');
    lines.push("");
  }

  for (const cat of categories) {
    const entries = ACTION_REGISTRY.filter((e) => e.category === cat);
    if (entries.length === 0) continue;

    lines.push(`=== ${CATEGORY_LABELS[cat]} ===`);
    for (const entry of entries) {
      const padded = entry.action.padEnd(26);
      lines.push(`${padded}${entry.label}`);
    }
    lines.push("");
  }

  lines.push("Nutze openxe mit action=<name> und params={...} um eine Aktion auszufuehren.");

  if (category === "alle") {
    lines.push("");
    lines.push("=== Beispiel-Workflows ===");
    lines.push('Kunden suchen: openxe action=list-addresses params={where:{name:{contains:"Mueller"}}}');
    lines.push('Top 5 Auftraege: openxe action=list-orders params={sort_field:"gesamtsumme",sort_order:"desc",limit:5}');
    lines.push('Umsatz diesen Monat: openxe action=dashboard params={kpi:"umsatz-monat"}');
    lines.push('Unbezahlte Rechnungen: openxe action=business-query params={preset:"offene-rechnungen"}');
  }

  return {
    content: [{ type: "text", text: lines.join("\n") }],
  };
}

// --- Router Tool ---

const RouterInput = z.object({
  action: z
    .string()
    .describe('Aktion (z.B. "list-orders", "get-address", "create-order"). Nutze openxe-discover um verfuegbare Aktionen zu sehen.'),
  params: z
    .record(z.unknown())
    .optional()
    .default({})
    .describe("Aktionsspezifische Parameter (optional)"),
});

export const ROUTER_TOOL_DEFINITION: ToolDefinition = {
  name: "openxe",
  description:
    "Fuehrt eine OpenXE-Aktion aus. Nutze zuerst openxe-discover um verfuegbare Aktionen zu sehen. Beispiele: {action:'list-orders', params:{status_preset:'offen'}} oder {action:'dashboard', params:{kpi:'umsatz-monat'}}",
  inputSchema: zodToJsonSchema(RouterInput) as Record<string, unknown>,
};

export async function handleRouter(
  args: Record<string, unknown>,
  client: OpenXEClient
): Promise<ToolResult> {
  const { action, params } = RouterInput.parse(args);

  const entry = ACTION_MAP.get(action);
  if (!entry) {
    const available = ACTION_REGISTRY.map((e) => e.action).join(", ");
    return {
      content: [
        {
          type: "text",
          text: `Unbekannte Aktion: "${action}". Verfuegbare Aktionen: ${available}`,
        },
      ],
      isError: true,
    };
  }

  // Dispatch to the appropriate handler
  switch (entry.handler) {
    case "read":
      return handleReadTool(entry.toolName, params, client);
    case "document-read":
      return handleDocumentReadTool(entry.toolName, params, client);
    case "document":
      return handleDocumentTool(entry.toolName, params, client);
    case "address":
      return handleAddressTool(entry.toolName, params, client);
    case "subscription":
      return handleSubscriptionTool(entry.toolName, params, client);
    case "time":
      return handleTimeTool(entry.toolName, params, client);
    case "business-query":
      return handleBusinessQueryTool({ preset: action.replace(/^bq-/, ""), ...params }, client);
    case "batch-pdf":
      return handleBatchPDFTool(entry.toolName, params, client);
    case "dashboard":
      return handleDashboardTool(entry.toolName, params, client);
    case "procurement":
      return handleProcurementTool(entry.toolName, params, client);
    default:
      return {
        content: [{ type: "text", text: `Internal error: unknown handler "${entry.handler}"` }],
        isError: true,
      };
  }
}

// Exported for testing
export { ACTION_REGISTRY, ACTION_MAP, CATEGORY_ORDER, CATEGORY_LABELS };
export type { ActionEntry, Category };
