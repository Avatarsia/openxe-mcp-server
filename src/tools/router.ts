import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { OpenXEClient } from "../client/openxe-client.js";
import { handleReadTool } from "./read-tools.js";
import { handleDocumentReadTool } from "./document-read-tools.js";
import { handleDocumentTool } from "./document-tools.js";
import { handleAddressTool } from "./address-tools.js";
import { handleSubscriptionTool } from "./subscription-tools.js";

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

type Category = "stammdaten" | "belege" | "shop" | "system";

interface ActionEntry {
  action: string;
  label: string;
  category: Category;
  handler: "read" | "document-read" | "document" | "address" | "subscription";
  toolName: string; // original openxe-* tool name
}

const ACTION_REGISTRY: ActionEntry[] = [
  // === Stammdaten ===
  { action: "list-addresses", label: "Kunden/Adressen auflisten (Filter: kundennummer, name, land)", category: "stammdaten", handler: "read", toolName: "openxe-list-addresses" },
  { action: "get-address", label: "Adresse nach ID abrufen (alle Details)", category: "stammdaten", handler: "read", toolName: "openxe-get-address" },
  { action: "list-articles", label: "Artikel auflisten (Filter: nummer, name_de; Include: verkaufspreise, lagerbestand)", category: "stammdaten", handler: "read", toolName: "openxe-list-articles" },
  { action: "get-article", label: "Artikel nach ID (alle Details + Preise + Lager)", category: "stammdaten", handler: "read", toolName: "openxe-get-article" },
  { action: "create-address", label: "Neuen Kunden anlegen (kundennummer=NEU fuer Autovergabe)", category: "stammdaten", handler: "address", toolName: "openxe-create-address" },
  { action: "edit-address", label: "Adresse bearbeiten", category: "stammdaten", handler: "address", toolName: "openxe-edit-address" },
  { action: "create-delivery-address", label: "Lieferadresse anlegen", category: "stammdaten", handler: "address", toolName: "openxe-create-delivery-address" },
  { action: "edit-delivery-address", label: "Lieferadresse bearbeiten", category: "stammdaten", handler: "address", toolName: "openxe-edit-delivery-address" },
  { action: "delete-delivery-address", label: "Lieferadresse loeschen", category: "stammdaten", handler: "address", toolName: "openxe-delete-delivery-address" },
  { action: "list-categories", label: "Artikelkategorien", category: "stammdaten", handler: "read", toolName: "openxe-list-categories" },
  { action: "list-shipping", label: "Versandarten", category: "stammdaten", handler: "read", toolName: "openxe-list-shipping-methods" },
  { action: "list-files", label: "Dateien/Anhaenge auflisten", category: "stammdaten", handler: "read", toolName: "openxe-list-files" },

  // === Belege ===
  { action: "list-orders", label: "Auftraege auflisten (Filter: belegnr, kundennummer, status, datum)", category: "belege", handler: "document-read", toolName: "openxe-list-orders" },
  { action: "get-order", label: "Auftrag nach ID (mit Positionen)", category: "belege", handler: "document-read", toolName: "openxe-get-order" },
  { action: "list-invoices", label: "Rechnungen auflisten", category: "belege", handler: "document-read", toolName: "openxe-list-invoices" },
  { action: "get-invoice", label: "Rechnung nach ID (mit Positionen)", category: "belege", handler: "document-read", toolName: "openxe-get-invoice" },
  { action: "list-quotes", label: "Angebote auflisten", category: "belege", handler: "document-read", toolName: "openxe-list-quotes" },
  { action: "get-quote", label: "Angebot nach ID", category: "belege", handler: "document-read", toolName: "openxe-get-quote" },
  { action: "list-delivery-notes", label: "Lieferscheine auflisten", category: "belege", handler: "document-read", toolName: "openxe-list-delivery-notes" },
  { action: "get-delivery-note", label: "Lieferschein nach ID", category: "belege", handler: "document-read", toolName: "openxe-get-delivery-note" },
  { action: "list-credit-memos", label: "Gutschriften auflisten", category: "belege", handler: "document-read", toolName: "openxe-list-credit-memos" },
  { action: "get-credit-memo", label: "Gutschrift nach ID", category: "belege", handler: "document-read", toolName: "openxe-get-credit-memo" },
  { action: "create-order", label: "Neuen Auftrag erstellen", category: "belege", handler: "document", toolName: "openxe-create-order" },
  { action: "create-quote", label: "Neues Angebot erstellen", category: "belege", handler: "document", toolName: "openxe-create-quote" },
  { action: "create-invoice", label: "Neue Rechnung erstellen", category: "belege", handler: "document", toolName: "openxe-create-invoice" },
  { action: "create-credit-note", label: "Gutschrift erstellen", category: "belege", handler: "document", toolName: "openxe-create-credit-note" },
  { action: "convert-quote-to-order", label: "Angebot zu Auftrag weiterfuehren", category: "belege", handler: "document", toolName: "openxe-convert-quote-to-order" },
  { action: "convert-to-invoice", label: "Auftrag zu Rechnung weiterfuehren", category: "belege", handler: "document", toolName: "openxe-convert-order-to-invoice" },
  { action: "release-order", label: "Auftrag freigeben", category: "belege", handler: "document", toolName: "openxe-release-order" },
  { action: "release-invoice", label: "Rechnung freigeben", category: "belege", handler: "document", toolName: "openxe-release-invoice" },
  { action: "mark-invoice-paid", label: "Rechnung als bezahlt markieren", category: "belege", handler: "document", toolName: "openxe-mark-invoice-paid" },
  { action: "delete-draft-invoice", label: "Entwurfs-Rechnung loeschen", category: "belege", handler: "document", toolName: "openxe-delete-draft-invoice" },
  { action: "get-document-pdf", label: "PDF eines Belegs abrufen (typ + id)", category: "belege", handler: "document", toolName: "openxe-get-document-pdf" },

  // === Shop / Sonstiges ===
  { action: "create-subscription", label: "Abo-Artikel anlegen", category: "shop", handler: "subscription", toolName: "openxe-create-subscription" },
  { action: "edit-subscription", label: "Abo-Artikel bearbeiten", category: "shop", handler: "subscription", toolName: "openxe-edit-subscription" },
  { action: "delete-subscription", label: "Abo-Artikel kuendigen", category: "shop", handler: "subscription", toolName: "openxe-delete-subscription" },
  { action: "create-crm-document", label: "CRM-Dokument anlegen (Notiz/Email/Telefonat)", category: "shop", handler: "subscription", toolName: "openxe-create-crm-document" },
  { action: "create-tracking", label: "Trackingnummer anlegen", category: "shop", handler: "subscription", toolName: "openxe-create-tracking" },
  { action: "create-resubmission", label: "Wiedervorlage/Aufgabe anlegen", category: "shop", handler: "subscription", toolName: "openxe-create-resubmission" },
  { action: "upload-file", label: "Datei hochladen (an Objekt anhaengen)", category: "shop", handler: "subscription", toolName: "openxe-upload-file" },

  // === System ===
  { action: "server-time", label: "Serverzeit abrufen", category: "system", handler: "subscription", toolName: "openxe-server-time" },
];

// Build lookup map
const ACTION_MAP = new Map<string, ActionEntry>();
for (const entry of ACTION_REGISTRY) {
  ACTION_MAP.set(entry.action, entry);
}

// --- Discover Tool ---

const DiscoverInput = z.object({
  category: z
    .enum(["stammdaten", "belege", "shop", "system", "alle"])
    .optional()
    .default("alle")
    .describe("Kategorie-Filter (default: alle)"),
});

export const DISCOVER_TOOL_DEFINITION: ToolDefinition = {
  name: "openxe-discover",
  description:
    "Zeigt alle verfuegbaren OpenXE-Aktionen. Rufe dieses Tool zuerst auf um zu sehen was moeglich ist. Optional: category filter (stammdaten, belege, shop, system).",
  inputSchema: zodToJsonSchema(DiscoverInput) as Record<string, unknown>,
};

const CATEGORY_LABELS: Record<Category, string> = {
  stammdaten: "Stammdaten",
  belege: "Belege",
  shop: "Shop / CRM / Sonstiges",
  system: "System",
};

const CATEGORY_ORDER: Category[] = ["stammdaten", "belege", "shop", "system"];

export function handleDiscover(args: Record<string, unknown>): ToolResult {
  const { category } = DiscoverInput.parse(args);
  const categories = category === "alle" ? CATEGORY_ORDER : [category as Category];

  const lines: string[] = [];

  for (const cat of categories) {
    const entries = ACTION_REGISTRY.filter((e) => e.category === cat);
    if (entries.length === 0) continue;

    lines.push(`=== ${CATEGORY_LABELS[cat]} ===`);
    for (const entry of entries) {
      const padded = entry.action.padEnd(24);
      lines.push(`${padded}${entry.label}`);
    }
    lines.push("");
  }

  lines.push("Nutze openxe mit action=<name> und params={...} um eine Aktion auszufuehren.");

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
    "Fuehrt eine OpenXE-Aktion aus. Nutze openxe-discover um verfuegbare Aktionen zu sehen.",
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
