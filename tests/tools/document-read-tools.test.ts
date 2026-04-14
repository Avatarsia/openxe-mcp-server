import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleDocumentReadTool,
  DOCUMENT_READ_TOOL_DEFINITIONS,
} from "../../src/tools/document-read-tools.js";
import { OpenXEClient } from "../../src/client/openxe-client.js";

describe("Document Read Tools", () => {
  let mockClient: { get: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockClient = { get: vi.fn() };
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

  it("defines all 10 expected document-read tools", () => {
    const names = DOCUMENT_READ_TOOL_DEFINITIONS.map((t) => t.name);
    expect(names).toContain("openxe-list-quotes");
    expect(names).toContain("openxe-get-quote");
    expect(names).toContain("openxe-list-orders");
    expect(names).toContain("openxe-get-order");
    expect(names).toContain("openxe-list-invoices");
    expect(names).toContain("openxe-get-invoice");
    expect(names).toContain("openxe-list-delivery-notes");
    expect(names).toContain("openxe-get-delivery-note");
    expect(names).toContain("openxe-list-credit-memos");
    expect(names).toContain("openxe-get-credit-memo");
    expect(names).toHaveLength(10);
  });

  it("lists orders with filters via GET /v1/belege/auftraege", async () => {
    mockPaginatedGet([{ id: 1, belegnr: "AU-2026-0001" }]);

    const result = await handleDocumentReadTool(
      "openxe-list-orders",
      { kundennummer: "K1000", status: "freigegeben" },
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.get).toHaveBeenCalledWith("/v1/belege/auftraege", {
      kundennummer: "K1000",
      status: "freigegeben",
      page: "1",
      items: "100",
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed._info).toContain("1 Ergebnisse");
    expect(parsed._hint).toContain("openxe-get-order");
    expect(parsed.data).toHaveLength(1);
    expect(parsed.data[0].belegnr).toBe("AU-2026-0001");
  });

  it("gets a single invoice by ID with include", async () => {
    mockClient.get.mockResolvedValue({
      data: { id: 42, belegnr: "RE-2026-0010", positionen: [] },
    });

    const result = await handleDocumentReadTool(
      "openxe-get-invoice",
      { id: 42, include: "positionen,protokoll" },
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.get).toHaveBeenCalledWith("/v1/belege/rechnungen/42", {
      include: "positionen,protokoll",
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.id).toBe(42);
    expect(parsed.belegnr).toBe("RE-2026-0010");
  });

  it("lists quotes without filters", async () => {
    mockPaginatedGet([]);

    const result = await handleDocumentReadTool(
      "openxe-list-quotes",
      {},
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.get).toHaveBeenCalledWith("/v1/belege/angebote", {
      page: "1",
      items: "100",
    });
    expect(result.isError).toBeUndefined();
  });

  it("gets a delivery note by ID", async () => {
    mockClient.get.mockResolvedValue({
      data: { id: 7, belegnr: "LS-2026-0003" },
    });

    const result = await handleDocumentReadTool(
      "openxe-get-delivery-note",
      { id: 7 },
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.get).toHaveBeenCalledWith("/v1/belege/lieferscheine/7", {});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.belegnr).toBe("LS-2026-0003");
  });

  it("lists credit memos with date range filter", async () => {
    mockPaginatedGet([{ id: 5, belegnr: "GS-2026-0001" }]);

    const result = await handleDocumentReadTool(
      "openxe-list-credit-memos",
      { datum_gte: "2026-01-01", datum_lte: "2026-03-31" },
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.get).toHaveBeenCalledWith("/v1/belege/gutschriften", {
      datum_gte: "2026-01-01",
      datum_lte: "2026-03-31",
      page: "1",
      items: "100",
    });
  });

  it("returns error for unknown tool name", async () => {
    const result = await handleDocumentReadTool(
      "openxe-unknown-tool",
      {},
      mockClient as unknown as OpenXEClient
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Unknown");
  });

  // --- status_preset integration tests ---

  it("filters invoices by status_preset='offen' (excludes bezahlt)", async () => {
    mockPaginatedGet([
      { id: 1, belegnr: "RE-001", zahlungsstatus: "offen", name: "A", kundennummer: "K1" },
      { id: 2, belegnr: "RE-002", zahlungsstatus: "bezahlt", name: "B", kundennummer: "K2" },
      { id: 3, belegnr: "RE-003", zahlungsstatus: "offen", name: "C", kundennummer: "K3" },
    ]);

    const result = await handleDocumentReadTool(
      "openxe-list-invoices",
      { status_preset: "offen" },
      mockClient as unknown as OpenXEClient
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data).toHaveLength(2);
    expect(parsed.data.map((d) => d.id)).toEqual([1, 3]);
    expect(parsed._info).toContain("status_preset: offen");
  });

  it("filters invoices by status_preset='bezahlt'", async () => {
    mockPaginatedGet([
      { id: 1, belegnr: "RE-001", zahlungsstatus: "offen", name: "A", kundennummer: "K1" },
      { id: 2, belegnr: "RE-002", zahlungsstatus: "bezahlt", name: "B", kundennummer: "K2" },
    ]);

    const result = await handleDocumentReadTool(
      "openxe-list-invoices",
      { status_preset: "bezahlt" },
      mockClient as unknown as OpenXEClient
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data).toHaveLength(1);
    expect(parsed.data[0].id).toBe(2);
  });

  it("filters orders by status_preset='offen' (only freigegeben)", async () => {
    mockPaginatedGet([
      { id: 1, belegnr: "AU-001", status: "freigegeben", name: "A", kundennummer: "K1" },
      { id: 2, belegnr: "AU-002", status: "abgeschlossen", name: "B", kundennummer: "K2" },
      { id: 3, belegnr: "AU-003", status: "angelegt", name: "C", kundennummer: "K3" },
    ]);

    const result = await handleDocumentReadTool(
      "openxe-list-orders",
      { status_preset: "offen" },
      mockClient as unknown as OpenXEClient
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data).toHaveLength(1);
    expect(parsed.data[0].id).toBe(1);
  });

  it("filters quotes by status_preset='offen' (freigegeben or angelegt)", async () => {
    mockPaginatedGet([
      { id: 1, belegnr: "AN-001", status: "freigegeben", name: "A", kundennummer: "K1" },
      { id: 2, belegnr: "AN-002", status: "angelegt", name: "B", kundennummer: "K2" },
      { id: 3, belegnr: "AN-003", status: "abgelehnt", name: "C", kundennummer: "K3" },
    ]);

    const result = await handleDocumentReadTool(
      "openxe-list-quotes",
      { status_preset: "offen" },
      mockClient as unknown as OpenXEClient
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data).toHaveLength(2);
    expect(parsed.data.map((d) => d.id)).toEqual([1, 2]);
  });

  it("ignores unknown status_preset and returns all records", async () => {
    mockPaginatedGet([
      { id: 1, belegnr: "RE-001", zahlungsstatus: "offen", name: "A", kundennummer: "K1" },
      { id: 2, belegnr: "RE-002", zahlungsstatus: "bezahlt", name: "B", kundennummer: "K2" },
    ]);

    const result = await handleDocumentReadTool(
      "openxe-list-invoices",
      { status_preset: "nonexistent" },
      mockClient as unknown as OpenXEClient
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data).toHaveLength(2);
  });

  // --- csv-positions: per-position filter + truncation warning ---

  describe("csv-positions format", () => {
    it("reduces positionen to entries matching positionen.*-where clauses", async () => {
      mockPaginatedGet([
        {
          id: 1,
          belegnr: "RE-001",
          kundennummer: "K1",
          datum: "2026-01-01",
          positionen: [
            { nummer: "ART-001", bezeichnung: "Match", menge: "2", preis: "10" },
            { nummer: "ART-999", bezeichnung: "Other", menge: "1", preis: "5" },
          ],
        },
        {
          id: 2,
          belegnr: "RE-002",
          kundennummer: "K2",
          datum: "2026-01-02",
          positionen: [
            { nummer: "ART-001", bezeichnung: "Match2", menge: "3", preis: "20" },
          ],
        },
      ]);

      const result = await handleDocumentReadTool(
        "openxe-list-invoices",
        {
          format: "csv-positions",
          where: { "positionen.nummer": { containsAny: ["ART-001"] } },
        },
        mockClient as unknown as OpenXEClient
      );

      const csv = result.content[0].text;
      const lines = csv.split("\n");
      // header + 2 rows (only matching positions)
      expect(lines).toHaveLength(3);
      expect(lines[0]).toContain("nummer");
      expect(csv).toContain("ART-001");
      expect(csv).not.toContain("ART-999");
      expect(csv).not.toContain("Other");
    });

    it("exports all positions when no positionen.*-where clauses are given", async () => {
      mockPaginatedGet([
        {
          id: 1,
          belegnr: "RE-001",
          kundennummer: "K1",
          datum: "2026-01-01",
          positionen: [
            { nummer: "ART-001", bezeichnung: "A", menge: "1", preis: "10" },
            { nummer: "ART-002", bezeichnung: "B", menge: "1", preis: "20" },
          ],
        },
      ]);

      const result = await handleDocumentReadTool(
        "openxe-list-invoices",
        { format: "csv-positions" },
        mockClient as unknown as OpenXEClient
      );

      const csv = result.content[0].text;
      const lines = csv.split("\n");
      expect(lines).toHaveLength(3); // header + 2 positions
      expect(csv).toContain("ART-001");
      expect(csv).toContain("ART-002");
    });

    it("appends a trailing WARNUNG line when the fetch was truncated", async () => {
      // Simulate a fetchAll run that hits FETCH_ALL_SAFETY_CAP (10000).
      // Page 1 returns 10000 items, subsequent pages are never reached because
      // the safety-cap break triggers first. This sets meta.truncated=true.
      const bulk = Array.from({ length: 10000 }, (_, i) => ({
        id: i + 1,
        belegnr: `RE-${i + 1}`,
        kundennummer: "K1",
        datum: "2026-01-01",
        positionen: [{ nummer: "ART-X", bezeichnung: "X", menge: "1", preis: "1" }],
      }));
      mockClient.get.mockImplementation((_path: string, params?: Record<string, any>) => {
        const page = parseInt(params?.page ?? "1", 10);
        if (page === 1) {
          return Promise.resolve({ data: bulk, pagination: undefined });
        }
        return Promise.resolve({ data: [], pagination: undefined });
      });

      const result = await handleDocumentReadTool(
        "openxe-list-invoices",
        {
          format: "csv-positions",
          // a where-clause is required to trigger fetchAll; use a match-all one
          where: { "positionen.nummer": { containsAny: ["ART-X"] } },
        },
        mockClient as unknown as OpenXEClient
      );

      const csv = result.content[0].text;
      // Warning is appended after the CSV body so stricter CSV parsers
      // (Excel, pandas default) still see a clean header as line 1.
      const firstLine = csv.split("\n", 1)[0];
      expect(firstLine.startsWith("#")).toBe(false);
      expect(csv).toMatch(/\n\nWARNUNG: Safety-Cap .* 10000 /);
    });
  });

  it("ignores status_preset for entities without presets (delivery-notes)", async () => {
    mockPaginatedGet([
      { id: 1, belegnr: "LS-001", status: "freigegeben", name: "A", kundennummer: "K1" },
      { id: 2, belegnr: "LS-002", status: "angelegt", name: "B", kundennummer: "K2" },
    ]);

    const result = await handleDocumentReadTool(
      "openxe-list-delivery-notes",
      { status_preset: "offen" },
      mockClient as unknown as OpenXEClient
    );

    const parsed = JSON.parse(result.content[0].text);
    // No presets for delivery notes, so all records returned
    expect(parsed.data).toHaveLength(2);
  });
});
