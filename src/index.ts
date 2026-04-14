#!/usr/bin/env node

import "dotenv/config";
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
  forgetDiscoverCallLog,
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

// ---------------------------------------------------------------------------
// Mode-specific instructions
// ---------------------------------------------------------------------------
// Kept deliberately short. Tool-specific rules (parameter names, field-name
// quirks, workflow ordering) belong in each tool's `description`, not here.
// Official Anthropic example servers use empty `instructions` entirely; we
// keep a brief server-wide context block as guidance for small local LLMs.
function buildInstructions(mode: "router" | "full" | "readonly"): string {
  if (mode === "router") {
    return [
      "OpenXE ERP connector — router mode. Two meta-tools expose ~69 ERP operations.",
      "",
      "Workflow: first call `openxe-discover` to find the right action, then call `openxe` with {action, params}.",
      "",
      "Core rules:",
      "- Never pass kundennummer or lieferantennummer on create-address — the ERP assigns them.",
      "- For create-order / create-quote / create-invoice / create-credit-note: pass only `adresse` (numeric customer ID). kundennummer is auto-resolved. Positions: [{nummer, menge, preis}] — no `bezeichnung`.",
      "- Date format: YYYY-MM-DD. Amounts: decimal with dot.",
      "- On empty results, suggest alternative filters instead of retrying blindly.",
      "- Reply in the user's language.",
    ].join("\n");
  }
  if (mode === "readonly") {
    return [
      "OpenXE ERP connector — read-only mode. All write operations are disabled.",
      "Use list-*/get-*/dashboard/report-*/business-query tools. Each tool description contains its parameters and constraints.",
    ].join("\n");
  }
  // full mode
  return [
    "OpenXE ERP connector — full mode (~69 tools).",
    "Each tool description contains its exact parameters, required fields, and gotchas. Read descriptions before guessing.",
    "Server-wide rules: dates YYYY-MM-DD, amounts decimal with dot. Never pass kundennummer/lieferantennummer (ERP assigns them). No `bezeichnung` on Beleg positions.",
  ].join("\n");
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
      instructions: buildInstructions(config.mode),
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

  server.setRequestHandler(CallToolRequestSchema, async (request, extra): Promise<ServerResult> => {
    const { name, arguments: args } = request.params;
    const toolArgs = (args ?? {}) as Record<string, unknown>;
    const sessionId = extra?.sessionId;

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
      return handleDiscover(toolArgs, sessionId) as ServerResult;
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
    // Streamable HTTP transport (for remote / LAN usage).
    //
    // Session-managed per the canonical pattern in
    // modelcontextprotocol/servers/everything/streamableHttp.ts:
    //  - POST /mcp without Mcp-Session-Id + isInitializeRequest(body) → new
    //    transport, server.connect() once, transport.sessionId stored in Map
    //  - POST/GET/DELETE /mcp with Mcp-Session-Id → reuse stored transport
    //  - SDK's handleRequest() handles the SSE open/stream/close lifecycle;
    //    onclose (triggered on DELETE or stream teardown) removes from Map
    //  - Idle sessions are evicted after IDLE_TIMEOUT_MS; SDK does not GC.
    const { StreamableHTTPServerTransport } = await import(
      "@modelcontextprotocol/sdk/server/streamableHttp.js"
    );
    const { isInitializeRequest } = await import(
      "@modelcontextprotocol/sdk/types.js"
    );
    const http = await import("node:http");

    const port = parseInt(process.env.PORT ?? "3100", 10);
    const host = process.env.MCP_HTTP_HOST || "127.0.0.1";
    const authToken = process.env.MCP_AUTH_TOKEN;

    if (authToken) {
      console.error("[INFO] HTTP auth enabled \u2014 Bearer token required for all requests");
    }

    // Per-session transport + last-access timestamp for idle eviction.
    const transports = new Map<string, InstanceType<typeof StreamableHTTPServerTransport>>();
    const lastAccess = new Map<string, number>();
    const IDLE_TIMEOUT_MS = 30 * 60_000; // 30 minutes
    const CLEANUP_INTERVAL_MS = 5 * 60_000; // sweep every 5 minutes

    const cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [sid, ts] of lastAccess) {
        if (now - ts > IDLE_TIMEOUT_MS) {
          const t = transports.get(sid);
          if (t) {
            t.close().catch(() => { /* ignore — transport may already be gone */ });
          }
          // onclose handler (below) removes from the maps when close() lands.
        }
      }
    }, CLEANUP_INTERVAL_MS);
    cleanupTimer.unref?.();

    // Read JSON body from Node's IncomingMessage — needed so we can run
    // isInitializeRequest() before dispatching to the transport.
    async function readJsonBody(req: import("node:http").IncomingMessage): Promise<unknown> {
      return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          if (!raw) return resolve(undefined);
          try { resolve(JSON.parse(raw)); }
          catch (err) { reject(err); }
        });
        req.on("error", reject);
      });
    }

    function sendJson(res: import("node:http").ServerResponse, status: number, body: unknown): void {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    }

    function checkAuth(req: import("node:http").IncomingMessage): boolean {
      if (!authToken) return true;
      return req.headers.authorization === `Bearer ${authToken}`;
    }

    function checkOrigin(req: import("node:http").IncomingMessage): boolean {
      const allowedOrigins = process.env.MCP_ALLOWED_ORIGINS?.split(",").map(o => o.trim());
      if (!allowedOrigins || allowedOrigins.length === 0) return true;
      const origin = req.headers.origin || req.headers.referer;
      if (!origin) return false;
      return allowedOrigins.some(allowed => (origin as string).startsWith(allowed));
    }

    const httpServer = http.createServer(async (req, res) => {
      if (req.url !== "/mcp") { res.writeHead(404); res.end("Not found"); return; }

      // Auth + DNS-rebinding protection apply to every method.
      if (!checkAuth(req)) {
        return sendJson(res, 401, { error: "Unauthorized — set Authorization: Bearer <MCP_AUTH_TOKEN>" });
      }
      if (!checkOrigin(req)) {
        return sendJson(res, 403, { error: "Forbidden — Origin not allowed. Set MCP_ALLOWED_ORIGINS." });
      }

      const sessionId = req.headers["mcp-session-id"] as string | undefined;

      try {
        if (req.method === "POST") {
          const body = await readJsonBody(req);

          let transport = sessionId ? transports.get(sessionId) : undefined;

          if (!transport) {
            // No session yet — must be an initialize request. Anything else
            // without a valid session is rejected per the MCP spec.
            if (!isInitializeRequest(body)) {
              return sendJson(res, 400, {
                error: "Bad Request — no valid Mcp-Session-Id and not an initialize request",
              });
            }

            transport = new StreamableHTTPServerTransport({
              sessionIdGenerator: () => crypto.randomUUID(),
              onsessioninitialized: (sid) => {
                transports.set(sid, transport!);
                lastAccess.set(sid, Date.now());
              },
            });
            transport.onclose = () => {
              const sid = transport!.sessionId;
              if (sid) {
                transports.delete(sid);
                lastAccess.delete(sid);
                forgetDiscoverCallLog(sid);
              }
            };

            // server.connect() is called exactly once per session.
            await server.connect(transport);
          } else {
            lastAccess.set(sessionId!, Date.now());
          }

          await transport.handleRequest(req, res, body);
          return;
        }

        if (req.method === "GET" || req.method === "DELETE") {
          if (!sessionId || !transports.has(sessionId)) {
            return sendJson(res, 400, { error: "Missing or unknown Mcp-Session-Id" });
          }
          lastAccess.set(sessionId, Date.now());
          await transports.get(sessionId)!.handleRequest(req, res);
          return;
        }

        res.writeHead(405, { Allow: "POST, GET, DELETE" });
        res.end();
      } catch (err) {
        console.error("[ERROR] /mcp handler:", err);
        if (!res.headersSent) {
          sendJson(res, 500, { error: "Internal server error" });
        } else {
          res.end();
        }
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
