import { OpenXEClient } from "../client/openxe-client.js";

export async function fetchFilteredList(
  client: OpenXEClient,
  path: string,
  params: Record<string, any>,
  options: {
    slimFields?: readonly string[];
    includeDeleted?: boolean;
    maxResults?: number;
  } = {}
): Promise<any[]> {
  const { slimFields, includeDeleted = false, maxResults = MAX_LIST_RESULTS } = options;

  let allRecords: any[] = [];
  let page = 1;
  const pageSize = 100; // fetch in large chunks to minimize API calls
  let totalFetched = 0;
  const maxPages = 10; // safety limit

  while (allRecords.length < maxResults && page <= maxPages) {
    const result = await client.get(path, { ...params, page: String(page), items: String(pageSize) });
    const rawData = result.data;
    let list: any[];
    if (Array.isArray(rawData)) {
      list = rawData;
    } else if ((rawData as any)?.data && Array.isArray((rawData as any).data)) {
      list = (rawData as any).data;
    } else if (rawData && typeof rawData === 'object' && Object.keys(rawData as object).length > 0) {
      list = [rawData];
    } else {
      list = [];
    }

    if (list.length === 0) break; // no more data from API

    totalFetched += list.length;

    // Apply DEL filter
    if (!includeDeleted) {
      list = filterDeleted(list);
    }

    allRecords = allRecords.concat(list);

    if (totalFetched >= (result.pagination?.totalCount || Infinity)) break; // fetched everything
    if (list.length < pageSize && !includeDeleted) {
      // Page wasn't full even before filtering — might be last page
      // But we filtered some out, so check if API has more
      page++;
      continue;
    }
    if (totalFetched < pageSize) break; // API returned less than requested = last page
    page++;
  }

  // Truncate to maxResults
  const { data: truncated } = truncateWithWarning(allRecords, maxResults);

  // Apply slim
  let result = truncated;
  if (slimFields) {
    result = applySlimMode(result, [...slimFields]) as any[];
  }

  return result;
}

export function filterDeleted(records: any[]): any[] {
  return records.filter(r => {
    // Skip if geloescht = 1 or "1"
    if (String(r.geloescht || "0") === "1") return false;
    // Skip if kundennummer starts with "DEL"
    if (String(r.kundennummer || "").startsWith("DEL")) return false;
    // Skip if belegnr starts with "DEL"
    if (String(r.belegnr || "").startsWith("DEL")) return false;
    // Skip if name is empty AND kundennummer is empty (ghost records)
    if (!r.name && !r.kundennummer && !r.belegnr) return false;
    return true;
  });
}

export function pickFields(record: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (field in record) result[field] = record[field];
  }
  return result;
}

export function applySlimMode(data: unknown, fields: string[] | undefined): unknown {
  if (!fields) return data;
  if (Array.isArray(data)) return data.map(r => pickFields(r as Record<string, unknown>, fields));
  if (typeof data === "object" && data !== null) return pickFields(data as Record<string, unknown>, fields);
  return data;
}

// Default slim fields per entity
export const SLIM_FIELDS = {
  address: ["id", "name", "vorname", "kundennummer", "lieferantennummer", "ort", "land", "email", "telefon", "typ"],
  article: ["id", "nummer", "name_de", "typ", "einheit", "inaktiv", "ausverkauft"],
  order: ["id", "belegnr", "status", "name", "kundennummer", "datum", "gesamtsumme", "waehrung"],
  invoice: ["id", "belegnr", "status", "name", "kundennummer", "datum", "soll", "ist", "zahlungsstatus", "waehrung"],
  quote: ["id", "belegnr", "status", "name", "kundennummer", "datum", "gesamtsumme", "waehrung"],
  deliveryNote: ["id", "belegnr", "status", "name", "kundennummer", "datum", "versandart"],
  creditMemo: ["id", "belegnr", "status", "name", "kundennummer", "datum", "soll", "ist", "waehrung"],
  category: ["id", "bezeichnung", "parent", "projekt"],
  shippingMethod: ["id", "bezeichnung", "type", "aktiv"],
  file: ["id", "titel", "dateiname", "datum", "size"],
} as const;

export const MAX_LIST_RESULTS = 50;

export function truncateWithWarning(data: unknown[], max: number): { data: unknown[]; truncated: boolean; total: number } {
  if (data.length <= max) return { data, truncated: false, total: data.length };
  return {
    data: data.slice(0, max),
    truncated: true,
    total: data.length,
  };
}
