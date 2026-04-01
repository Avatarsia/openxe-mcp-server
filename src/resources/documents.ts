import { OpenXEClient, EndpointNotAvailableError } from "../client/openxe-client.js";

const DOCUMENT_TYPES = [
  {
    key: "angebote",
    path: "/v1/belege/angebote",
    name: "Quotes (Angebote)",
    description:
      "List quotes. Filters: filter[status], filter[belegnr], filter[kundennummer], filter[datum_gte], filter[datum_lte], filter[projekt]. Sort: belegnr, datum. Include: positionen, protokoll",
  },
  {
    key: "auftraege",
    path: "/v1/belege/auftraege",
    name: "Sales Orders (Auftraege)",
    description:
      "List sales orders. Additional filters: filter[internet], filter[angebotid]. BUG: complex filters may cause SQL errors due to selectIdsQuery alias bug",
  },
  {
    key: "rechnungen",
    path: "/v1/belege/rechnungen",
    name: "Invoices (Rechnungen)",
    description:
      "List invoices. Additional filters: filter[auftragid]. Include: positionen, protokoll",
  },
  {
    key: "lieferscheine",
    path: "/v1/belege/lieferscheine",
    name: "Delivery Notes (Lieferscheine)",
    description:
      "List delivery notes. filter[auftrag] does smart belegnr-to-id resolution. Include: positionen, protokoll",
  },
  {
    key: "gutschriften",
    path: "/v1/belege/gutschriften",
    name: "Credit Memos (Gutschriften)",
    description:
      "List credit memos. Additional filter: filter[rechnungid]. Include: positionen, protokoll",
  },
] as const;

/**
 * Get resource definitions for all document types.
 */
export function getDocumentResourceDefinitions() {
  return DOCUMENT_TYPES.map((dt) => ({
    uri: `openxe://belege/${dt.key}`,
    name: `OpenXE ${dt.name}`,
    description: dt.description,
    mimeType: "application/json",
  }));
}

/**
 * Handle document resource reads.
 * URI patterns:
 * - openxe://belege/angebote?filter[status]=freigegeben&include=positionen
 * - openxe://belege/auftraege/42?include=positionen,protokoll
 * - openxe://belege/rechnungen
 * - etc.
 */
export async function handleDocumentResource(
  uri: string,
  client: OpenXEClient
): Promise<{
  contents: Array<{ uri: string; mimeType: string; text: string }>;
} | null> {
  const parsed = new URL(uri);
  const fullPath = parsed.hostname + parsed.pathname;

  // Must start with belege/
  if (!fullPath.startsWith("belege/")) return null;

  const afterBelege = fullPath.slice("belege/".length);
  const segments = afterBelege.split("/").filter(Boolean);
  if (segments.length === 0) return null;

  const docTypeKey = segments[0];
  const docType = DOCUMENT_TYPES.find((dt) => dt.key === docTypeKey);
  if (!docType) return null;

  // Build query params, preserving filter[...] syntax
  const params: Record<string, string> = {};
  for (const [key, value] of parsed.searchParams) {
    params[key] = value;
  }

  try {
    if (segments.length === 1) {
      // List
      const result = await client.get(docType.path, params);
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
      // Single document: openxe://belege/auftraege/42
      const id = segments[1];
      const result = await client.get(`${docType.path}/${id}`, params);
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
