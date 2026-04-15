import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenXEClient } from "../../src/client/openxe-client.js";
import {
  handleReportTool,
  dateToQuarter,
} from "../../src/tools/report-tools.js";
import { parseLocalDate } from "../../src/utils/local-date.js";

/**
 * Regression tests for the UTC-vs-local date-string parsing bug.
 *
 * `new Date("2026-04-01")` parses as UTC midnight; under negative-offset
 * timezones (e.g. America/New_York) it lands on the previous local day.
 * The fix: `parseLocalDate()` constructs at local midnight. These tests
 * pin down the behavior end-to-end through the report tools.
 */
describe("Report Tools", () => {
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

  afterEach(() => {
    vi.useRealTimers();
  });

  // --- dateToQuarter ---

  describe("dateToQuarter", () => {
    it("maps 2026-04-01 (quarter boundary) to Q2 2026", () => {
      expect(dateToQuarter("2026-04-01")).toBe("Q2 2026");
    });

    it("maps 2026-03-31 (last day of Q1) to Q1 2026", () => {
      expect(dateToQuarter("2026-03-31")).toBe("Q1 2026");
    });

    it("maps all month boundaries correctly", () => {
      const expected = [
        "Q1 2026", "Q1 2026", "Q1 2026",
        "Q2 2026", "Q2 2026", "Q2 2026",
        "Q3 2026", "Q3 2026", "Q3 2026",
        "Q4 2026", "Q4 2026", "Q4 2026",
      ];
      for (let m = 1; m <= 12; m++) {
        const mm = String(m).padStart(2, "0");
        expect(dateToQuarter(`2026-${mm}-01`)).toBe(expected[m - 1]);
      }
    });

    it("uses parseLocalDate so result matches local-midnight semantics", () => {
      // parseLocalDate("2026-04-01") -> local midnight April 1
      const d = parseLocalDate("2026-04-01");
      expect(d.getMonth()).toBe(3); // April
      expect(d.getDate()).toBe(1);
      // and dateToQuarter agrees
      expect(dateToQuarter("2026-04-01")).toBe("Q2 2026");
    });

    it("tolerates an ISO datetime by slicing to YYYY-MM-DD", () => {
      expect(dateToQuarter("2026-04-01T12:00:00")).toBe("Q2 2026");
    });
  });

  // --- Integration: Revenue report groupBy quartal ---

  describe("handleRevenueReport groupBy=quartal", () => {
    it("puts an invoice dated 2026-04-01 into Q2 2026, not Q1", async () => {
      // Pin "now" so the default zeitraum-less call doesn't matter, and set a
      // wide year zeitraum so April 1 is included.
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0)); // June 15 2026 local

      mockClient.get.mockResolvedValue({
        data: [
          {
            id: 1,
            belegnr: "RE-001",
            datum: "2026-04-01",
            soll: "1000.00",
            status: "freigegeben",
          },
        ],
      });

      const result = await handleReportTool(
        "openxe-report-revenue",
        { groupBy: "quartal", zeitraum: "2026" },
        mockClient as unknown as OpenXEClient
      );

      const text = result.content[0].text;
      expect(text).toContain("Q2 2026");
      expect(text).not.toContain("Q1 2026");
    });
  });

  // --- Integration: Open items report mode=liste ---

  describe("handleOpenItemsReport mode=liste", () => {
    it("computes faellig_am = 2026-05-01 for datum 2026-04-01 + 30 days", async () => {
      // Pin "today" so ueberfaellig_tage is deterministic.
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 3, 15, 12, 0, 0)); // April 15 2026 local

      mockClient.get.mockResolvedValue({
        data: [
          {
            id: 1,
            belegnr: "RE-100",
            name: "Test Kunde",
            kundennummer: "K-1",
            datum: "2026-04-01",
            zahlungszieltage: "30",
            soll: "500.00",
            ist: "0.00",
            status: "freigegeben",
          },
        ],
      });

      const result = await handleReportTool(
        "openxe-report-open-items",
        { mode: "liste" },
        mockClient as unknown as OpenXEClient
      );

      const text = result.content[0].text;
      // The critical regression: 2026-04-01 + 30d must be 2026-05-01,
      // not 2026-04-30 (which is what `new Date("2026-04-01")` produces
      // under negative-offset TZs).
      expect(text).toContain("2026-05-01");
      expect(text).not.toMatch(/2026-04-30/);
      // ueberfaellig_tage for due=May 1 vs today=April 15 must be 0.
      // Find the data row and check the ueberfaellig_tage column.
      const lines = text.split("\n");
      const dataLine = lines.find((l) => l.includes("RE-100"));
      expect(dataLine).toBeDefined();
      // Columns: belegnr | kunde | datum | faellig_am | soll | ist | offen | ueberfaellig_tage | mahnwesen
      const cells = dataLine!.split("|").map((c) => c.trim());
      // ueberfaellig_tage is index 7
      expect(cells[7]).toBe("0");
    });
  });

  // --- Integration: Open items report mode=altersstruktur ---

  describe("handleOpenItemsReport mode=altersstruktur", () => {
    it("assigns bucket correctly at exact 30-day overdue boundary", async () => {
      // Pin today to May 1 2026. Invoice datum 2026-03-01 + 30d payment terms
      // -> faellig 2026-03-31. Today is May 1 -> 31 days overdue -> "31-60 Tage".
      //
      // With the UTC-bug a neg-offset host would compute faellig as 2026-03-30
      // (one day earlier), making the test assert on a wrong boundary. Pinning
      // the bucket at 31 days guarantees we're exercising the bug.
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 4, 1, 12, 0, 0)); // May 1 2026 local

      mockClient.get.mockResolvedValue({
        data: [
          {
            id: 1,
            belegnr: "RE-A",
            name: "A",
            kundennummer: "K-A",
            datum: "2026-03-01",
            zahlungszieltage: "30",
            soll: "100.00",
            ist: "0.00",
            status: "freigegeben",
          },
          {
            id: 2,
            belegnr: "RE-B",
            name: "B",
            kundennummer: "K-B",
            datum: "2026-04-01",
            zahlungszieltage: "30",
            soll: "200.00",
            ist: "0.00",
            status: "freigegeben",
          },
        ],
      });

      const result = await handleReportTool(
        "openxe-report-open-items",
        { mode: "altersstruktur" },
        mockClient as unknown as OpenXEClient
      );

      const text = result.content[0].text;
      // RE-A: faellig 2026-03-31, today 2026-05-01 -> 31 days overdue -> "31-60 Tage"
      // RE-B: faellig 2026-05-01, today 2026-05-01 -> 0 days -> "aktuell"
      const lines = text.split("\n");
      const bucketLine = (name: string) => lines.find((l) => l.includes(name));

      // Parse a row: bucket | anzahl | summe_offen
      const parseRow = (line: string) => {
        const cells = line.split("|").map((c) => c.trim());
        return { bucket: cells[0], anzahl: cells[1], summe: cells[2] };
      };

      const aktuellRow = parseRow(bucketLine("aktuell")!);
      const bucket31_60 = parseRow(bucketLine("31-60 Tage")!);

      expect(aktuellRow.anzahl).toBe("1");
      expect(aktuellRow.summe).toBe("200");
      expect(bucket31_60.anzahl).toBe("1");
      expect(bucket31_60.summe).toBe("100");
    });
  });
});
