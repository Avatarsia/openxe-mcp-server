#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type {
  ServerResult,
} from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { loadConfig } from "./config.js";
import { OpenXEClient, EndpointNotAvailableError } from "./client/openxe-client.js";
import { handleArticleResource } from "./resources/articles.js";
import {
  getDocumentResourceDefinitions,
  handleDocumentResource,
} from "./resources/documents.js";
import {
  getMasterDataResourceDefinitions,
  handleMasterDataResource,
} from "./resources/master-data.js";
import {
  getInventoryResourceDefinitions,
  handleInventoryResource,
} from "./resources/inventory.js";
import {
  ADDRESS_TOOL_DEFINITIONS,
  handleAddressTool,
} from "./tools/address-tools.js";
import {
  DOCUMENT_TOOL_DEFINITIONS,
  handleDocumentTool,
} from "./tools/document-tools.js";
import {
  DOCUMENT_READ_TOOL_DEFINITIONS,
  handleDocumentReadTool,
} from "./tools/document-read-tools.js";
import {
  SUBSCRIPTION_TOOL_DEFINITIONS,
  handleSubscriptionTool,
} from "./tools/subscription-tools.js";
import {
  TIME_TOOL_DEFINITIONS,
  handleTimeTool,
} from "./tools/time-tools.js";
import {
  READ_TOOL_DEFINITIONS,
  handleReadTool,
} from "./tools/read-tools.js";
import {
  DISCOVER_TOOL_DEFINITION,
  ROUTER_TOOL_DEFINITION,
  handleDiscover,
  handleRouter,
} from "./tools/router.js";
import {
  BUSINESS_QUERY_TOOL_DEFINITION,
  handleBusinessQueryTool,
} from "./tools/business-query-tools.js";
import {
  BATCH_PDF_TOOL_DEFINITION,
  handleBatchPDFTool,
} from "./tools/batch-pdf-tools.js";
import {
  DASHBOARD_TOOL_DEFINITIONS,
  handleDashboardTool,
} from "./tools/dashboard-tools.js";
import {
  PROCUREMENT_TOOL_DEFINITIONS,
  handleProcurementTool,
} from "./tools/procurement-tools.js";
import {
  REPORT_TOOL_DEFINITIONS,
  handleReportTool,
} from "./tools/report-tools.js";

// ---------------------------------------------------------------------------
// Audit logging (opt-in via OPENXE_AUDIT_LOG=1)
// ---------------------------------------------------------------------------
function auditLog(toolName: string, args: Record<string, unknown>): void {
  if (!process.env.OPENXE_AUDIT_LOG) return;
  const timestamp = new Date().toISOString();
  // Redact sensitive fields
  const safeArgs = { ...args };
  for (const key of Object.keys(safeArgs)) {
    if (/password|secret|token|key|iban|swift|paypal/i.test(key)) {
      safeArgs[key] = '[REDACTED]';
    }
  }
  console.error(`[AUDIT] ${timestamp} tool=${toolName} args=${JSON.stringify(safeArgs)}`);
}

async function main() {
  const config = loadConfig();
  const client = new OpenXEClient(config);

  const server = new Server(
    {
      name: "openxe-mcp-server",
      version: "0.1.0",
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
      instructions: [
        "Du bist mit einem OpenXE ERP-System verbunden. Hier sind die wichtigsten Regeln:",
        "",
        "## Erste Schritte",
        '- Rufe zuerst "openxe-discover" auf um alle verfuegbaren Aktionen zu sehen.',
        '- Nutze "openxe" mit action=<name> und params={...} um Aktionen auszufuehren.',
        "",
        "## Effiziente Abfragen",
        "- Listen geben standardmaessig nur Schluesselfelder zurueck (Slim Mode).",
        "- Fuer Details eines Eintrags nutze die get-* Aktionen mit der ID.",
        "- Nutze Smart Filter fuer gezielte Abfragen:",
        '  - where: {plz: {startsWith: "2"}, name: {contains: "Mueller"}}',
        '  - sort_field + sort_order: Sortierung (z.B. "gesamtsumme" + "desc")',
        "  - limit: Maximale Ergebnisse (z.B. 5 fuer Top-5)",
        '  - fields: Nur bestimmte Felder (z.B. ["name", "plz", "ort"])',
        '  - format: "table" fuer kompakte Darstellung, "csv" fuer Export',
        '  - zeitraum: "dieser-monat", "letzter-monat", "Q3-2025", "oktober-2025"',
        '  - status_preset: "offen", "unbezahlt", "ueberfaellig"',
        '  - aggregate: "count" oder {sum: "gesamtsumme"} oder {groupBy: "status"}',
        "",
        "## Workflows",
        '- Kunde anlegen: action=create-address, kundennummer="NEU" (System vergibt automatisch)',
        "- Auftrag erstellen: action=create-order mit artikelliste.position[{nummer, menge, preis}]",
        '  WICHTIG: Keine "bezeichnung" in Positionen — System holt sie aus dem Artikelstamm',
        "- Auftrag zu Rechnung: action=convert-to-invoice mit {id: AUFTRAGS_ID}",
        '- PDF abrufen: action=get-document-pdf mit {typ: "rechnung", id: ID}',
        "",
        "## Belege bearbeiten",
        "- edit-order / edit-invoice / edit-quote / edit-delivery-note / edit-credit-memo: Header-Felder nachtraeglich aendern (Positionen koennen nach Erstellung nicht geaendert werden)",
        "- Editierbare Felder: datum, zahlungsweise, versandart, freitext, internebezeichnung, lieferbedingung, projekt",
        "",
        "## Zeiterfassung",
        "- clock-status: Stechuhr-Status abfragen",
        "- clock-action: Ein-/Ausstempeln (cmd: kommen/gehen/pausestart/pausestop, adresse)",
        "- clock-summary: Wochenuebersicht mit Soll/Ist",
        "- list-time-entries: Zeiteintraege auflisten (adresse, projekt, von, bis)",
        "- create-time-entry: Zeiteintrag erstellen (adresse ODER mitarbeiternummer, aufgabe, von, bis)",
        "- edit-time-entry / delete-time-entry: Zeiteintrag bearbeiten/loeschen",
        "",
        "## Dashboard KPIs (11 Stueck)",
        "- umsatz-monat, umsatz-jahr: Fakturierter Umsatz",
        "- offene-auftraege: Anzahl + Summe nicht abgeschlossener Auftraege",
        "- offene-rechnungen: Anzahl + Summe unbezahlter Rechnungen",
        "- ueberfaellige-rechnungen: >30 Tage ueberfaellig",
        "- top-kunde: Kunde mit hoechstem Umsatz (Jahr)",
        "- auftragseingang-woche: Auftraege dieser Woche",
        "- artikel-anzahl, kunden-anzahl: Stammdaten-Zaehler",
        "- offene-bestellungen, bestellvolumen-monat: Beschaffungs-KPIs",
        "- Fuer Kennzahlen nutze action=dashboard mit kpi=<name>. Das spart Tokens gegenueber dem Laden ganzer Listen.",
        "",
        "## Beschaffung (Einkauf)",
        "- list-purchase-orders: Bestellungen auflisten (Status: offen -> freigegeben -> bestellt -> angemahnt -> empfangen)",
        "- get-purchase-order: Einzelbestellung mit Positionen",
        "- create-purchase-order: adresse (Lieferant-ID), positionen [{nummer, menge, preis}]",
        "- Bestellung editieren: edit-purchase-order (lieferdatum, einkaeufer, versandart, projekt)",
        "- release-purchase-order: Bestellung freigeben",
        "- get-article mit includeEinkaufspreise=true: Zeigt Einkaufspreise/Staffelpreise vom Lieferanten",
        "- Lieferanten finden: list-addresses mit where: {lieferantennummer: {notEmpty: true}}",
        "- Lieferanten anlegen: create-address mit rolle='Lieferant', ustid (lieferantennummer wird automatisch vergeben)",
        "",
        "## Berichte (Reports)",
        "- report-revenue: Umsatzbericht nach Kunde/Artikel/Monat/Quartal/Jahr/Projekt, mit Zeitraum-Filter und Marge",
        "- report-open-items: Offene-Posten-Liste (mode: liste/altersstruktur/kreditlimit)",
        "- report-stock: Lagerbestand (mode: uebersicht/nachbestellbedarf/lagerwert)",
        "- report-procurement: Beschaffung (mode: volumen-lieferant/offene-bestellungen)",
        "- report-period-comparison: Periodenvergleich (umsatz/auftragseingang/neukunden/rechnungen, monat/quartal/jahr)",
        "- Alle Berichte sind read-only und liefern formatierte Tabellen",
        "",
        "## Business Queries (vordefiniert)",
        '- action=business-query, params={preset: "nicht-versendet"} — Auftraege mit Status freigegeben (nicht versendet)',
        '- action=business-query, params={preset: "ohne-tracking"} — Lieferscheine ohne Sendungsnummer',
        '- action=business-query, params={preset: "offene-rechnungen"} — Unbezahlte Rechnungen',
        '- action=business-query, params={preset: "ueberfaellige-rechnungen"} — Rechnungen >30 Tage ueberfaellig',
        '- action=business-query, params={preset: "entwuerfe"} — Belege ohne Belegnummer (Entwuerfe)',
        '- action=business-query, params={preset: "offene-bestellungen"} — Aktive Bestellungen (offen/freigegeben/bestellt/angemahnt)',
        '- action=business-query, params={preset: "ueberfaellige-lieferungen"} — Bestellungen mit ueberschrittenem Lieferdatum',
        "",
        "## Adressen",
        "- Kunde anlegen: create-address mit kundennummer='NEU' (System vergibt automatisch)",
        "- Lieferant anlegen: create-address mit rolle='Lieferant', ustid (lieferantennummer wird automatisch vom System vergeben)",
        "- Kontaktfelder: telefon, telefax, mobil, email, internetseite, ansprechpartner, abteilung",
        "- Dokumentversand: angebot_email, auftrag_email, rechnungs_email, gutschrift_email, lieferschein_email, bestellung_email (Override-E-Mail pro Belegtyp)",
        "- CC-Kopien: angebot_cc, auftrag_cc, rechnung_cc, gutschrift_cc, lieferschein_cc, bestellung_cc",
        "- Rechnungsversand: rechnung_permail=1 (E-Mail erzwingen), rechnung_papier=1 (Papier), rechnung_anzahlpapier",
        "- Abweichende Rechnungsadresse: abweichende_rechnungsadresse=1 + rechnung_name/strasse/plz/ort/land",
        "- Bankdaten: iban, swift, inhaber, bank (einzelne Felder, KEIN verschachteltes Objekt)",
        "- Zahlungsziele: zahlungszieltage, zahlungszieltageskonto, zahlungszielskonto",
        "- Lieferant-Konditionen: zahlungsweiselieferant, zahlungszieltagelieferant, zahlungszieltageskontolieferant, zahlungszielskontolieferant",
        "- Lieferant-Versand: versandartlieferant, lieferbedingung, kundennummerlieferant, portofreilieferant_aktiv",
        "- Liefersperre: liefersperre=1, liefersperregrund, liefersperredatum",
        "- PayPal: paypal (E-Mail), paypalinhaber, paypalwaehrung",
        "- SEPA: mandatsreferenz, mandatsreferenzdatum, mandatsreferenzart, glaeubigeridentnr",
        "- Sonstiges: geburtstag (YYYY-MM-DD), rabatt (%), kennung, bundesland, infoauftragserfassung",
        "- WICHTIG: strasse (nicht straße), telefax (nicht fax), internetseite (nicht webseite/internet), anschreiben (nicht anrede — anrede existiert nicht als DB-Spalte!), typ fuer Herr/Frau/Firma",
        "- Lieferadressen separat anlegen: create-delivery-address mit adresse (Parent-ID)",
        "- Ansprechpartner ist ein Feld auf der Adresse, kein separates Objekt",
        "",
        "## Abonnements (Abo)",
        "- list-subscriptions: Abos auflisten mit Smart Filters (adresse, artikel, gruppe)",
        "- get-subscription: Einzelnes Abo mit Details",
        "- create-subscription: bezeichnung (Pflicht), adresse, artikel/artikelnummer, preisart (monat/jahr/wochen/einmalig), preis, menge",
        "- edit-subscription / delete-subscription: Abo bearbeiten/kuendigen",
        "",
        "## CRM / Tracking / Dateien",
        "- create-crm-document: CRM-Notiz erstellen (typ: email/brief/telefon/notiz, betreff, adresse_from)",
        "- create-tracking: Trackingnummer anlegen (tracking, lieferschein als Belegnummer-String, gewicht, anzahlpakete, versendet_am)",
        "- create-resubmission: Wiedervorlage erstellen (bezeichnung, datum_erinnerung, zeit_erinnerung, adresse)",
        "- upload-file: Datei hochladen (dateiname, titel, file_content als base64, objekt_typ, objekt_id)",
        "- list-files: Dateien auflisten",
        "",
        "## Stammdaten (Lesen)",
        "- list-categories: Artikelkategorien auflisten",
        "- list-shipping-methods: Versandarten auflisten",
        "- list-addresses / get-address: Adressen auflisten/abrufen",
        "- list-articles / get-article: Artikel auflisten/abrufen (include: verkaufspreise, lagerbestand, einkaufspreise)",
        "",
        "## Wichtige Regeln",
        "- Geloeschte Datensaetze (DEL) werden automatisch ausgeblendet.",
        "- Bei leeren Ergebnissen: schlage dem Nutzer alternative Filter vor.",
        "- Antworte in der Sprache des Nutzers.",
        "- Bei Fehlern: erklaere was schief ging und schlage eine Loesung vor.",
        "- Maximal 50 Ergebnisse pro Abfrage — nutze Filter zum Eingrenzen.",
        "- Fuer Batch-Operationen: action=batch-pdf, max 20 PDFs auf einmal.",
      ].join("\n"),
    }
  );

  // === List Resources ===
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        // Addresses
        {
          uri: "openxe://adressen",
          name: "OpenXE Addresses",
          description:
            "List addresses (customers, suppliers, employees). SERVER LIMITATION: Only ?kundennummer= filter works; all other filters (name, typ, land, etc.) and sort are silently ignored by AddressController. Pagination: ?items=N&page=N. Workaround: fetch all and filter client-side.",
          mimeType: "application/json",
        },
        {
          uri: "openxe://lieferadressen",
          name: "OpenXE Delivery Addresses",
          description:
            "List delivery addresses. Filters: adresse, name, land, standardlieferadresse.",
          mimeType: "application/json",
        },
        // Articles
        {
          uri: "openxe://artikel",
          name: "OpenXE Articles (READ-ONLY)",
          description:
            "List articles. Filters: typ, name_de, nummer, projekt, ausverkauft, topseller. Include: verkaufspreise, lagerbestand, dateien, projekt. NOTE: no preis/waehrung/aktiv fields; use include=verkaufspreise for prices, inaktiv field (inverted) for active status.",
          mimeType: "application/json",
        },
        {
          uri: "openxe://artikelkategorien",
          name: "OpenXE Article Categories",
          description:
            "List article categories. Filters: bezeichnung, projekt, parent.",
          mimeType: "application/json",
        },
        // Documents
        ...getDocumentResourceDefinitions(),
        // Master Data
        ...getMasterDataResourceDefinitions(),
        // Inventory & Other
        ...getInventoryResourceDefinitions(),
      ],
    };
  });

  // === Read Resource ===
  server.setRequestHandler(ReadResourceRequestSchema, async (request): Promise<ServerResult> => {
    const { uri } = request.params;

    // Try each resource handler in order
    const handlers = [
      handleArticleResource,
      handleDocumentResource,
      handleMasterDataResource,
      handleInventoryResource,
    ];

    // Handle addresses directly (they have custom logic)
    const parsed = new URL(uri);
    const path = parsed.hostname + parsed.pathname;
    const params = Object.fromEntries(parsed.searchParams);

    if (path.startsWith("adressen") || path.startsWith("lieferadressen")) {
      const resource = path.startsWith("lieferadressen")
        ? "lieferadressen"
        : "adressen";
      const segments = path.split("/").filter(Boolean);
      const apiPath =
        segments.length > 1
          ? `/v1/${resource}/${segments[1]}`
          : `/v1/${resource}`;

      try {
        const result = await client.get(apiPath, params);
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(
                segments.length > 1
                  ? result.data
                  : { data: result.data, pagination: result.pagination },
                null,
                2
              ),
            },
          ],
        } as ServerResult;
      } catch (err) {
        if (err instanceof EndpointNotAvailableError) {
          return {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify(
                  { error: err.message, available: false },
                  null,
                  2
                ),
              },
            ],
          } as ServerResult;
        }
        throw err;
      }
    }

    for (const handler of handlers) {
      const result = await handler(uri, client);
      if (result) return result as ServerResult;
    }

    throw new Error(`Unknown resource URI: ${uri}`);
  });

  // === List Tools ===
  const FULL_TOOLS = [
    ...ADDRESS_TOOL_DEFINITIONS,
    ...DOCUMENT_TOOL_DEFINITIONS,
    ...DOCUMENT_READ_TOOL_DEFINITIONS,
    ...SUBSCRIPTION_TOOL_DEFINITIONS,
    ...TIME_TOOL_DEFINITIONS,
    ...READ_TOOL_DEFINITIONS,
    ...DASHBOARD_TOOL_DEFINITIONS,
    ...PROCUREMENT_TOOL_DEFINITIONS,
    ...REPORT_TOOL_DEFINITIONS,
    BUSINESS_QUERY_TOOL_DEFINITION,
    BATCH_PDF_TOOL_DEFINITION,
  ];

  // Read-only mode: only read tools, document read tools, dashboard, reports, and business queries
  const READONLY_TOOLS = [
    ...READ_TOOL_DEFINITIONS,
    ...DOCUMENT_READ_TOOL_DEFINITIONS,
    ...DASHBOARD_TOOL_DEFINITIONS,
    ...REPORT_TOOL_DEFINITIONS,
    BUSINESS_QUERY_TOOL_DEFINITION,
  ];

  const ROUTER_TOOLS = [
    DISCOVER_TOOL_DEFINITION,
    ROUTER_TOOL_DEFINITION,
  ];

  const ALL_TOOLS = config.mode === "router"
    ? ROUTER_TOOLS
    : config.mode === "readonly"
      ? READONLY_TOOLS
      : FULL_TOOLS;

  if (config.mode === "readonly") {
    console.error("[INFO] Running in read-only mode \u2014 write operations disabled");
  }
  console.error(`OpenXE MCP Server mode: ${config.mode} (${ALL_TOOLS.length} tools registered)`);

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: ALL_TOOLS };
  });

  // === Call Tool ===
  const addressToolNames = new Set(
    ADDRESS_TOOL_DEFINITIONS.map((t) => t.name)
  );
  const documentToolNames = new Set(
    DOCUMENT_TOOL_DEFINITIONS.map((t) => t.name)
  );
  const documentReadToolNames = new Set(
    DOCUMENT_READ_TOOL_DEFINITIONS.map((t) => t.name)
  );
  const subscriptionToolNames = new Set(
    SUBSCRIPTION_TOOL_DEFINITIONS.map((t) => t.name)
  );
  const timeToolNames = new Set(
    TIME_TOOL_DEFINITIONS.map((t) => t.name)
  );
  const dashboardToolNames = new Set(
    DASHBOARD_TOOL_DEFINITIONS.map((t: { name: string }) => t.name)
  );
  const readToolNames = new Set(
    READ_TOOL_DEFINITIONS.map((t) => t.name)
  );
  const procurementToolNames = new Set(
    PROCUREMENT_TOOL_DEFINITIONS.map((t: { name: string }) => t.name)
  );
  const reportToolNames = new Set(
    REPORT_TOOL_DEFINITIONS.map((t: { name: string }) => t.name)
  );

  // Build a set of tool names allowed in readonly mode for fast lookup
  const readonlyToolNames = new Set(READONLY_TOOLS.map((t) => t.name));

  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<ServerResult> => {
    const { name, arguments: args } = request.params;
    const toolArgs = (args ?? {}) as Record<string, unknown>;

    auditLog(name, toolArgs);

    // In readonly mode, reject any tool not in the readonly set
    if (config.mode === "readonly" && !readonlyToolNames.has(name)) {
      return {
        content: [{ type: "text" as const, text: `Blocked: "${name}" is a write operation and this server runs in read-only mode (OPENXE_MODE=readonly). Only read operations are available.` }],
        isError: true,
      } as ServerResult;
    }

    // Router mode tools
    if (name === "openxe-discover") {
      return handleDiscover(toolArgs) as ServerResult;
    }
    if (name === "openxe") {
      return handleRouter(toolArgs, client) as Promise<ServerResult>;
    }

    // Full mode tools (also reachable internally via router)
    if (addressToolNames.has(name)) {
      return handleAddressTool(name, toolArgs, client) as Promise<ServerResult>;
    }
    if (documentReadToolNames.has(name)) {
      return handleDocumentReadTool(name, toolArgs, client) as Promise<ServerResult>;
    }
    if (documentToolNames.has(name)) {
      return handleDocumentTool(name, toolArgs, client) as Promise<ServerResult>;
    }
    if (subscriptionToolNames.has(name)) {
      return handleSubscriptionTool(name, toolArgs, client) as Promise<ServerResult>;
    }
    if (timeToolNames.has(name)) {
      return handleTimeTool(name, toolArgs, client) as Promise<ServerResult>;
    }
    if (readToolNames.has(name)) {
      return handleReadTool(name, toolArgs, client) as Promise<ServerResult>;
    }
    if (dashboardToolNames.has(name)) {
      return handleDashboardTool(name, toolArgs, client) as Promise<ServerResult>;
    }
    if (procurementToolNames.has(name)) {
      return handleProcurementTool(name, toolArgs, client) as Promise<ServerResult>;
    }
    if (reportToolNames.has(name)) {
      return handleReportTool(name, toolArgs, client) as Promise<ServerResult>;
    }
    if (name === "openxe-business-query") {
      return handleBusinessQueryTool(toolArgs, client) as Promise<ServerResult>;
    }
    if (name === "openxe-batch-pdf") {
      return handleBatchPDFTool(name, toolArgs, client) as Promise<ServerResult>;
    }

    return {
      content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
      isError: true,
    } as ServerResult;
  });

  // === Start Transport ===
  const transportArg = process.argv[2];

  if (transportArg === "--http") {
    // Streamable HTTP transport (for remote/networked usage)
    const { StreamableHTTPServerTransport } = await import(
      "@modelcontextprotocol/sdk/server/streamableHttp.js"
    );
    const http = await import("node:http");

    const port = parseInt(process.env.PORT ?? "3100", 10);
    const host = process.env.MCP_HTTP_HOST || "127.0.0.1";
    const authToken = process.env.MCP_AUTH_TOKEN;

    if (authToken) {
      console.error("[INFO] HTTP auth enabled \u2014 Bearer token required for all requests");
    }

    const httpServer = http.createServer(async (req, res) => {
      if (req.url === "/mcp" && req.method === "POST") {
        // Check auth if token is configured
        if (authToken) {
          const provided = req.headers.authorization;
          if (!provided || provided !== `Bearer ${authToken}`) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Unauthorized \u2014 set Authorization: Bearer <MCP_AUTH_TOKEN>" }));
            return;
          }
        }

        // DNS rebinding protection: validate Origin header
        const allowedOrigins = process.env.MCP_ALLOWED_ORIGINS?.split(',').map(o => o.trim());
        if (allowedOrigins && allowedOrigins.length > 0) {
          const origin = req.headers.origin || req.headers.referer;
          if (!origin || !allowedOrigins.some(allowed => (origin as string).startsWith(allowed))) {
            res.writeHead(403, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Forbidden \u2014 Origin not allowed. Set MCP_ALLOWED_ORIGINS." }));
            return;
          }
        }

        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
        });
        await server.connect(transport);
        await transport.handleRequest(req, res);
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    httpServer.listen(port, host, () => {
      console.error(
        `OpenXE MCP Server listening on http://${host}:${port}/mcp`
      );
    });
  } else {
    // Default: stdio transport (for Claude Desktop, CLI tools)
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("OpenXE MCP Server running on stdio");
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
