/**
 * Slim-mode utilities for list endpoints.
 *
 * When full=false (default), list results are reduced to key fields
 * and capped at MAX_LIST_RESULTS to keep MCP responses concise.
 */

// --- Constants ---

export const MAX_LIST_RESULTS = 50;

/**
 * Key fields per entity type.  Only these columns are returned in slim mode.
 */
export const SLIM_FIELDS: Record<string, string[]> = {
  address: [
    "id", "typ", "kundennummer", "lieferantennummer",
    "name", "firma", "email", "telefon",
    "strasse", "plz", "ort", "land",
  ],
  article: [
    "id", "nummer", "name_de", "typ",
    "preis", "waehrung", "lagerbestand",
    "aktiv", "projekt",
  ],
  category: [
    "id", "bezeichnung", "parent", "projekt",
  ],
  shipping: [
    "id", "bezeichnung", "aktiv", "preis",
  ],
  file: [
    "id", "dateiname", "objekt", "parameter",
    "stichwort", "datum",
  ],
  order: [
    "id", "belegnr", "kundennummer", "name",
    "status", "datum", "gesamtsumme", "waehrung",
  ],
  invoice: [
    "id", "belegnr", "kundennummer", "name",
    "status", "datum", "soll", "waehrung",
  ],
};

// --- Functions ---

/**
 * Pick only the given fields from a record.
 */
export function pickFields(
  record: Record<string, unknown>,
  fields: string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of fields) {
    if (key in record) {
      result[key] = record[key];
    }
  }
  return result;
}

/**
 * Apply slim-mode field filtering to data.
 *
 * - If `fields` is undefined the data is returned unchanged.
 * - Arrays are mapped; plain objects are filtered directly.
 * - Primitives pass through untouched.
 */
export function applySlimMode(
  data: unknown,
  fields: string[] | undefined
): unknown {
  if (!fields) return data;

  if (Array.isArray(data)) {
    return data.map((item) =>
      typeof item === "object" && item !== null
        ? pickFields(item as Record<string, unknown>, fields)
        : item
    );
  }

  if (typeof data === "object" && data !== null) {
    return pickFields(data as Record<string, unknown>, fields);
  }

  return data;
}

/**
 * Truncate an array to `limit` items and report whether truncation occurred.
 */
export function truncateWithWarning<T>(
  data: T[],
  limit: number
): { data: T[]; truncated: boolean; total: number } {
  const total = data.length;
  if (total <= limit) {
    return { data, truncated: false, total };
  }
  return { data: data.slice(0, limit), truncated: true, total };
}
