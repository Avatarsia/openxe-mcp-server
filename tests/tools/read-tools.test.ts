import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenXEClient } from "../../src/client/openxe-client.js";
import {
  handleReadTool,
  READ_TOOL_DEFINITIONS,
} from "../../src/tools/read-tools.js";

describe("Read Tools", () => {
  let mockClient: {
    get: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockClient = {
      get: vi.fn(),
    };
  });

  /** Helper: mock returns data on first page, empty on subsequent pages */
  function mockPaginatedGet(data: any[], pagination?: any) {
    mockClient.get.mockImplementation((_path: string, params?: Record<string, any>) => {
      const page = parseInt(params?.page ?? "1", 10);
      if (page === 1) {
        return Promise.resolve({
          data,
          pagination: pagination ?? { totalCount: data.length, page: 1, itemsPerPage: 100 },
        });
      }
      return Promise.resolve({ data: [], pagination: undefined });
    });
  }

  it("defines all 7 read tools", () => {
    const names = READ_TOOL_DEFINITIONS.map((t) => t.name);
    expect(names).toContain("openxe-list-addresses");
    expect(names).toContain("openxe-get-address");
    expect(names).toContain("openxe-list-articles");
    expect(names).toContain("openxe-get-article");
    expect(names).toContain("openxe-list-categories");
    expect(names).toContain("openxe-list-shipping-methods");
    expect(names).toContain("openxe-list-files");
    expect(names).toHaveLength(7);
  });

  it("each tool definition has name, description, and inputSchema", () => {
    for (const tool of READ_TOOL_DEFINITIONS) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeTruthy();
    }
  });

  it("lists addresses with no filters and returns metadata wrapper", async () => {
    mockPaginatedGet([{ id: 1, name: "Acme" }]);

    const result = await handleReadTool(
      "openxe-list-addresses",
      {},
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.get).toHaveBeenCalledWith("/v1/adressen", {
      page: "1",
      items: "100",
    });
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed._info).toContain("1 Ergebnisse");
    expect(parsed._hint).toContain("openxe-get-address");
    expect(parsed.data).toHaveLength(1);
    expect(parsed.data[0].name).toBe("Acme");
  });

  it("lists addresses with kundennummer (server-side filter)", async () => {
    mockPaginatedGet([{ id: 1, name: "Acme", kundennummer: "K1001" }]);

    await handleReadTool(
      "openxe-list-addresses",
      { kundennummer: "K1001" },
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.get).toHaveBeenCalledWith("/v1/adressen", {
      kundennummer: "K1001",
      page: "1",
      items: "100",
    });
  });

  it("filters addresses by name client-side", async () => {
    mockPaginatedGet([
      { id: 1, name: "Acme GmbH", firma: "" },
      { id: 2, name: "Beta Corp", firma: "" },
      { id: 3, name: "Test", firma: "Acme Holding" },
    ]);

    const result = await handleReadTool(
      "openxe-list-addresses",
      { name: "acme" },
      mockClient as unknown as OpenXEClient
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data).toHaveLength(2);
    expect(parsed.data.map((a: any) => a.id)).toEqual([1, 3]);
  });

  it("filters addresses by email client-side", async () => {
    mockPaginatedGet([
      { id: 1, name: "A", email: "info@acme.de" },
      { id: 2, name: "B", email: "hello@beta.com" },
    ]);

    const result = await handleReadTool(
      "openxe-list-addresses",
      { email: "acme" },
      mockClient as unknown as OpenXEClient
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data).toHaveLength(1);
    expect(parsed.data[0].id).toBe(1);
  });

  it("filters addresses by land client-side", async () => {
    mockPaginatedGet([
      { id: 1, name: "A", land: "DE" },
      { id: 2, name: "B", land: "AT" },
    ]);

    const result = await handleReadTool(
      "openxe-list-addresses",
      { land: "de" },
      mockClient as unknown as OpenXEClient
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data).toHaveLength(1);
    expect(parsed.data[0].land).toBe("DE");
  });

  it("gets a single address by ID", async () => {
    mockClient.get.mockResolvedValue({
      data: { id: 42, name: "Acme GmbH", email: "info@acme.de" },
    });

    const result = await handleReadTool(
      "openxe-get-address",
      { id: 42 },
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.get).toHaveBeenCalledWith("/v1/adressen/42");
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.id).toBe(42);
    expect(parsed.name).toBe("Acme GmbH");
  });

  it("lists articles with include", async () => {
    mockPaginatedGet([{ id: 1, name: "PLA Filament", name_de: "PLA Filament" }]);

    const result = await handleReadTool(
      "openxe-list-articles",
      { include: "verkaufspreise,lagerbestand" },
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.get).toHaveBeenCalledWith("/v1/artikel", {
      include: "verkaufspreise,lagerbestand",
      page: "1",
      items: "100",
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data).toHaveLength(1);
  });

  it("lists articles with filters (pagination handled internally)", async () => {
    mockPaginatedGet([]);

    await handleReadTool(
      "openxe-list-articles",
      { name_de: "Filament", typ: "produkt" },
      mockClient as unknown as OpenXEClient
    );

    // fetchFilteredList manages pagination internally (page=1, items=100)
    expect(mockClient.get).toHaveBeenCalledWith("/v1/artikel", {
      name_de: "Filament",
      typ: "produkt",
      page: "1",
      items: "100",
    });
  });

  it("gets a single article by ID with include", async () => {
    mockClient.get.mockResolvedValue({
      data: { id: 5, name_de: "PETG Filament" },
    });

    const result = await handleReadTool(
      "openxe-get-article",
      { id: 5, include: "verkaufspreise" },
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.get).toHaveBeenCalledWith("/v1/artikel/5", {
      include: "verkaufspreise",
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.id).toBe(5);
  });

  it("gets article without include", async () => {
    mockClient.get.mockResolvedValue({
      data: { id: 5, name_de: "PETG Filament" },
    });

    await handleReadTool(
      "openxe-get-article",
      { id: 5 },
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.get).toHaveBeenCalledWith("/v1/artikel/5", {});
  });

  it("lists categories with filters", async () => {
    mockPaginatedGet([{ id: 1, bezeichnung: "Filamente" }]);

    await handleReadTool(
      "openxe-list-categories",
      { bezeichnung: "Filamente", parent: 0 },
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.get).toHaveBeenCalledWith("/v1/artikelkategorien", {
      bezeichnung: "Filamente",
      parent: 0,
      page: "1",
      items: "100",
    });
  });

  it("lists shipping methods", async () => {
    mockPaginatedGet([{ id: 1, name: "DHL Paket", bezeichnung: "DHL Paket" }]);

    const result = await handleReadTool(
      "openxe-list-shipping-methods",
      {},
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.get).toHaveBeenCalledWith("/v1/versandarten", {
      page: "1",
      items: "100",
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data[0].bezeichnung).toBe("DHL Paket");
  });

  it("lists files with filters", async () => {
    mockPaginatedGet([{ id: 10, objekt: "Artikel", parameter: "5" }]);

    await handleReadTool(
      "openxe-list-files",
      { objekt: "Artikel", parameter: "5" },
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.get).toHaveBeenCalledWith("/v1/dateien", {
      objekt: "Artikel",
      parameter: "5",
      page: "1",
      items: "100",
    });
  });

  it("auto-paginates when DEL records are filtered out", async () => {
    // Page 1: 100 records (full page), 99 are DEL -> only 1 survives, triggers page 2
    // Page 2: 2 normal records (less than pageSize -> last page)
    const page1Data: any[] = [{ id: 1, name: "Good", kundennummer: "K1" }];
    for (let i = 2; i <= 100; i++) {
      page1Data.push({ id: i, name: `Deleted${i}`, kundennummer: `DEL-${i}` });
    }

    mockClient.get.mockImplementation((_path: string, params?: Record<string, any>) => {
      const page = parseInt(params?.page ?? "1", 10);
      if (page === 1) {
        return Promise.resolve({
          data: page1Data,
          pagination: { totalCount: 102, page: 1, itemsPerPage: 100 },
        });
      }
      if (page === 2) {
        return Promise.resolve({
          data: [
            { id: 101, name: "Also Good", kundennummer: "K2" },
            { id: 102, name: "Third Good", kundennummer: "K3" },
          ],
          pagination: { totalCount: 102, page: 2, itemsPerPage: 100 },
        });
      }
      return Promise.resolve({ data: [], pagination: undefined });
    });

    const result = await handleReadTool(
      "openxe-list-addresses",
      {},
      mockClient as unknown as OpenXEClient
    );

    const parsed = JSON.parse(result.content[0].text);
    // Should have fetched both pages and returned all 3 non-DEL records
    expect(parsed.data).toHaveLength(3);
    expect(parsed.data.map((a: any) => a.id)).toEqual([1, 101, 102]);
    // Should report filtered-out DEL records in _info
    expect(parsed._info).toContain("geloeschte ausgeblendet");
  });

  describe("truncation warning for non-JSON formats", () => {
    /** Build N fake address records (each passes the DEL filter). */
    function makeAddresses(count: number) {
      const records: any[] = [];
      for (let i = 1; i <= count; i++) {
        records.push({ id: i, name: `Kunde ${i}`, kundennummer: `K${1000 + i}` });
      }
      return records;
    }

    it("format=table: appends WARNUNG as content[1] when >MAX_LIST_RESULTS records", async () => {
      // 60 records > MAX_LIST_RESULTS (50). Page 1 returns 60, page 2 is empty.
      // fetchFilteredList trims to 50 and sets meta.truncated=true.
      mockPaginatedGet(makeAddresses(60));

      const result = await handleReadTool(
        "openxe-list-addresses",
        { format: "table" },
        mockClient as unknown as OpenXEClient
      );

      expect(result.isError).toBeUndefined();
      expect(result.content).toHaveLength(2);
      // content[0] is the raw table (no WARNUNG prefix polluting it)
      expect(result.content[0].text).not.toMatch(/WARNUNG/);
      // content[1] carries the truncation warning
      expect(result.content[1].text).toMatch(/WARNUNG.*50.*abgeschnitten/);
    });

    it("format=csv: appends WARNUNG as content[1] when >MAX_LIST_RESULTS records", async () => {
      mockPaginatedGet(makeAddresses(60));

      const result = await handleReadTool(
        "openxe-list-addresses",
        { format: "csv" },
        mockClient as unknown as OpenXEClient
      );

      expect(result.content).toHaveLength(2);
      // content[0] is a clean CSV stream, no warning mixed in
      expect(result.content[0].text).not.toMatch(/WARNUNG/);
      expect(result.content[0].text).toContain(";"); // semicolon-separated
      expect(result.content[1].text).toMatch(/WARNUNG.*50.*abgeschnitten/);
    });

    it("format=ids: appends WARNUNG as content[1] when >MAX_LIST_RESULTS records", async () => {
      mockPaginatedGet(makeAddresses(60));

      const result = await handleReadTool(
        "openxe-list-addresses",
        { format: "ids" },
        mockClient as unknown as OpenXEClient
      );

      expect(result.content).toHaveLength(2);
      // content[0] is a bare ID list, consumable verbatim by batch scripts
      expect(result.content[0].text).not.toMatch(/WARNUNG/);
      expect(result.content[1].text).toMatch(/WARNUNG.*50.*abgeschnitten/);
    });

    it("format=table: no warning when result set is below MAX_LIST_RESULTS", async () => {
      mockPaginatedGet(makeAddresses(5));

      const result = await handleReadTool(
        "openxe-list-addresses",
        { format: "table", limit: 10 },
        mockClient as unknown as OpenXEClient
      );

      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).not.toMatch(/WARNUNG/);
    });
  });

  it("returns error for unknown tool name", async () => {
    const result = await handleReadTool(
      "openxe-unknown-tool",
      {},
      mockClient as unknown as OpenXEClient
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Unknown read tool");
  });

  // Regression tests for Task N: limit > MAX_LIST_RESULTS (=50) must be
  // honored by fetchFilteredList, not silently capped at 50. The previous
  // behavior stopped pagination after 50 records because maxResults defaulted
  // to MAX_LIST_RESULTS. Tests simulate a multi-page API (pageSize=100) so
  // the caller has to actually paginate to reach >50 results.
  describe("limit > MAX_LIST_RESULTS is honored (Task N regression)", () => {
    /** Build N records that survive the DEL filter. */
    function makeRecords(count: number, prefix: string) {
      const records: any[] = [];
      for (let i = 1; i <= count; i++) {
        records.push({ id: i, name: `${prefix} ${i}`, kundennummer: `K${1000 + i}` });
      }
      return records;
    }

    /** Mock that returns `total` records split across pages of size 100. */
    function mockMultiPage(total: number, prefix: string) {
      const all = makeRecords(total, prefix);
      mockClient.get.mockImplementation((_path: string, params?: Record<string, any>) => {
        const page = parseInt(params?.page ?? "1", 10);
        const items = parseInt(params?.items ?? "100", 10);
        const start = (page - 1) * items;
        const slice = all.slice(start, start + items);
        return Promise.resolve({
          data: slice,
          pagination: { totalCount: total, page, itemsPerPage: items },
        });
      });
    }

    it("list-addresses with limit=150 returns all 150 across 2 pages (100+50)", async () => {
      mockMultiPage(150, "Kunde");

      const result = await handleReadTool(
        "openxe-list-addresses",
        { limit: 150 },
        mockClient as unknown as OpenXEClient
      );

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      // Without the fix, fetchFilteredList would stop at 50 records.
      expect(parsed.data).toHaveLength(150);
      // Verify the client actually fetched both pages.
      const pagesRequested = mockClient.get.mock.calls
        .map((call: any[]) => call[1]?.page)
        .filter((p: string | undefined): p is string => p !== undefined);
      expect(pagesRequested).toContain("1");
      expect(pagesRequested).toContain("2");
    });

    it("list-articles with limit=120 returns all 120 across 2 pages", async () => {
      // Articles use name_de/nummer as identifiers; reuse kundennummer-keyed
      // records since the DEL filter accepts any of name/kundennummer.
      mockMultiPage(120, "Artikel");

      const result = await handleReadTool(
        "openxe-list-articles",
        { limit: 120 },
        mockClient as unknown as OpenXEClient
      );

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.data).toHaveLength(120);
    });

    it("format=table with limit=150 + 200 records: warning says 150, not 50", async () => {
      // 200 records with limit=150 -> fetchFilteredList uses maxResults=150,
      // trims to 150, and sets meta.truncated=true. The warning text must
      // reflect the effective cap (150), not hardcoded MAX_LIST_RESULTS (50).
      mockMultiPage(200, "Kunde");

      const result = await handleReadTool(
        "openxe-list-addresses",
        { limit: 150, format: "table" },
        mockClient as unknown as OpenXEClient
      );

      expect(result.content).toHaveLength(2);
      expect(result.content[1].text).toMatch(/WARNUNG.*150.*abgeschnitten/);
      // Sanity: the 50 from MAX_LIST_RESULTS must NOT leak into the text.
      expect(result.content[1].text).not.toMatch(/nach 50/);
    });

    it("list-addresses without explicit limit still caps at MAX_LIST_RESULTS (50)", async () => {
      // Baseline: default behavior unchanged when no limit is set.
      mockMultiPage(150, "Kunde");

      const result = await handleReadTool(
        "openxe-list-addresses",
        {},
        mockClient as unknown as OpenXEClient
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.data).toHaveLength(50);
      // truncated flag must be set to signal more records available
      expect(parsed._info).toMatch(/gekuerzt/);
    });
  });
});
