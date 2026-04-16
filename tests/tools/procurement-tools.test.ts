import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleProcurementTool, PROCUREMENT_TOOL_DEFINITIONS } from "../../src/tools/procurement-tools.js";
import { OpenXEClient } from "../../src/client/openxe-client.js";
import { PURCHASE_ORDER_SCAN_CAP } from "../../src/utils/purchase-order-fetch.js";

describe("Procurement Tools — list-purchase-orders", () => {
  let mockClient: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    legacyPost: ReturnType<typeof vi.fn>;
    postForm: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockClient = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      legacyPost: vi.fn(),
      postForm: vi.fn(),
    };
  });

  describe("tool definition", () => {
    it("exposes openxe-list-purchase-orders", () => {
      const def = PROCUREMENT_TOOL_DEFINITIONS.find(d => d.name === "openxe-list-purchase-orders");
      expect(def).toBeDefined();
    });
  });

  describe("uses shared fetcher (BelegeList strategy)", () => {
    it("returns orders from BelegeList without scanning BestellungGet", async () => {
      mockClient.legacyPost.mockImplementation((endpoint: string) => {
        if (endpoint === "BelegeList") {
          return Promise.resolve({
            success: true,
            data: [
              { id: "1", belegnr: "BS-001", status: "offen", name: "Lieferant A", lieferantennummer: "L1", datum: "2026-01-01", gesamtsumme: "100.00" },
              { id: "2", belegnr: "BS-002", status: "bestellt", name: "Lieferant B", lieferantennummer: "L2", datum: "2026-01-02", gesamtsumme: "200.00" },
            ],
          });
        }
        return Promise.resolve({ success: false, data: null });
      });

      const result = await handleProcurementTool(
        "openxe-list-purchase-orders",
        {},
        mockClient as unknown as OpenXEClient,
      );

      const text = result.content[0].text;
      const parsed = JSON.parse(text);
      expect(parsed.data).toHaveLength(2);
      expect(parsed._info).toContain("BelegeList");

      // BestellungGet must NOT have been called when BelegeList delivers
      const bestellungCalls = mockClient.legacyPost.mock.calls.filter(c => c[0] === "BestellungGet");
      expect(bestellungCalls).toHaveLength(0);
      expect(parsed._warning).toBeUndefined();
    });
  });

  describe("uses shared fetcher (Scan fallback)", () => {
    it("falls back to BestellungGet scan and tolerates large miss windows (>3)", async () => {
      // Old code: 3 consecutive misses aborted the scan. New helper tolerates 50.
      // We place ID 1 and ID 10 with a gap of 8 misses in between — old code would
      // have stopped after ID 4 and lost ID 10.
      // BelegeList must FAIL (not return success+empty) for the scan to engage —
      // success+[] is now treated as authoritative "no orders".
      mockClient.legacyPost.mockImplementation((endpoint: string, payload: any) => {
        if (endpoint === "BelegeList") {
          return Promise.reject(new Error("BelegeList not available (7499)"));
        }
        if (endpoint === "BestellungGet") {
          const id = parseInt(payload.id, 10);
          if (id === 1) return Promise.resolve({ success: true, data: { id: "1", belegnr: "BS-001", status: "offen" } });
          if (id === 10) return Promise.resolve({ success: true, data: { id: "10", belegnr: "BS-010", status: "bestellt" } });
          return Promise.resolve({ success: false, data: null });
        }
        return Promise.resolve({ success: false, data: null });
      });

      const result = await handleProcurementTool(
        "openxe-list-purchase-orders",
        {},
        mockClient as unknown as OpenXEClient,
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.data).toHaveLength(2);
      expect(parsed._info).toContain("Scan");
      expect(parsed.data.map((d: any) => d.id).sort()).toEqual(["1", "10"]);
    });
  });

  describe("propagates truncation warning", () => {
    it("adds _warning to JSON output when scan hits the cap", async () => {
      // BelegeList unavailable, BestellungGet always-success → scan runs to the cap.
      mockClient.legacyPost.mockImplementation((endpoint: string, payload: any) => {
        if (endpoint === "BelegeList") return Promise.reject(new Error("BelegeList unavailable"));
        if (endpoint === "BestellungGet") {
          return Promise.resolve({ success: true, data: { id: payload.id, belegnr: `BS-${payload.id}`, status: "offen" } });
        }
        return Promise.resolve({ success: false, data: null });
      });

      const result = await handleProcurementTool(
        "openxe-list-purchase-orders",
        { limit: 1 }, // limit so we don't pay for slimming a huge array
        mockClient as unknown as OpenXEClient,
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed._warning).toBeTruthy();
      expect(parsed._warning).toContain(String(PURCHASE_ORDER_SCAN_CAP));
    }, 30000);

    it("appends warning as second TextContent for table format", async () => {
      mockClient.legacyPost.mockImplementation((endpoint: string, payload: any) => {
        if (endpoint === "BelegeList") return Promise.reject(new Error("BelegeList unavailable"));
        if (endpoint === "BestellungGet") {
          return Promise.resolve({ success: true, data: { id: payload.id, belegnr: `BS-${payload.id}`, status: "offen" } });
        }
        return Promise.resolve({ success: false, data: null });
      });

      const result = await handleProcurementTool(
        "openxe-list-purchase-orders",
        { format: "table", limit: 1 },
        mockClient as unknown as OpenXEClient,
      );

      expect(result.content.length).toBeGreaterThanOrEqual(2);
      expect(result.content[1].text).toContain("WARNUNG");
      expect(result.content[1].text).toContain(String(PURCHASE_ORDER_SCAN_CAP));
    }, 30000);
  });

  describe("status_preset validation", () => {
    const ordersFixture = [
      { id: "1", belegnr: "BS-001", status: "offen",       name: "A", lieferantennummer: "L1", datum: "2026-01-01", gesamtsumme: "100.00" },
      { id: "2", belegnr: "BS-002", status: "freigegeben", name: "B", lieferantennummer: "L2", datum: "2026-01-02", gesamtsumme: "200.00" },
      { id: "3", belegnr: "BS-003", status: "bestellt",    name: "C", lieferantennummer: "L3", datum: "2026-01-03", gesamtsumme: "300.00" },
      { id: "4", belegnr: "BS-004", status: "angemahnt",   name: "D", lieferantennummer: "L4", datum: "2026-01-04", gesamtsumme: "400.00" },
      { id: "5", belegnr: "BS-005", status: "empfangen",   name: "E", lieferantennummer: "L5", datum: "2026-01-05", gesamtsumme: "500.00" },
    ];

    function mockBelegeListReturns(orders: any[]) {
      mockClient.legacyPost.mockImplementation((endpoint: string) => {
        if (endpoint === "BelegeList") {
          return Promise.resolve({ success: true, data: orders });
        }
        return Promise.resolve({ success: false, data: null });
      });
    }

    it("valid preset 'bestellt' reduces to orders with status=bestellt", async () => {
      mockBelegeListReturns(ordersFixture);

      const result = await handleProcurementTool(
        "openxe-list-purchase-orders",
        { status_preset: "bestellt" },
        mockClient as unknown as OpenXEClient,
      );

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.data).toHaveLength(1);
      expect(parsed.data[0].status).toBe("bestellt");
      expect(parsed.data[0].id).toBe("3");
    });

    it("valid aggregate preset 'aktiv' reduces to offen/freigegeben/bestellt/angemahnt", async () => {
      mockBelegeListReturns(ordersFixture);

      const result = await handleProcurementTool(
        "openxe-list-purchase-orders",
        { status_preset: "aktiv" },
        mockClient as unknown as OpenXEClient,
      );

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.data).toHaveLength(4);
      const statuses = parsed.data.map((d: any) => d.status).sort();
      expect(statuses).toEqual(["angemahnt", "bestellt", "freigegeben", "offen"]);
    });

    it("invalid preset 'ueberfaellige-lieferungen' returns isError with guidance to openxe-business-query", async () => {
      mockBelegeListReturns(ordersFixture);

      const result = await handleProcurementTool(
        "openxe-list-purchase-orders",
        { status_preset: "ueberfaellige-lieferungen" },
        mockClient as unknown as OpenXEClient,
      );

      expect(result.isError).toBe(true);
      const text = result.content[0].text;
      expect(text).toContain("Unbekanntes status_preset");
      expect(text).toContain("ueberfaellige-lieferungen");
      expect(text).toContain("offen");
      expect(text).toContain("aktiv");
      expect(text).toContain("openxe-business-query");

      // API must NOT have been hit at all.
      expect(mockClient.legacyPost).not.toHaveBeenCalled();
    });

    it("invalid preset 'garbage' returns isError and lists allowed values", async () => {
      mockBelegeListReturns(ordersFixture);

      const result = await handleProcurementTool(
        "openxe-list-purchase-orders",
        { status_preset: "garbage" },
        mockClient as unknown as OpenXEClient,
      );

      expect(result.isError).toBe(true);
      const text = result.content[0].text;
      expect(text).toContain("Unbekanntes status_preset");
      expect(text).toContain("garbage");
      // All STATUS_PRESETS.purchaseOrders keys must appear in the error text.
      for (const name of ["offen", "freigegeben", "bestellt", "angemahnt", "empfangen", "aktiv"]) {
        expect(text).toContain(name);
      }
      expect(mockClient.legacyPost).not.toHaveBeenCalled();
    });
  });

  describe("smart filters (object + string form)", () => {
    const ordersFixture = [
      { id: "1", belegnr: "BS-001", status: "offen",    name: "A", lieferantennummer: "L1", datum: "2026-01-01", gesamtsumme: "50.00"  },
      { id: "2", belegnr: "BS-002", status: "bestellt", name: "B", lieferantennummer: "L2", datum: "2026-01-02", gesamtsumme: "150.00" },
      { id: "3", belegnr: "BS-003", status: "offen",    name: "C", lieferantennummer: "L3", datum: "2026-01-03", gesamtsumme: "250.00" },
    ];

    function mockBelegeListReturns(orders: any[]) {
      mockClient.legacyPost.mockImplementation((endpoint: string) => {
        if (endpoint === "BelegeList") {
          return Promise.resolve({ success: true, data: orders });
        }
        return Promise.resolve({ success: false, data: null });
      });
    }

    it("accepts object-form where {gesamtsumme:{gt:100}} (Zod parse passes, filter applies)", async () => {
      mockBelegeListReturns(ordersFixture);

      const result = await handleProcurementTool(
        "openxe-list-purchase-orders",
        { where: { gesamtsumme: { gt: 100 } } },
        mockClient as unknown as OpenXEClient,
      );

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.data.map((d: any) => d.id).sort()).toEqual(["2", "3"]);
    });

    it("accepts string-form where (JSON) for backward-compat", async () => {
      mockBelegeListReturns(ordersFixture);

      const result = await handleProcurementTool(
        "openxe-list-purchase-orders",
        { where: JSON.stringify({ gesamtsumme: { gt: 100 } }) },
        mockClient as unknown as OpenXEClient,
      );

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.data.map((d: any) => d.id).sort()).toEqual(["2", "3"]);
    });

    it("accepts the documented legacy where-string 'field_operator_value' (gesamtsumme_gte_100)", async () => {
      // The schema promises this form explicitly. Before the parser was
      // wired up the handler ran JSON.parse and silently fell through to
      // `{}` (no filter), returning every fixture row.
      mockBelegeListReturns(ordersFixture);

      const result = await handleProcurementTool(
        "openxe-list-purchase-orders",
        { where: "gesamtsumme_gte_100" },
        mockClient as unknown as OpenXEClient,
      );

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.data.map((d: any) => d.id).sort()).toEqual(["2", "3"]);
    });

    it("accepts legacy where-string with the lte operator", async () => {
      mockBelegeListReturns(ordersFixture);

      const result = await handleProcurementTool(
        "openxe-list-purchase-orders",
        { where: "gesamtsumme_lte_100" },
        mockClient as unknown as OpenXEClient,
      );

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      // Only id "1" has gesamtsumme <= 100 in the fixture.
      expect(parsed.data.map((d: any) => d.id)).toEqual(["1"]);
    });

    it("accepts array-form fields ['belegnr','gesamtsumme']", async () => {
      mockBelegeListReturns(ordersFixture);

      const result = await handleProcurementTool(
        "openxe-list-purchase-orders",
        { fields: ["belegnr", "gesamtsumme"] },
        mockClient as unknown as OpenXEClient,
      );

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      for (const row of parsed.data) {
        expect(Object.keys(row).sort()).toEqual(["belegnr", "gesamtsumme"]);
      }
    });

    it("accepts comma-string fields 'belegnr,gesamtsumme' (backward-compat)", async () => {
      mockBelegeListReturns(ordersFixture);

      const result = await handleProcurementTool(
        "openxe-list-purchase-orders",
        { fields: "belegnr,gesamtsumme" },
        mockClient as unknown as OpenXEClient,
      );

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      for (const row of parsed.data) {
        expect(Object.keys(row).sort()).toEqual(["belegnr", "gesamtsumme"]);
      }
    });

    it("accepts object-form aggregate {sum:'gesamtsumme'}", async () => {
      mockBelegeListReturns(ordersFixture);

      const result = await handleProcurementTool(
        "openxe-list-purchase-orders",
        { aggregate: { sum: "gesamtsumme" } },
        mockClient as unknown as OpenXEClient,
      );

      expect(result.isError).toBeFalsy();
      // Aggregate path returns raw aggregation result (no _info/_hint wrapper).
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).not.toHaveProperty("data");
      expect(parsed).not.toHaveProperty("_info");
      // sum of 50 + 150 + 250 = 450
      const numeric = typeof parsed === "number" ? parsed : parsed.sum ?? parsed.value ?? parsed.result;
      expect(Number(numeric)).toBe(450);
    });

    it("accepts string-form aggregate 'sum_gesamtsumme' (backward-compat)", async () => {
      mockBelegeListReturns(ordersFixture);

      const result = await handleProcurementTool(
        "openxe-list-purchase-orders",
        { aggregate: "sum_gesamtsumme" },
        mockClient as unknown as OpenXEClient,
      );

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).not.toHaveProperty("data");
      const numeric = typeof parsed === "number" ? parsed : parsed.sum ?? parsed.value ?? parsed.result;
      expect(Number(numeric)).toBe(450);
    });
  });

  describe("BelegeList authoritative empty", () => {
    it("treats BelegeList success+empty as authoritative zero orders (no scan)", async () => {
      // When BelegeList answers successfully with an empty list, the helper
      // must NOT fall through to the iterative scan — the empty result is
      // authoritative. This prevents ~50 unnecessary BestellungGet calls on
      // instances with zero purchase orders.
      mockClient.legacyPost.mockImplementation((endpoint: string) => {
        if (endpoint === "BelegeList") {
          return Promise.resolve({ success: true, data: [] });
        }
        return Promise.resolve({ success: false, data: null });
      });

      const result = await handleProcurementTool(
        "openxe-list-purchase-orders",
        {},
        mockClient as unknown as OpenXEClient,
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.data).toHaveLength(0);
      expect(parsed._info).toContain("BelegeList");

      // Critical: BestellungGet must NOT have been called even once.
      const bestellungCalls = mockClient.legacyPost.mock.calls.filter(c => c[0] === "BestellungGet");
      expect(bestellungCalls).toHaveLength(0);
    });
  });

  // Regression tests for Task R: Discover-/Schema-Drift bei list-purchase-orders.
  // Der Router-Discover wirbt generisch fuer sort_field + sort_order sowie
  // format=csv-positions. Das Schema hatte urspruenglich nur `sort` als Einzel-
  // string und der Handler kannte sort_field nicht — diese Tests sichern den
  // Fix ab (Backward-Compat + neue gemeinsame Form).
  describe("sort drift fix (Task R)", () => {
    const ordersFixture = [
      { id: "1", belegnr: "BS-001", status: "offen",    name: "A", lieferantennummer: "L1", datum: "2026-01-01", gesamtsumme: "50.00"  },
      { id: "2", belegnr: "BS-002", status: "bestellt", name: "B", lieferantennummer: "L2", datum: "2026-01-02", gesamtsumme: "250.00" },
      { id: "3", belegnr: "BS-003", status: "offen",    name: "C", lieferantennummer: "L3", datum: "2026-01-03", gesamtsumme: "150.00" },
    ];

    function mockBelegeListReturns(orders: any[]) {
      mockClient.legacyPost.mockImplementation((endpoint: string) => {
        if (endpoint === "BelegeList") {
          return Promise.resolve({ success: true, data: orders });
        }
        return Promise.resolve({ success: false, data: null });
      });
    }

    it("sort_field + sort_order=desc sortiert nach gesamtsumme absteigend (gemeinsame Smart-Filter-Form)", async () => {
      mockBelegeListReturns(ordersFixture);

      const result = await handleProcurementTool(
        "openxe-list-purchase-orders",
        { sort_field: "gesamtsumme", sort_order: "desc" },
        mockClient as unknown as OpenXEClient,
      );

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      // 250 > 150 > 50 → IDs in Reihenfolge 2, 3, 1
      expect(parsed.data.map((d: any) => d.id)).toEqual(["2", "3", "1"]);
    });

    it("legacy sort='gesamtsumme_desc' funktioniert weiterhin (Backward-Compat)", async () => {
      mockBelegeListReturns(ordersFixture);

      const result = await handleProcurementTool(
        "openxe-list-purchase-orders",
        { sort: "gesamtsumme_desc" },
        mockClient as unknown as OpenXEClient,
      );

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.data.map((d: any) => d.id)).toEqual(["2", "3", "1"]);
    });

    it("format='csv-positions' faellt auf JSON-Default zurueck (purchase-orders unterstuetzt kein csv-positions)", async () => {
      mockBelegeListReturns(ordersFixture);

      const result = await handleProcurementTool(
        "openxe-list-purchase-orders",
        { format: "csv-positions" },
        mockClient as unknown as OpenXEClient,
      );

      expect(result.isError).toBeFalsy();
      // Weder CSV-Header noch Positions-Struktur — es muss ein JSON-Objekt
      // mit dem ueblichen _info/data-Wrapper sein.
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveProperty("_info");
      expect(parsed).toHaveProperty("data");
      expect(parsed.data).toHaveLength(3);
    });
  });

  // Regression tests for Task Q (Finding 1): plain-text formats (table/csv/ids)
  // must honor MAX_LIST_RESULTS just like JSON does. Before the fix the format
  // branches returned raw text BEFORE truncateWithWarning ran, so format=csv
  // without an explicit limit could dump up to FETCH_ALL_SAFETY_CAP=10000 rows.
  describe("plain-text formats honor MAX_LIST_RESULTS (Task Q Finding 1)", () => {
    /** Build N purchase-order records that all pass the DEL filter. */
    function makeOrders(count: number) {
      const rows: any[] = [];
      for (let i = 1; i <= count; i++) {
        rows.push({
          id: String(i),
          belegnr: `BS-${String(i).padStart(4, "0")}`,
          status: "offen",
          name: `Lieferant ${i}`,
          lieferantennummer: `L${i}`,
          datum: "2026-01-01",
          lieferdatum: "2026-02-01",
          gesamtsumme: "100.00",
          waehrung: "EUR",
          einkaeufer: "EK",
        });
      }
      return rows;
    }

    function mockBelegeListReturns(orders: any[]) {
      mockClient.legacyPost.mockImplementation((endpoint: string) => {
        if (endpoint === "BelegeList") {
          return Promise.resolve({ success: true, data: orders });
        }
        return Promise.resolve({ success: false, data: null });
      });
    }

    it("format=csv without limit: content[0] has exactly 50 data rows + header, content[1] is WARNUNG", async () => {
      // 60 purchase orders, no limit -> MAX_LIST_RESULTS (50) must cap the
      // output. Previously the csv branch returned all 60 rows verbatim.
      mockBelegeListReturns(makeOrders(60));

      const result = await handleProcurementTool(
        "openxe-list-purchase-orders",
        { format: "csv" },
        mockClient as unknown as OpenXEClient,
      );

      // Two TextContent items: the CSV body and the cap warning.
      expect(result.content).toHaveLength(2);
      const csv = result.content[0].text;
      // Count lines: 1 header + 50 data rows = 51 lines total. formatAsCsv
      // emits one line per record, semicolon-separated, joined by \n.
      const lines = csv.split(/\r?\n/).filter((l: string) => l.length > 0);
      expect(lines.length).toBe(51);
      // content[0] must stay a clean CSV — no WARNUNG polluting the stream.
      expect(csv).not.toMatch(/WARNUNG/);
      // content[1] is the abbreviation warning.
      expect(result.content[1].text).toMatch(/WARNUNG.*50.*abgeschnitten/);
    });

    it("format=table without limit: appends WARNUNG as content[1] when >MAX_LIST_RESULTS", async () => {
      mockBelegeListReturns(makeOrders(60));

      const result = await handleProcurementTool(
        "openxe-list-purchase-orders",
        { format: "table" },
        mockClient as unknown as OpenXEClient,
      );

      expect(result.content).toHaveLength(2);
      expect(result.content[0].text).not.toMatch(/WARNUNG/);
      expect(result.content[1].text).toMatch(/WARNUNG.*abgeschnitten/);
    });

    it("format=csv with limit=150 and 200 records: all 150 in output, warning says 150", async () => {
      // User limit 150 > MAX_LIST_RESULTS (50), so effectiveMax = 150. Output
      // must contain 150 data rows, and the warning must reflect the user cap,
      // not the default 50.
      mockBelegeListReturns(makeOrders(200));

      const result = await handleProcurementTool(
        "openxe-list-purchase-orders",
        { format: "csv", limit: 150 },
        mockClient as unknown as OpenXEClient,
      );

      expect(result.content).toHaveLength(2);
      const csv = result.content[0].text;
      const lines = csv.split(/\r?\n/).filter((l: string) => l.length > 0);
      // 1 header + 150 data rows = 151 lines total.
      expect(lines.length).toBe(151);
      expect(result.content[1].text).toMatch(/WARNUNG.*150.*abgeschnitten/);
      // The default 50 cap must NOT leak into the warning.
      expect(result.content[1].text).not.toMatch(/nach 50/);
    });
  });
});
