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
  SUBSCRIPTION_TOOL_DEFINITIONS,
  handleSubscriptionTool,
} from "./tools/subscription-tools.js";

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
  const ALL_TOOLS = [
    ...ADDRESS_TOOL_DEFINITIONS,
    ...DOCUMENT_TOOL_DEFINITIONS,
    ...SUBSCRIPTION_TOOL_DEFINITIONS,
  ];

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
  const subscriptionToolNames = new Set(
    SUBSCRIPTION_TOOL_DEFINITIONS.map((t) => t.name)
  );

  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<ServerResult> => {
    const { name, arguments: args } = request.params;
    const toolArgs = (args ?? {}) as Record<string, unknown>;

    if (addressToolNames.has(name)) {
      return handleAddressTool(name, toolArgs, client) as Promise<ServerResult>;
    }
    if (documentToolNames.has(name)) {
      return handleDocumentTool(name, toolArgs, client) as Promise<ServerResult>;
    }
    if (subscriptionToolNames.has(name)) {
      return handleSubscriptionTool(name, toolArgs, client) as Promise<ServerResult>;
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

    const httpServer = http.createServer(async (req, res) => {
      if (req.url === "/mcp" && req.method === "POST") {
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

    httpServer.listen(port, () => {
      console.error(
        `OpenXE MCP Server listening on http://0.0.0.0:${port}/mcp`
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
