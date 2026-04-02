import { OpenXEClient } from "../client/openxe-client.js";

/**
 * Fetch all purchase orders from OpenXE using the Legacy API.
 *
 * Strategy 1: Try BelegeList with typ=bestellung (efficient, single call).
 * Strategy 2: If that fails or returns empty, iterate BestellungGet for IDs
 *             1..200, stopping after 3 consecutive failures.
 *
 * This is shared between dashboard-tools and business-query-tools so that
 * both have a working fallback when BelegeList is unavailable.
 */
export async function fetchPurchaseOrders(client: OpenXEClient): Promise<any[]> {
  // Strategy 1: Try BelegeList with typ=bestellung
  try {
    const result = await client.legacyPost("BelegeList", { typ: "bestellung" });
    if (result.success && result.data) {
      const data = result.data;
      if (Array.isArray(data) && data.length > 0) return data;
      if (typeof data === "object") {
        const obj = data as Record<string, unknown>;
        for (const val of Object.values(obj)) {
          if (Array.isArray(val) && val.length > 0) return val;
        }
      }
    }
  } catch {
    // BelegeList not available — fall through to iteration
  }

  // Strategy 2: Iterate BestellungGet for IDs 1..200
  const orders: any[] = [];
  let consecutiveFailures = 0;
  for (let id = 1; id <= 200; id++) {
    try {
      const result = await client.legacyPost("BestellungGet", { id: String(id) });
      if (result.success && result.data) {
        orders.push(result.data);
        consecutiveFailures = 0;
      } else {
        consecutiveFailures++;
      }
    } catch {
      consecutiveFailures++;
    }
    if (consecutiveFailures >= 3) break;
  }
  return orders;
}
