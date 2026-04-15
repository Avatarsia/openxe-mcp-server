import { OpenXEClient } from "../client/openxe-client.js";

/**
 * Hard safety cap on BestellungGet iteration — prevents runaway scans.
 * If a real instance has more purchase orders than this, the caller must
 * narrow the query or we need a different fetch strategy.
 */
export const PURCHASE_ORDER_SCAN_CAP = 5000;

/**
 * How many consecutive BestellungGet failures to tolerate before concluding
 * we are past the highest existing ID. OpenXE ID sequences can have large
 * gaps from deletes/migrations, so this needs to be generous.
 */
const CONSECUTIVE_MISS_LIMIT = 50;

export interface PurchaseOrdersResult {
  orders: any[];
  truncated: boolean;      // true if we hit PURCHASE_ORDER_SCAN_CAP
  strategy: "belegelist" | "scan";
}

/**
 * Fetch all purchase orders from OpenXE using the Legacy API.
 *
 * Strategy 1: BelegeList with typ=bestellung — single efficient call.
 * Strategy 2: Iterative BestellungGet, scanning IDs upward until we see
 *             CONSECUTIVE_MISS_LIMIT consecutive failures or hit the cap.
 *
 * Why the iterative scan is generous (50 misses, 5000 cap instead of the
 * old 3 misses / 200 cap): OpenXE assigns sequential IDs across all belege
 * types (auftraege, rechnungen, bestellungen share the same counter), so
 * purchase order IDs can be sparse and high — e.g. IDs 1, 42, 317, 1804.
 * A 3-miss / 200-cap window silently loses orders on any non-trivial
 * instance.
 */
export async function fetchPurchaseOrders(client: OpenXEClient): Promise<any[]> {
  const result = await fetchPurchaseOrdersWithMeta(client);
  return result.orders;
}

export async function fetchPurchaseOrdersWithMeta(
  client: OpenXEClient
): Promise<PurchaseOrdersResult> {
  // Strategy 1: BelegeList (fast path when available)
  try {
    const bl = await client.legacyPost("BelegeList", { typ: "bestellung" });
    if (bl.success) {
      // BelegeList answered authoritatively — even [] means "no purchase orders".
      // Fall through to the scan only when the call itself failed.
      const data = bl.data;
      if (Array.isArray(data)) {
        return { orders: data, truncated: false, strategy: "belegelist" };
      }
      if (data && typeof data === "object") {
        const obj = data as Record<string, unknown>;
        for (const val of Object.values(obj)) {
          if (Array.isArray(val)) {
            return { orders: val, truncated: false, strategy: "belegelist" };
          }
        }
        // success:true but no array payload — unexpected shape, fall through
      }
      // success:true with no recognisable payload → fall through
    }
  } catch {
    // BelegeList not available on this instance (e.g. on v1.12 this reliably
    // fails with 7499) — fall through to scan
  }

  // Strategy 2: Scan BestellungGet upward
  const orders: any[] = [];
  let consecutiveMisses = 0;
  let id = 1;
  for (; id <= PURCHASE_ORDER_SCAN_CAP; id++) {
    try {
      const result = await client.legacyPost("BestellungGet", { id: String(id) });
      if (result.success && result.data) {
        orders.push(result.data);
        consecutiveMisses = 0;
      } else {
        consecutiveMisses++;
      }
    } catch {
      consecutiveMisses++;
    }
    if (consecutiveMisses >= CONSECUTIVE_MISS_LIMIT) break;
  }

  // Truncated only if we actually reached the cap without hitting the miss
  // limit — that means there could be more orders at higher IDs.
  const truncated = id > PURCHASE_ORDER_SCAN_CAP && consecutiveMisses < CONSECUTIVE_MISS_LIMIT;
  return { orders, truncated, strategy: "scan" };
}
