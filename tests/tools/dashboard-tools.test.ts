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

    it("schema has kpi enum with all 11 KPIs", () => {
      const schema = DASHBOARD_TOOL_DEFINITIONS[0].inputSchema as any;
      expect(schema.properties.kpi.enum).toHaveLength(11);
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

    // Regression: before the localDateString migration, toISOString() on a
    // local-constructed Date at local-midnight+offset produced the previous
    // UTC day. Here we pick a moment that is unambiguously local 2026-04-01
    // under the host timezone (via local constructor), so the helpers must
    // yield 2026-04-01 regardless of host TZ.
    //
    // IMPORTANT: These tests are skipped on pure-UTC hosts (common default in
    // CI). Under UTC both the old toISOString()-based impl and the new
    // localDateString() impl return the same string, so the regression is
    // vacuous. Run locally with TZ=Europe/Berlin (or any non-zero offset) to
    // actually exercise the bug reproduction.
    const isUtcHost = new Date().getTimezoneOffset() === 0;
    describe.skipIf(isUtcHost)("local-date regression (timezone)", () => {
      const localMidnightPlus30 = new Date(2026, 3, 1, 0, 30, 0, 0);

      it("today returns local calendar day at local 00:30", () => {
        expect(today(localMidnightPlus30)).toBe("2026-04-01");
      });

      it("monthStart returns local first-of-month at local 00:30", () => {
        expect(monthStart(localMidnightPlus30)).toBe("2026-04-01");
      });

      it("yearStart returns local Jan 1 at local 00:30", () => {
        expect(yearStart(localMidnightPlus30)).toBe("2026-01-01");
      });

      it("weekStart returns local Monday (of week containing local April 1)", () => {
        // April 1 2026 is a Wednesday, so Monday = March 30.
        expect(weekStart(localMidnightPlus30)).toBe("2026-03-30");
      });
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
    // Semantics updated: overdue = today > (datum + zahlungszieltage), not
    // a hardcoded 30-day window from the invoice date. NOW = 2026-04-01.
    it("filters by real due date (datum + zahlungszieltage)", async () => {
      mockClient.get.mockResolvedValue({
        data: [
          // due 2026-03-03 -> overdue (29 days past)
          { id: 1, soll: "1000.00", ist: "0.00", datum: "2026-02-01", zahlungszieltage: "30", belegnr: "RE-U01" },
          // due 2026-04-24 -> NOT yet due
          { id: 2, soll: "500.00", ist: "0.00", datum: "2026-03-25", zahlungszieltage: "30", belegnr: "RE-U02" },
          // partial payment; due 2026-02-14 -> overdue but only remainder counts
          { id: 3, soll: "800.00", ist: "200.00", datum: "2026-01-15", zahlungszieltage: "30", belegnr: "RE-U03" },
          // missing zahlungszieltage -> defaults to 30 -> due 2026-03-03 -> overdue
          { id: 4, soll: "400.00", ist: "0.00", datum: "2026-02-01", belegnr: "RE-U04" },
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
      // Overdue: id 1, 3, 4 (id 2 due date still in the future)
      expect(data.anzahl).toBe(3);
      // open amounts: 1000 + (800-200) + 400 = 2000
      expect(data.offener_betrag).toBe(2000);
      expect(data.basis).toBe("datum + zahlungszieltage");
    });

    it("Regression: long payment terms (60d) are NOT overdue after 35 days", async () => {
      // Old hardcoded-30-days logic would have flagged this as overdue.
      // With true due-date logic, an invoice from 2026-02-25 with
      // zahlungszieltage=60 is due 2026-04-26 — on NOW=2026-04-01 it is NOT overdue.
      mockClient.get.mockResolvedValue({
        data: [
          { id: 99, soll: "9999.00", ist: "0.00", datum: "2026-02-25", zahlungszieltage: "60", belegnr: "RE-U99" },
        ],
      });

      const result = await handleDashboardTool(
        "openxe-dashboard",
        { kpi: "ueberfaellige-rechnungen" },
        mockClient as unknown as OpenXEClient,
        NOW
      );

      const data = JSON.parse(result.content[0].text);
      expect(data.anzahl).toBe(0);
      expect(data.offener_betrag).toBe(0);
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
    it("counts addresses with non-empty kundennummer", async () => {
      mockClient.get.mockResolvedValue({
        data: [
          { id: 1, typ: "firma", name: "A", kundennummer: "KD10001" },
          { id: 2, typ: "firma", name: "B", kundennummer: "" },
          { id: 3, typ: "herr", name: "C", kundennummer: "KD10002" },
          { id: 4, typ: "frau", name: "D" },
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
      expect(data.label).toBe("aktive Kunden mit Kundennummer");
    });

    it("excludes DEL-prefixed kundennummern", async () => {
      mockClient.get.mockResolvedValue({
        data: [
          { id: 1, kundennummer: "KD10001", name: "Active" },
          { id: 2, kundennummer: "DEL-KD10002", name: "Deleted" },
          { id: 3, kundennummer: "KD10003", name: "Active2" },
        ],
      });

      const result = await handleDashboardTool(
        "openxe-dashboard",
        { kpi: "kunden-anzahl" },
        mockClient as unknown as OpenXEClient,
        NOW
      );

      const data = JSON.parse(result.content[0].text);
      expect(data.wert).toBe(2);
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
