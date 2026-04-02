import { OpenXEClient } from "../client/openxe-client.js";

export interface FilteredListResult {
  data: any[];
  meta: {
    total_from_api: number;    // total records fetched from API
    filtered_out: number;       // records removed by DEL filter
    returned: number;           // records in this response
    truncated: boolean;         // true if more exist than returned
  };
}

export async function fetchFilteredList(
  client: OpenXEClient,
  path: string,
  params: Record<string, any>,
  options: {
    slimFields?: readonly string[];
    includeDeleted?: boolean;
    maxResults?: number;
    skipSlim?: boolean;
    fetchAll?: boolean;
  } = {}
): Promise<FilteredListResult> {
  const { slimFields, includeDeleted = false, maxResults = MAX_LIST_RESULTS, skipSlim = false, fetchAll = false } = options;

  let allRecords: any[] = [];
  let page = 1;
  const pageSize = 100; // fetch in large chunks to minimize API calls
  let totalFetched = 0;
  let totalFilteredOut = 0;
  const maxPages = fetchAll ? 50 : 10; // higher safety limit when fetching all
  const stopAtMax = !fetchAll; // only stop early if not fetching all

  while (page <= maxPages) {
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

    const rawCount = list.length;
    totalFetched += rawCount;

    // Apply DEL filter
    if (!includeDeleted) {
      const filtered = filterDeleted(list);
      totalFilteredOut += rawCount - filtered.length;
      list = filtered;
    }

    allRecords = allRecords.concat(list);

    // If API returned fewer records than requested, we've reached the last page
    if (rawCount < pageSize) break;
    if (stopAtMax && allRecords.length >= maxResults) break;

    page++;
  }

  // Truncate to maxResults (skip when fetchAll — caller handles truncation after where)
  const effectiveMax = fetchAll ? allRecords.length : maxResults;
  const { data: truncated, truncated: wasTruncated } = truncateWithWarning(allRecords, effectiveMax);

  // Apply slim (unless caller wants raw data for further filtering)
  let finalData = truncated;
  if (slimFields && !skipSlim) {
    finalData = applySlimMode(finalData, [...slimFields]) as any[];
  }

  return {
    data: finalData,
    meta: {
      total_from_api: totalFetched,
      filtered_out: totalFilteredOut,
      returned: finalData.length,
      truncated: wasTruncated,
    },
  };
}

export function filterDeleted(records: any[]): any[] {
  return records.filter(r => {
    // Skip if geloescht = 1 or "1"
    if (String(r.geloescht || "0") === "1") return false;
    // Skip if kundennummer starts with "DEL"
    if (String(r.kundennummer || "").startsWith("DEL")) return false;
    // Skip if belegnr starts with "DEL"
    if (String(r.belegnr || "").startsWith("DEL")) return false;
    // Ghost record check — skip records with NO identifying info
    const hasName = r.name || r.name_de || r.bezeichnung || r.titel;
    const hasNumber = r.kundennummer || r.belegnr || r.nummer || r.lieferantennummer;
    if (!hasName && !hasNumber) return false;
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
  purchaseOrder: ["id", "belegnr", "status", "name", "lieferantennummer", "datum", "lieferdatum", "gesamtsumme", "waehrung", "einkaeufer"],
  category: ["id", "bezeichnung", "parent", "projekt"],
  shippingMethod: ["id", "bezeichnung", "type", "aktiv"],
  file: ["id", "titel", "dateiname", "datum", "size"],
  subscription: ["id", "bezeichnung", "adresse", "artikel", "preisart", "preis", "menge", "aktiv"],
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
