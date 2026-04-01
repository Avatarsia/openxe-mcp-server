import { OpenXEClient, EndpointNotAvailableError } from "../client/openxe-client.js";

const MASTER_DATA_RESOURCES = [
  { key: "gruppen", path: "/v1/gruppen", name: "Groups" },
  { key: "eigenschaften", path: "/v1/eigenschaften", name: "Properties" },
  {
    key: "eigenschaftenwerte",
    path: "/v1/eigenschaftenwerte",
    name: "Property Values",
  },
  { key: "steuersaetze", path: "/v1/steuersaetze", name: "Tax Rates" },
  {
    key: "zahlungsweisen",
    path: "/v1/zahlungsweisen",
    name: "Payment Methods",
  },
  {
    key: "versandarten",
    path: "/v1/versandarten",
    name: "Shipping Methods",
  },
  { key: "laender", path: "/v1/laender", name: "Countries" },
  { key: "adresstyp", path: "/v1/adresstyp", name: "Address Types" },
] as const;

export function getMasterDataResourceDefinitions() {
  return MASTER_DATA_RESOURCES.map((r) => ({
    uri: `openxe://${r.key}`,
    name: `OpenXE ${r.name}`,
    description: `List ${r.name.toLowerCase()} from OpenXE`,
    mimeType: "application/json",
  }));
}

export async function handleMasterDataResource(
  uri: string,
  client: OpenXEClient
): Promise<{
  contents: Array<{ uri: string; mimeType: string; text: string }>;
} | null> {
  const parsed = new URL(uri);
  const fullPath = parsed.hostname + parsed.pathname;
  const params = Object.fromEntries(parsed.searchParams);

  for (const resource of MASTER_DATA_RESOURCES) {
    if (fullPath.startsWith(resource.key)) {
      const segments = fullPath.split("/").filter(Boolean);
      const apiPath =
        segments.length > 1
          ? `${resource.path}/${segments[1]}`
          : resource.path;

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
        };
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
    }
  }

  return null;
}
