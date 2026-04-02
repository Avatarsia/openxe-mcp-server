/**
 * Integration tests: smart-filters against real OpenXE API data.
 *
 * These tests fetch real data from the OpenXE test instance, then apply the
 * client-side filter functions from src/utils/smart-filters.ts and verify
 * correctness of each operation.
 *
 * Configure via env vars: OPENXE_URL, OPENXE_USERNAME, OPENXE_PASSWORD
 */

import { describe, it, expect, vi } from "vitest";
import {
  applyWhere,
  applySort,
  applyLimit,
  applyFields,
  applyAggregate,
  parseZeitraum,
  formatAsTable,
  formatAsCsv,
  formatAsIds,
  STATUS_PRESETS,
  type WhereClause,
} from "../../src/utils/smart-filters.js";
import { OpenXEClient } from "../../src/client/openxe-client.js";
import { filterDeleted } from "../../src/utils/field-filter.js";

// ---------------------------------------------------------------------------
// Client setup
// ---------------------------------------------------------------------------

const baseUrl = process.env.OPENXE_URL
  ? `${process.env.OPENXE_URL}/api/index.php`
  : undefined;
const username = process.env.OPENXE_USERNAME;
const password = process.env.OPENXE_PASSWORD;

// Client is only created when all env vars are present (tests are skipped otherwise)
const client = (baseUrl && username && password)
  ? new OpenXEClient({
      baseUrl,
      username,
      password,
      timeout: 30000,
      mode: "router",
    })
  : undefined as unknown as OpenXEClient;

/**
 * Fetch all records from an endpoint, paginating through all pages.
 * Mirrors the data extraction logic from fetchFilteredList in field-filter.ts:
 * the API returns { data: [...], pagination: {...} } in the JSON body.
 * client.get() returns the whole body as result.data, so we unwrap it.
 * Also applies filterDeleted to match production behavior.
 */
async function fetchAll(path: string): Promise<any[]> {
  const perPage = 100;
  let page = 1;
  let allRecords: any[] = [];
  const maxPages = 50;

  while (page <= maxPages) {
    const result = await client.get(path, { items: String(perPage), page: String(page) });
    const rawData = result.data;

    // Unwrap: API returns {data: [...], pagination: {...}} as the JSON body
    let list: any[];
    if (Array.isArray(rawData)) {
      list = rawData;
    } else if (rawData && typeof rawData === "object" && Array.isArray((rawData as any).data)) {
      list = (rawData as any).data;
    } else if (rawData && typeof rawData === "object" && Object.keys(rawData as object).length > 0) {
      list = [rawData];
    } else {
      list = [];
    }

    if (list.length === 0) break;

    allRecords = allRecords.concat(list);

    // If API returned fewer than requested, we've reached the last page
    if (list.length < perPage) break;
    page++;
  }

  // Filter out deleted/ghost records (matches production behavior)
  return filterDeleted(allRecords);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!baseUrl || !username || !password)("Smart Filters -- Live API Integration", () => {

  // Cache fetched data across tests within this describe block
  let addresses: any[] | null = null;
  let orders: any[] | null = null;
  let articles: any[] | null = null;
  let invoices: any[] | null = null;

  async function getAddresses() {
    if (!addresses) addresses = await fetchAll("/v1/adressen");
    return addresses;
  }
  async function getOrders() {
    if (!orders) orders = await fetchAll("/v1/belege/auftraege");
    return orders;
  }
  async function getArticles() {
    if (!articles) articles = await fetchAll("/v1/artikel");
    return articles;
  }
  async function getInvoices() {
    if (!invoices) invoices = await fetchAll("/v1/belege/rechnungen");
    return invoices;
  }

  // -----------------------------------------------------------------------
  // Test 1: applyWhere -- equals operator
  // -----------------------------------------------------------------------
  it("Test 1: applyWhere equals -- land_equals_DE", async () => {
    const data = await getAddresses();
    expect(data.length).toBeGreaterThan(0);

    const where: WhereClause = { land: { equals: "DE" } };
    const result = applyWhere(data, where);

    // Every result must have land === "DE"
    for (const r of result) {
      expect(String(r.land)).toBe("DE");
    }
    // There should be at least some DE addresses
    expect(result.length).toBeGreaterThan(0);
    // Filtered count must be <= total
    expect(result.length).toBeLessThanOrEqual(data.length);
  }, 60000);

  // -----------------------------------------------------------------------
  // Test 2: applyWhere -- startsWith operator
  // -----------------------------------------------------------------------
  it("Test 2: applyWhere startsWith -- plz_startsWith_2", async () => {
    const data = await getAddresses();

    const where: WhereClause = { plz: { startsWith: "2" } };
    const result = applyWhere(data, where);

    // Every result must have plz starting with "2"
    for (const r of result) {
      expect(String(r.plz ?? "").startsWith("2")).toBe(true);
    }
    // Should return results (the exact count depends on the live data)
    expect(result.length).toBeGreaterThan(0);
  }, 60000);

  // -----------------------------------------------------------------------
  // Test 3: applyWhere -- gt operator
  // -----------------------------------------------------------------------
  it("Test 3: applyWhere gt -- gesamtsumme_gt_100", async () => {
    const data = await getOrders();
    expect(data.length).toBeGreaterThan(0);

    const where: WhereClause = { gesamtsumme: { gt: 100 } };
    const result = applyWhere(data, where);

    // Every result must have gesamtsumme > 100
    for (const r of result) {
      expect(parseFloat(String(r.gesamtsumme))).toBeGreaterThan(100);
    }
    expect(result.length).toBeGreaterThan(0);
  }, 60000);

  // -----------------------------------------------------------------------
  // Test 4: applyWhere -- contains operator
  // -----------------------------------------------------------------------
  it("Test 4: applyWhere contains -- name_contains_Partner", async () => {
    const data = await getAddresses();

    const where: WhereClause = { name: { contains: "Partner" } };
    const result = applyWhere(data, where);

    // Every result must contain "Partner" (case-insensitive per implementation)
    for (const r of result) {
      expect(String(r.name).toLowerCase()).toContain("partner");
    }
    expect(result.length).toBeGreaterThan(0);
  }, 60000);

  // -----------------------------------------------------------------------
  // Test 5: applySort -- ascending
  // -----------------------------------------------------------------------
  it("Test 5: applySort asc -- articles sorted by name_de ascending", async () => {
    const data = await getArticles();
    expect(data.length).toBeGreaterThan(1);

    const sorted = applySort(data, { field: "name_de", order: "asc" });

    // Verify sorted order: each name_de should be >= previous (locale compare)
    for (let i = 1; i < sorted.length; i++) {
      const prev = String(sorted[i - 1].name_de ?? "");
      const curr = String(sorted[i].name_de ?? "");
      expect(prev.localeCompare(curr)).toBeLessThanOrEqual(0);
    }
  }, 60000);

  // -----------------------------------------------------------------------
  // Test 6: applySort -- descending
  // -----------------------------------------------------------------------
  it("Test 6: applySort desc -- articles sorted by id descending", async () => {
    const data = await getArticles();
    expect(data.length).toBeGreaterThan(1);

    const sorted = applySort(data, { field: "id", order: "desc" });

    // Verify descending: each numeric id should be <= previous
    for (let i = 1; i < sorted.length; i++) {
      const prev = parseFloat(String(sorted[i - 1].id));
      const curr = parseFloat(String(sorted[i].id));
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
  }, 60000);

  // -----------------------------------------------------------------------
  // Test 7: applyLimit
  // -----------------------------------------------------------------------
  it("Test 7: applyLimit -- limit 5 addresses", async () => {
    const data = await getAddresses();
    expect(data.length).toBeGreaterThan(5);

    const result = applyLimit(data, 5);
    expect(result).toHaveLength(5);
    // Should be the first 5 from the original
    expect(result).toEqual(data.slice(0, 5));
  }, 60000);

  // -----------------------------------------------------------------------
  // Test 8: applyFields
  // -----------------------------------------------------------------------
  it("Test 8: applyFields -- pick id, name, kundennummer from addresses", async () => {
    const data = await getAddresses();
    expect(data.length).toBeGreaterThan(0);

    const fields = ["id", "name", "kundennummer"];
    const result = applyFields(data, fields);

    for (const r of result) {
      const keys = Object.keys(r);
      // Each record should only have the requested fields (if they exist)
      for (const k of keys) {
        expect(fields).toContain(k);
      }
      // The requested fields should be present (they exist on all address records)
      expect(r).toHaveProperty("id");
      expect(r).toHaveProperty("name");
      expect(r).toHaveProperty("kundennummer");
    }
  }, 60000);

  // -----------------------------------------------------------------------
  // Test 9: parseZeitraum -- dieser-monat (April 2026)
  // -----------------------------------------------------------------------
  it("Test 9: parseZeitraum dieser-monat -- April 2026", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-02T12:00:00Z"));

    const result = parseZeitraum("dieser-monat");
    expect(result).toEqual({ von: "2026-04-01", bis: "2026-04-30" });

    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // Test 10: parseZeitraum -- letzte-30-tage
  // -----------------------------------------------------------------------
  it("Test 10: parseZeitraum letzte-30-tage -- from 2026-04-02", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-02T12:00:00Z"));

    const result = parseZeitraum("letzte-30-tage");
    expect(result).toEqual({ von: "2026-03-03", bis: "2026-04-02" });

    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // Test 11: STATUS_PRESETS -- purchaseOrders aktiv
  // -----------------------------------------------------------------------
  it("Test 11: STATUS_PRESETS purchaseOrders.aktiv -- expected statuses", () => {
    const fn = STATUS_PRESETS.purchaseOrders.aktiv;
    expect(fn).toBeDefined();

    // Should accept these statuses
    expect(fn({ status: "offen" })).toBe(true);
    expect(fn({ status: "freigegeben" })).toBe(true);
    expect(fn({ status: "bestellt" })).toBe(true);
    expect(fn({ status: "angemahnt" })).toBe(true);

    // Should reject these
    expect(fn({ status: "empfangen" })).toBe(false);
    expect(fn({ status: "abgeschlossen" })).toBe(false);
    expect(fn({ status: "storniert" })).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Test 12: applyAggregate -- count
  // -----------------------------------------------------------------------
  it("Test 12: applyAggregate count -- addresses", async () => {
    const data = await getAddresses();

    const result = applyAggregate(data, "count");
    expect(result).toHaveProperty("count");
    expect(typeof result.count).toBe("number");
    expect(result.count).toBe(data.length);
  }, 60000);

  // -----------------------------------------------------------------------
  // Test 13: applyAggregate -- sum
  // -----------------------------------------------------------------------
  it("Test 13: applyAggregate sum -- invoices sum soll", async () => {
    const data = await getInvoices();
    expect(data.length).toBeGreaterThan(0);

    const result = applyAggregate(data, { sum: "soll" });
    expect(result).toHaveProperty("sum");
    expect(result).toHaveProperty("field", "soll");
    expect(result).toHaveProperty("count", data.length);
    expect(typeof result.sum).toBe("number");
    expect(result.sum).toBeGreaterThanOrEqual(0);

    // Verify by manual calculation
    const manualSum = data.reduce((s: number, r: any) => s + (parseFloat(r.soll) || 0), 0);
    expect(result.sum).toBe(Math.round(manualSum * 100) / 100);
  }, 60000);

  // -----------------------------------------------------------------------
  // Test 14: applyAggregate -- groupBy
  // -----------------------------------------------------------------------
  it("Test 14: applyAggregate groupBy -- addresses grouped by land", async () => {
    const data = await getAddresses();

    const result = applyAggregate(data, { groupBy: "land" });
    expect(result).toHaveProperty("groupBy", "land");
    expect(result).toHaveProperty("groups");
    expect(typeof result.groups).toBe("object");

    // Sum of all group counts should equal total record count
    const totalFromGroups = Object.values(result.groups).reduce(
      (sum: number, g: any) => sum + g.count, 0
    );
    expect(totalFromGroups).toBe(data.length);

    // If there are DE addresses, verify the group
    const deAddresses = data.filter((r: any) => String(r.land) === "DE");
    if (deAddresses.length > 0) {
      expect(result.groups.DE).toBeDefined();
      expect(result.groups.DE.count).toBe(deAddresses.length);
    }
  }, 60000);

  // -----------------------------------------------------------------------
  // Test 15: formatAsTable
  // -----------------------------------------------------------------------
  it("Test 15: formatAsTable -- real address records", async () => {
    const data = await getAddresses();
    const sample = applyLimit(applyFields(data, ["id", "name", "land"]), 3);
    expect(sample.length).toBe(3);

    const table = formatAsTable(sample, ["id", "name", "land"]);
    const lines = table.split("\n");

    // Header + separator + 3 data rows = 5 lines
    expect(lines.length).toBe(5);
    // Header must contain field names
    expect(lines[0]).toContain("id");
    expect(lines[0]).toContain("name");
    expect(lines[0]).toContain("land");
    // Separator line must contain dashes
    expect(lines[1]).toMatch(/-/);
    // Data rows must not be empty
    for (let i = 2; i < lines.length; i++) {
      expect(lines[i].length).toBeGreaterThan(0);
    }
  }, 60000);

  // -----------------------------------------------------------------------
  // Test 16: formatAsCsv
  // -----------------------------------------------------------------------
  it("Test 16: formatAsCsv -- real address records", async () => {
    const data = await getAddresses();
    const sample = applyLimit(applyFields(data, ["id", "name", "land"]), 3);
    expect(sample.length).toBe(3);

    const csv = formatAsCsv(sample, ["id", "name", "land"]);
    const lines = csv.split("\n");

    // Header + 3 data rows = 4 lines
    expect(lines.length).toBe(4);
    // Header uses semicolons
    expect(lines[0]).toBe("id;name;land");
    // Data rows must contain semicolons
    for (let i = 1; i < lines.length; i++) {
      expect(lines[i]).toContain(";");
    }
  }, 60000);

  // -----------------------------------------------------------------------
  // Test 17: formatAsIds
  // -----------------------------------------------------------------------
  it("Test 17: formatAsIds -- real address records", async () => {
    const data = await getAddresses();
    const sample = applyLimit(data, 5);

    const ids = formatAsIds(sample);
    const idArray = ids.split(",");

    // Should have comma-separated IDs
    expect(idArray.length).toBeLessThanOrEqual(5);
    expect(idArray.length).toBeGreaterThan(0);
    // Each ID should be a number
    for (const id of idArray) {
      expect(Number(id)).not.toBeNaN();
    }
  }, 60000);
});
