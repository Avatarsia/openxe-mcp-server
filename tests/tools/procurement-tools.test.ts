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
});
