import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  BUSINESS_QUERY_TOOL_DEFINITION,
  handleBusinessQueryTool,
} from "../../src/tools/business-query-tools.js";
import { BUSINESS_PRESETS } from "../../src/utils/smart-filters.js";
import { OpenXEClient } from "../../src/client/openxe-client.js";

describe("Business Query Tools", () => {
  let mockClient: { get: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockClient = { get: vi.fn() };
  });

  /** Helper: mock paginated API response */
  function mockPaginatedGet(data: any[]) {
    mockClient.get.mockImplementation((_path: string, params?: Record<string, any>) => {
      const page = parseInt(params?.page ?? "1", 10);
      if (page === 1) {
        return Promise.resolve({ data, pagination: { page: 1, pages: 1 } });
      }
      return Promise.resolve({ data: [], pagination: undefined });
    });
  }

  // --- Tool Definition ---

  describe("tool definition", () => {
    it("has correct name", () => {
      expect(BUSINESS_QUERY_TOOL_DEFINITION.name).toBe("openxe-business-query");
    });

    it("has a description mentioning presets", () => {
      expect(BUSINESS_QUERY_TOOL_DEFINITION.description).toContain("offene");
      expect(BUSINESS_QUERY_TOOL_DEFINITION.description).toContain("Rechnungen");
    });

    it("has an inputSchema with preset enum", () => {
      const schema = BUSINESS_QUERY_TOOL_DEFINITION.inputSchema as any;
      expect(schema.properties.preset).toBeDefined();
    });
  });

  // --- BUSINESS_PRESETS ---

  describe("BUSINESS_PRESETS", () => {
    it("contains all 5 expected presets", () => {
      const keys = Object.keys(BUSINESS_PRESETS);
      expect(keys).toContain("nicht-versendet");
      expect(keys).toContain("ohne-tracking");
      expect(keys).toContain("offene-rechnungen");
      expect(keys).toContain("ueberfaellige-rechnungen");
      expect(keys).toContain("entwuerfe");
      expect(keys).toHaveLength(7);
    });

    it("each preset has required fields", () => {
      for (const [key, preset] of Object.entries(BUSINESS_PRESETS)) {
        expect(preset.entity, `${key}.entity`).toBeTruthy();
        expect(typeof preset.filter, `${key}.filter`).toBe("function");
        expect(Array.isArray(preset.defaultFields), `${key}.defaultFields`).toBe(true);
        expect(preset.defaultFields.length, `${key}.defaultFields.length`).toBeGreaterThan(0);
        expect(preset.description, `${key}.description`).toBeTruthy();
      }
    });
  });

  // --- nicht-versendet ---

  describe("preset: nicht-versendet", () => {
    it("fetches orders and filters to status=freigegeben", async () => {
      mockPaginatedGet([
        { id: 1, belegnr: "AU-001", name: "Kunde A", kundennummer: "K1", datum: "2026-01-01", gesamtsumme: "100.00", status: "freigegeben" },
        { id: 2, belegnr: "AU-002", name: "Kunde B", kundennummer: "K2", datum: "2026-01-02", gesamtsumme: "200.00", status: "versendet" },
        { id: 3, belegnr: "AU-003", name: "Kunde C", kundennummer: "K3", datum: "2026-01-03", gesamtsumme: "150.00", status: "freigegeben" },
      ]);

      const result = await handleBusinessQueryTool(
        { preset: "nicht-versendet" },
        mockClient as unknown as OpenXEClient
      );

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed._preset).toBe("nicht-versendet");
      expect(parsed.data).toHaveLength(2);
      expect(parsed.data[0].belegnr).toBe("AU-001");
      expect(parsed.data[1].belegnr).toBe("AU-003");
      // Should only have the default fields
      expect(parsed.data[0]).toHaveProperty("status");
      expect(parsed.data[0]).not.toHaveProperty("extra_field");
    });

    it("calls the correct API path for orders", async () => {
      mockPaginatedGet([]);

      await handleBusinessQueryTool(
        { preset: "nicht-versendet" },
        mockClient as unknown as OpenXEClient
      );

      expect(mockClient.get).toHaveBeenCalledWith(
        "/v1/belege/auftraege",
        expect.objectContaining({ page: "1" })
      );
    });
  });

  // --- ohne-tracking ---

  describe("preset: ohne-tracking", () => {
    it("fetches delivery notes and returns all (no client-side filter)", async () => {
      mockPaginatedGet([
        { id: 10, belegnr: "LS-001", name: "A", datum: "2026-01-01", status: "versendet", versandart: "DHL" },
        { id: 11, belegnr: "LS-002", name: "B", datum: "2026-01-02", status: "erstellt", versandart: "DPD" },
      ]);

      const result = await handleBusinessQueryTool(
        { preset: "ohne-tracking" },
        mockClient as unknown as OpenXEClient
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed._preset).toBe("ohne-tracking");
      expect(parsed.data).toHaveLength(2);
    });

    it("calls the correct API path for delivery notes", async () => {
      mockPaginatedGet([]);

      await handleBusinessQueryTool(
        { preset: "ohne-tracking" },
        mockClient as unknown as OpenXEClient
      );

      expect(mockClient.get).toHaveBeenCalledWith(
        "/v1/belege/lieferscheine",
        expect.objectContaining({ page: "1" })
      );
    });
  });

  // --- offene-rechnungen ---

  describe("preset: offene-rechnungen", () => {
    it("filters to unpaid invoices with belegnr", async () => {
      mockPaginatedGet([
        { id: 20, belegnr: "RE-001", name: "A", datum: "2026-01-01", soll: "500.00", ist: "0.00", zahlungsstatus: "offen" },
        { id: 21, belegnr: "RE-002", name: "B", datum: "2026-01-02", soll: "300.00", ist: "300.00", zahlungsstatus: "bezahlt" },
        { id: 22, belegnr: "", name: "C", datum: "2026-01-03", soll: "100.00", ist: "0.00", zahlungsstatus: "offen" },
        { id: 23, belegnr: "RE-003", name: "D", datum: "2026-01-04", soll: "200.00", ist: "0.00", zahlungsstatus: "offen" },
      ]);

      const result = await handleBusinessQueryTool(
        { preset: "offene-rechnungen" },
        mockClient as unknown as OpenXEClient
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.data).toHaveLength(2);
      expect(parsed.data[0].belegnr).toBe("RE-001");
      expect(parsed.data[1].belegnr).toBe("RE-003");
    });

    it("calls the correct API path for invoices", async () => {
      mockPaginatedGet([]);

      await handleBusinessQueryTool(
        { preset: "offene-rechnungen" },
        mockClient as unknown as OpenXEClient
      );

      expect(mockClient.get).toHaveBeenCalledWith(
        "/v1/belege/rechnungen",
        expect.objectContaining({ page: "1" })
      );
    });
  });

  // --- ueberfaellige-rechnungen ---

  describe("preset: ueberfaellige-rechnungen", () => {
    it("filters to invoices older than 30 days and unpaid", async () => {
      const oldDate = new Date(Date.now() - 60 * 86400000).toISOString().split("T")[0]; // 60 days ago
      const recentDate = new Date(Date.now() - 10 * 86400000).toISOString().split("T")[0]; // 10 days ago

      mockPaginatedGet([
        { id: 30, belegnr: "RE-010", name: "Old Unpaid", datum: oldDate, soll: "500.00", ist: "0.00", zahlungsstatus: "offen" },
        { id: 31, belegnr: "RE-011", name: "Recent Unpaid", datum: recentDate, soll: "300.00", ist: "0.00", zahlungsstatus: "offen" },
        { id: 32, belegnr: "RE-012", name: "Old Paid", datum: oldDate, soll: "200.00", ist: "200.00", zahlungsstatus: "bezahlt" },
        { id: 33, belegnr: "", name: "No Belegnr", datum: oldDate, soll: "100.00", ist: "0.00", zahlungsstatus: "offen" },
      ]);

      const result = await handleBusinessQueryTool(
        { preset: "ueberfaellige-rechnungen" },
        mockClient as unknown as OpenXEClient
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.data).toHaveLength(1);
      expect(parsed.data[0].belegnr).toBe("RE-010");
    });
  });

  // --- entwuerfe ---

  describe("preset: entwuerfe", () => {
    it("filters to invoices without belegnr or with status angelegt", async () => {
      mockPaginatedGet([
        { id: 40, belegnr: "", name: "Draft 1", datum: "2026-01-01", soll: "100.00", status: "offen" },
        { id: 41, belegnr: "RE-020", name: "Released", datum: "2026-01-02", soll: "200.00", status: "freigegeben" },
        { id: 42, belegnr: "RE-021", name: "Draft Status", datum: "2026-01-03", soll: "150.00", status: "angelegt" },
        { id: 43, name: "No Belegnr", datum: "2026-01-04", soll: "50.00", status: "offen" },
      ]);

      const result = await handleBusinessQueryTool(
        { preset: "entwuerfe" },
        mockClient as unknown as OpenXEClient
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.data).toHaveLength(3);
      // id 40: belegnr is ""
      // id 42: status is "angelegt"
      // id 43: no belegnr at all
      const ids = parsed.data.map((d: any) => d.id);
      expect(ids).toContain(40);
      expect(ids).toContain(42);
      expect(ids).toContain(43);
    });

    it("returns only default fields (no belegnr for drafts)", async () => {
      mockPaginatedGet([
        { id: 50, belegnr: "", name: "Draft", datum: "2026-01-01", soll: "100.00", status: "angelegt", kundennummer: "K999", extra: "should-not-appear" },
      ]);

      const result = await handleBusinessQueryTool(
        { preset: "entwuerfe" },
        mockClient as unknown as OpenXEClient
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.data[0]).toHaveProperty("id");
      expect(parsed.data[0]).toHaveProperty("name");
      expect(parsed.data[0]).toHaveProperty("datum");
      expect(parsed.data[0]).toHaveProperty("soll");
      expect(parsed.data[0]).toHaveProperty("status");
      expect(parsed.data[0]).not.toHaveProperty("kundennummer");
      expect(parsed.data[0]).not.toHaveProperty("extra");
    });
  });

  // --- Response format ---

  describe("response format", () => {
    it("includes _preset, _description, _info, and data fields", async () => {
      mockPaginatedGet([]);

      const result = await handleBusinessQueryTool(
        { preset: "offene-rechnungen" },
        mockClient as unknown as OpenXEClient
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed._preset).toBe("offene-rechnungen");
      expect(parsed._description).toBe(BUSINESS_PRESETS["offene-rechnungen"].description);
      expect(parsed._info).toContain("Ergebnisse");
      expect(parsed.data).toBeDefined();
      expect(Array.isArray(parsed.data)).toBe(true);
    });
  });

  // --- Error handling ---

  describe("error handling", () => {
    it("rejects invalid preset name via zod validation", async () => {
      await expect(
        handleBusinessQueryTool(
          { preset: "nonexistent" },
          mockClient as unknown as OpenXEClient
        )
      ).rejects.toThrow();
    });
  });
});
