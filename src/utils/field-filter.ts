import { OpenXEClient } from "../client/openxe-client.js";

export interface FilteredListResult {
  data: any[];
  meta: {
    total_from_api: number;    // total records fetched from API
    filtered_out: number;       // records removed by DEL filter
    returned: number;           // records in this response
    truncated: boolean;         // true if we stopped before the API ran out
  };
}

/**
 * Hard safety cap for fetchAll mode. Prevents runaway loops on broken
 * pagination. If a real dataset grows past this, the caller receives a loud
 * `truncated: true` flag so KPIs/reports can surface a warning instead of
 * silently under-reporting. Raise if legitimate data exceeds it.
 */
export const FETCH_ALL_SAFETY_CAP = 10000;

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
  const stopAtMax = !fetchAll; // only stop early if not fetching all
  // fetchAll paginates until the API runs out, capped by FETCH_ALL_SAFETY_CAP.
  // Without fetchAll, 10 pages × 100 = 1000 raw records max (then maxResults trims).
  const maxPages = fetchAll ? Math.ceil(FETCH_ALL_SAFETY_CAP / pageSize) : 10;

  // Track why the loop exits. If we never saw an empty or short page AND we
  // never drained the API, we hit a cap and the result is a lower bound.
  let exhaustedApi = false;

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

    if (list.length === 0) { exhaustedApi = true; break; }

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
    if (rawCount < pageSize) { exhaustedApi = true; break; }
    if (stopAtMax && allRecords.length >= maxResults) break;
    if (fetchAll && allRecords.length >= FETCH_ALL_SAFETY_CAP) break;

    page++;
  }

  // In fetchAll mode keep everything (plus the safety-cap truncated flag).
  // In default mode, trim to maxResults and flag truncation if we saw more.
  let finalData: any[];
  let wasTruncated: boolean;
  if (fetchAll) {
    finalData = allRecords;
    wasTruncated = !exhaustedApi; // hit safety cap or maxPages
  } else {
    const trimmed = truncateWithWarning(allRecords, maxResults);
    finalData = trimmed.data as any[];
    // Truncated if we trimmed the array OR if we stopped paginating early
    // because we already had enough records while the API still had more.
    wasTruncated = trimmed.truncated || !exhaustedApi;
  }

  // Apply slim (unless caller wants raw data for further filtering)
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
