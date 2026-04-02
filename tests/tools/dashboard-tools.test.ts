import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenXEClient } from "../../src/client/openxe-client.js";
import {
  handleDashboardTool,
  DASHBOARD_TOOL_DEFINITIONS,
  KPI_NAMES,
  monthStart,
  yearStart,
  weekStart,
  today,
  monthLabel,
  round2,
  sumField,
} from "../../src/tools/dashboard-tools.js";

// Fixed date for deterministic tests: Wednesday 2026-04-01
const NOW = new Date("2026-04-01T10:00:00Z");

describe("Dashboard Tools", () => {
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
      get: vi.fn().mockResolvedValue({ data: [] }),
      post: vi.fn().mockResolvedValue({ data: { id: 1 } }),
      put: vi.fn().mockResolvedValue({ data: { id: 1 } }),
      delete: vi.fn().mockResolvedValue({}),
      legacyPost: vi.fn().mockResolvedValue({ data: {}, success: true }),
      postForm: vi.fn().mockResolvedValue({ data: { id: 1 } }),
    };
  });

  // --- Tool definition ---

  describe("tool definition", () => {
    it("exports exactly one tool named openxe-dashboard", () => {
      expect(DASHBOARD_TOOL_DEFINITIONS).toHaveLength(1);
      expect(DASHBOARD_TOOL_DEFINITIONS[0].name).toBe("openxe-dashboard");
    });

    it("description mentions KPI names", () => {
      const desc = DASHBOARD_TOOL_DEFINITIONS[0].description;
      expect(desc).toContain("umsatz-monat");
      expect(desc).toContain("top-kunde");
      expect(desc).toContain("Token-effizient");
    });

    it("schema has kpi enum with all 9 KPIs", () => {
      const schema = DASHBOARD_TOOL_DEFINITIONS[0].inputSchema as any;
      expect(schema.properties.kpi.enum).toHaveLength(9);
      for (const name of KPI_NAMES) {
        expect(schema.properties.kpi.enum).toContain(name);
      }
    });
  });

  // --- Date helpers ---

  describe("date helpers", () => {
    it("monthStart returns first of current month", () => {
      expect(monthStart(NOW)).toBe("2026-04-01");
    });

    it("yearStart returns Jan 1 of current year", () => {
      expect(yearStart(NOW)).toBe("2026-01-01");
    });

    it("weekStart returns Monday of current week", () => {
      // 2026-04-01 is a Wednesday, so Monday = 2026-03-30
      expect(weekStart(NOW)).toBe("2026-03-30");
    });

    it("weekStart handles Sunday correctly", () => {
      const sunday = new Date("2026-04-05T10:00:00Z");
      expect(weekStart(sunday)).toBe("2026-03-30");
    });

    it("weekStart handles Monday correctly", () => {
      const monday = new Date("2026-03-30T10:00:00Z");
      expect(weekStart(monday)).toBe("2026-03-30");
    });

    it("today returns YYYY-MM-DD", () => {
      expect(today(NOW)).toBe("2026-04-01");
    });

    it("monthLabel returns German month + year", () => {
      expect(monthLabel(NOW)).toBe("April 2026");
    });
  });

  // --- Utility helpers ---

  describe("utility helpers", () => {
    it("sumField sums numeric field values", () => {
      const data = [{ soll: "100.50" }, { soll: "200.30" }, { soll: "50" }];
      expect(sumField(data, "soll")).toBeCloseTo(350.80);
    });

    it("sumField handles missing/NaN values gracefully", () => {
      const data = [{ soll: "100" }, { soll: "" }, { notSoll: "50" }];
      expect(sumField(data, "soll")).toBe(100);
    });

    it("round2 rounds to 2 decimals", () => {
      expect(round2(100.999)).toBe(101);
      expect(round2(0)).toBe(0);
    });
  });

  // --- KPI: umsatz-monat ---

  describe("umsatz-monat", () => {
    it("fetches invoices for current month and sums soll", async () => {
      mockClient.get.mockResolvedValue({
        data: [
          { id: 1, soll: "1000.00", datum: "2026-04-01", belegnr: "RE-001" },
          { id: 2, soll: "2500.50", datum: "2026-04-15", belegnr: "RE-002" },
        ],
      });

      const result = await handleDashboardTool(
        "openxe-dashboard",
        { kpi: "umsatz-monat" },
        mockClient as unknown as OpenXEClient,
        NOW
      );

      const data = JSON.parse(result.content[0].text);
      expect(data.kpi).toBe("umsatz-monat");
      expect(data.wert).toBe(3500.50);
      expect(data.waehrung).toBe("EUR");
      expect(data.zeitraum).toBe("April 2026");
      expect(data.basis).toBe("2 Rechnungen");
      expect(result.isError).toBeUndefined();
    });

    it("queries /v1/belege/rechnungen with date filters", async () => {
      mockClient.get.mockResolvedValue({ data: [] });

      await handleDashboardTool(
        "openxe-dashboard",
        { kpi: "umsatz-monat" },
        mockClient as unknown as OpenXEClient,
        NOW
      );

      expect(mockClient.get).toHaveBeenCalledWith(
        "/v1/belege/rechnungen",
        expect.objectContaining({
          datum_gte: "2026-04-01",
          datum_lte: "2026-04-01",
        })
      );
    });

    it("returns 0 when no invoices exist", async () => {
      mockClient.get.mockResolvedValue({ data: [] });

      const result = await handleDashboardTool(
        "openxe-dashboard",
        { kpi: "umsatz-monat" },
        mockClient as unknown as OpenXEClient,
        NOW
      );

      const data = JSON.parse(result.content[0].text);
      expect(data.wert).toBe(0);
      expect(data.basis).toBe("0 Rechnungen");
    });
  });

  // --- KPI: umsatz-jahr ---

  describe("umsatz-jahr", () => {
    it("fetches invoices for current year and sums soll", async () => {
      mockClient.get.mockResolvedValue({
        data: [
          { id: 1, soll: "10000.00", belegnr: "RE-Y01" },
          { id: 2, soll: "15000.00", belegnr: "RE-Y02" },
          { id: 3, soll: "5000.00", belegnr: "RE-Y03" },
        ],
      });

      const result = await handleDashboardTool(
        "openxe-dashboard",
        { kpi: "umsatz-jahr" },
        mockClient as unknown as OpenXEClient,
        NOW
      );

      const data = JSON.parse(result.content[0].text);
      expect(data.kpi).toBe("umsatz-jahr");
      expect(data.wert).toBe(30000);
      expect(data.zeitraum).toBe("2026");
      expect(data.basis).toBe("3 Rechnungen");
    });
  });

  // --- KPI: offene-auftraege ---

  describe("offene-auftraege", () => {
    it("counts orders with status=freigegeben", async () => {
      mockClient.get.mockResolvedValue({
        data: [
          { id: 1, status: "freigegeben", belegnr: "AU-001" },
          { id: 2, status: "freigegeben", belegnr: "AU-001" },
          { id: 3, status: "freigegeben", belegnr: "AU-001" },
        ],
      });

      const result = await handleDashboardTool(
        "openxe-dashboard",
        { kpi: "offene-auftraege" },
        mockClient as unknown as OpenXEClient,
        NOW
      );

      const data = JSON.parse(result.content[0].text);
      expect(data.kpi).toBe("offene-auftraege");
      expect(data.wert).toBe(3);
      expect(data.status).toBe("freigegeben");
    });

    it("queries /v1/belege/auftraege with status filter", async () => {
      mockClient.get.mockResolvedValue({ data: [] });

      await handleDashboardTool(
        "openxe-dashboard",
        { kpi: "offene-auftraege" },
        mockClient as unknown as OpenXEClient,
        NOW
      );

      expect(mockClient.get).toHaveBeenCalledWith(
        "/v1/belege/auftraege",
        expect.objectContaining({ status: "freigegeben" })
      );
    });
  });

  // --- KPI: offene-rechnungen ---

  describe("offene-rechnungen", () => {
    it("counts unpaid invoices and sums open amount", async () => {
      mockClient.get.mockResolvedValue({
        data: [
          { id: 1, soll: "1000.00", ist: "500.00", status: "freigegeben", belegnr: "AU-001" },
          { id: 2, soll: "2000.00", ist: "2000.00", status: "freigegeben", belegnr: "AU-001" },
          { id: 3, soll: "500.00", ist: "0.00", status: "freigegeben", belegnr: "AU-001" },
        ],
      });

      const result = await handleDashboardTool(
        "openxe-dashboard",
        { kpi: "offene-rechnungen" },
        mockClient as unknown as OpenXEClient,
        NOW
      );

      const data = JSON.parse(result.content[0].text);
      expect(data.kpi).toBe("offene-rechnungen");
      expect(data.anzahl).toBe(2);
      expect(data.offener_betrag).toBe(1000);
      expect(data.waehrung).toBe("EUR");
    });
  });

  // --- KPI: ueberfaellige-rechnungen ---

  describe("ueberfaellige-rechnungen", () => {
    it("filters invoices older than 30 days with open balance", async () => {
      mockClient.get.mockResolvedValue({
        data: [
          { id: 1, soll: "1000.00", ist: "0.00", datum: "2026-02-01", belegnr: "RE-U01" },
          { id: 2, soll: "500.00", ist: "0.00", datum: "2026-03-25", belegnr: "RE-U02" },
          { id: 3, soll: "800.00", ist: "200.00", datum: "2026-01-15", belegnr: "RE-U03" },
        ],
      });

      const result = await handleDashboardTool(
        "openxe-dashboard",
        { kpi: "ueberfaellige-rechnungen" },
        mockClient as unknown as OpenXEClient,
        NOW
      );

      const data = JSON.parse(result.content[0].text);
      expect(data.kpi).toBe("ueberfaellige-rechnungen");
      expect(data.anzahl).toBe(2);
      expect(data.offener_betrag).toBe(1600);
      expect(data.schwelle).toBe(">30 Tage");
    });
  });

  // --- KPI: top-kunde ---

  describe("top-kunde", () => {
    it("finds customer with highest invoice total this year", async () => {
      mockClient.get.mockResolvedValue({
        data: [
          { id: 1, kundennummer: "10001", name: "Alpha GmbH", soll: "5000.00", belegnr: "RE-Y03" },
          { id: 2, kundennummer: "10002", name: "Beta AG", soll: "8000.00" },
          { id: 3, kundennummer: "10001", name: "Alpha GmbH", soll: "3000.00" },
          { id: 4, kundennummer: "10002", name: "Beta AG", soll: "1000.00" },
        ],
      });

      const result = await handleDashboardTool(
        "openxe-dashboard",
        { kpi: "top-kunde" },
        mockClient as unknown as OpenXEClient,
        NOW
      );

      const data = JSON.parse(result.content[0].text);
      expect(data.kpi).toBe("top-kunde");
      expect(data.kundennummer).toBe("10002");
      expect(data.name).toBe("Beta AG");
      expect(data.umsatz).toBe(9000);
      expect(data.basis).toBe("2 Rechnungen");
      expect(data.zeitraum).toBe("2026");
    });

    it("handles no invoices gracefully", async () => {
      mockClient.get.mockResolvedValue({ data: [] });

      const result = await handleDashboardTool(
        "openxe-dashboard",
        { kpi: "top-kunde" },
        mockClient as unknown as OpenXEClient,
        NOW
      );

      const data = JSON.parse(result.content[0].text);
      expect(data.kundennummer).toBe("-");
      expect(data.umsatz).toBe(0);
    });
  });

  // --- KPI: auftragseingang-woche ---

  describe("auftragseingang-woche", () => {
    it("counts and sums orders from current week", async () => {
      mockClient.get.mockResolvedValue({
        data: [
          { id: 1, gesamtsumme: "1500.00", datum: "2026-03-30", belegnr: "AU-W01" },
          { id: 2, gesamtsumme: "2500.00", datum: "2026-04-01", belegnr: "AU-W02" },
        ],
      });

      const result = await handleDashboardTool(
        "openxe-dashboard",
        { kpi: "auftragseingang-woche" },
        mockClient as unknown as OpenXEClient,
        NOW
      );

      const data = JSON.parse(result.content[0].text);
      expect(data.kpi).toBe("auftragseingang-woche");
      expect(data.anzahl).toBe(2);
      expect(data.summe).toBe(4000);
      expect(data.waehrung).toBe("EUR");
      expect(data.zeitraum).toContain("2026-03-30");
    });
  });

  // --- KPI: artikel-anzahl ---

  describe("artikel-anzahl", () => {
    it("counts active articles (inaktiv != 1)", async () => {
      mockClient.get.mockResolvedValue({
        data: [
          { id: 1, nummer: "ART-001", inaktiv: "0" },
          { id: 2, nummer: "ART-002", inaktiv: "1" },
          { id: 3, nummer: "ART-003", inaktiv: "0" },
          { id: 4, nummer: "ART-004" },
        ],
      });

      const result = await handleDashboardTool(
        "openxe-dashboard",
        { kpi: "artikel-anzahl" },
        mockClient as unknown as OpenXEClient,
        NOW
      );

      const data = JSON.parse(result.content[0].text);
      expect(data.kpi).toBe("artikel-anzahl");
      expect(data.wert).toBe(3);
      expect(data.gesamt).toBe(4);
    });
  });

  // --- KPI: kunden-anzahl ---

  describe("kunden-anzahl", () => {
    it("counts addresses with typ containing kunde", async () => {
      mockClient.get.mockResolvedValue({
        data: [
          { id: 1, typ: "kunde", name: "A" },
          { id: 2, typ: "lieferant", name: "B" },
          { id: 3, typ: "kunde", name: "C" },
          { id: 4, typ: "mitarbeiter", name: "D" },
        ],
      });

      const result = await handleDashboardTool(
        "openxe-dashboard",
        { kpi: "kunden-anzahl" },
        mockClient as unknown as OpenXEClient,
        NOW
      );

      const data = JSON.parse(result.content[0].text);
      expect(data.kpi).toBe("kunden-anzahl");
      expect(data.wert).toBe(2);
      expect(data.gesamt).toBe(4);
    });
  });

  // --- Error handling ---

  describe("error handling", () => {
    it("returns error for unknown tool name", async () => {
      const result = await handleDashboardTool(
        "openxe-unknown",
        { kpi: "umsatz-monat" },
        mockClient as unknown as OpenXEClient,
        NOW
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Unknown dashboard tool");
    });

    it("throws for invalid KPI name", async () => {
      await expect(
        handleDashboardTool(
          "openxe-dashboard",
          { kpi: "invalid-kpi" },
          mockClient as unknown as OpenXEClient,
          NOW
        )
      ).rejects.toThrow();
    });

    it("throws when kpi parameter is missing", async () => {
      await expect(
        handleDashboardTool(
          "openxe-dashboard",
          {},
          mockClient as unknown as OpenXEClient,
          NOW
        )
      ).rejects.toThrow();
    });
  });

  // --- Response format ---

  describe("response format", () => {
    it("returns compact JSON (no pretty-printing) for token efficiency", async () => {
      mockClient.get.mockResolvedValue({ data: [] });

      const result = await handleDashboardTool(
        "openxe-dashboard",
        { kpi: "umsatz-monat" },
        mockClient as unknown as OpenXEClient,
        NOW
      );

      const text = result.content[0].text;
      expect(text).not.toContain("\n");
      expect(() => JSON.parse(text)).not.toThrow();
    });

    it("each KPI returns a parseable JSON object", async () => {
      mockClient.get.mockResolvedValue({ data: [] });

      for (const kpi of KPI_NAMES) {
        const result = await handleDashboardTool(
          "openxe-dashboard",
          { kpi },
          mockClient as unknown as OpenXEClient,
          NOW
        );

        const data = JSON.parse(result.content[0].text);
        expect(data.kpi).toBe(kpi);
        expect(result.isError).toBeUndefined();
      }
    });
  });

  // --- Router integration ---

  describe("router integration", () => {
    it("can be called via router action dashboard", async () => {
      const { ACTION_REGISTRY } = await import("../../src/tools/router.js");
      const dashboardEntry = ACTION_REGISTRY.find((e: any) => e.action === "dashboard");

      expect(dashboardEntry).toBeDefined();
      expect(dashboardEntry!.handler).toBe("dashboard");
      expect(dashboardEntry!.toolName).toBe("openxe-dashboard");
      expect(dashboardEntry!.category).toBe("dashboard");
    });

    it("dashboard category appears in discover", async () => {
      const { handleDiscover } = await import("../../src/tools/router.js");
      const result = handleDiscover({ category: "dashboard" });
      const text = result.content[0].text;

      expect(text).toContain("=== Dashboard ===");
      expect(text).toContain("dashboard");
      expect(text).toContain("KPI abrufen");
    });
  });
});
