import { OpenXEClient, EndpointNotAvailableError } from "../client/openxe-client.js";

/**
 * Register MCP Resources for OpenXE articles (read-only via REST v1).
 *
 * Resources:
 * - openxe://artikel                  — list articles with filters
 * - openxe://artikel/{id}             — single article with optional includes
 * - openxe://artikelkategorien        — list article categories
 */

export interface ResourceContents {
  contents: Array<{ uri: string; mimeType: string; text: string }>;
}

/**
 * Handle article resource reads.
 * Returns null if the URI is not an article resource.
 */
export async function handleArticleResource(
  uri: string,
  client: OpenXEClient
): Promise<ResourceContents | null> {
  const parsed = new URL(uri);
  const path = parsed.hostname + parsed.pathname;
  const params = Object.fromEntries(parsed.searchParams);

  try {
    if (path.startsWith("artikel/") || path === "artikel") {
      const segments = path.split("/").filter(Boolean);
      if (segments.length === 1) {
        // List articles: openxe://artikel?name_de=Filament&include=verkaufspreise,lagerbestand
        // NOTE: prices are NOT in the base response — use include=verkaufspreise
        // NOTE: there is no "aktiv" field — use "inaktiv" (inverted logic)
        const result = await client.get("/v1/artikel", params);
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(
                { data: result.data, pagination: result.pagination },
                null,
                2
              ),
            },
          ],
        };
      } else {
        // Single article: openxe://artikel/42?include=verkaufspreise,lagerbestand
        const id = segments[1];
        const { include, ...rest } = params;
        const queryParams: Record<string, string> = { ...rest };
        if (include) {
          queryParams.include = include;
        }
        const result = await client.get(`/v1/artikel/${id}`, queryParams);
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(result.data, null, 2),
            },
          ],
        };
      }
    }

    if (path.startsWith("artikelkategorien")) {
      const segments = path.split("/").filter(Boolean);
      if (segments.length === 1) {
        const result = await client.get("/v1/artikelkategorien", params);
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(
                { data: result.data, pagination: result.pagination },
                null,
                2
              ),
            },
          ],
        };
      } else {
        const id = segments[1];
        const result = await client.get(`/v1/artikelkategorien/${id}`);
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(result.data, null, 2),
            },
          ],
        };
      }
    }
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
      };
    }
    throw err;
  }

  return null;
}
