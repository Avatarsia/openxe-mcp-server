import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { OpenXEClient } from "../client/openxe-client.js";

/**
 * Registers MCP resources for OpenXE address endpoints:
 *   - openxe://adressen         (list with pagination/filter params)
 *   - openxe://adressen/{id}    (single address)
 *   - openxe://lieferadressen         (list)
 *   - openxe://lieferadressen/{id}    (single delivery address)
 */
export function registerAddressResources(
  server: McpServer,
  client: OpenXEClient
): void {
  // -- Adressen (list) --
  server.registerResource(
    "adressen-list",
    "openxe://adressen",
    {
      description:
        "List all addresses from OpenXE. Supports pagination (?items=N&page=N) and ?kundennummer= lookup. SERVER LIMITATION: filter[name], filter[typ], sort, and other filters are silently ignored. Workaround: paginate all and filter client-side.",
      mimeType: "application/json",
    },
    async (_uri) => {
      const result = await client.get("/v1/adressen");
      return {
        contents: [
          {
            uri: "openxe://adressen",
            mimeType: "application/json",
            text: JSON.stringify(
              { data: result.data, pagination: result.pagination },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // -- Adressen (single by ID) --
  server.registerResource(
    "adressen-detail",
    new ResourceTemplate("openxe://adressen/{id}", {
      list: undefined,
    }),
    {
      description: "Read a single address by ID from OpenXE.",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const id = String(variables.id);
      const result = await client.get(`/v1/adressen/${id}`);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(result.data, null, 2),
          },
        ],
      };
    }
  );

  // -- Lieferadressen (list) --
  server.registerResource(
    "lieferadressen-list",
    "openxe://lieferadressen",
    {
      description:
        "List all delivery addresses from OpenXE. Supports pagination, filtering by adresse/name/land/standardlieferadresse, and sorting.",
      mimeType: "application/json",
    },
    async (_uri) => {
      const result = await client.get("/v1/lieferadressen");
      return {
        contents: [
          {
            uri: "openxe://lieferadressen",
            mimeType: "application/json",
            text: JSON.stringify(
              { data: result.data, pagination: result.pagination },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // -- Lieferadressen (single by ID) --
  server.registerResource(
    "lieferadressen-detail",
    new ResourceTemplate("openxe://lieferadressen/{id}", {
      list: undefined,
    }),
    {
      description: "Read a single delivery address by ID from OpenXE.",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const id = String(variables.id);
      const result = await client.get(`/v1/lieferadressen/${id}`);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(result.data, null, 2),
          },
        ],
      };
    }
  );
}
