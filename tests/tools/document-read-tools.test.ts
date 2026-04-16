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

  it("rejects unknown status_preset with isError instead of silently ignoring", async () => {
    const result = await handleDocumentReadTool(
      "openxe-list-invoices",
      { status_preset: "nonexistent" },
      mockClient as unknown as OpenXEClient
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Unbekanntes status_preset");
    expect(result.content[0].text).toContain("nonexistent");
    expect(result.content[0].text).toContain("openxe-list-invoices");
    // No API call should have been made.
    expect(mockClient.get).not.toHaveBeenCalled();
  });

  it("rejects status_preset valid for other entity (mahnkandidaten on quotes)", async () => {
    const result = await handleDocumentReadTool(
      "openxe-list-quotes",
      { status_preset: "mahnkandidaten" },
      mockClient as unknown as OpenXEClient
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Unbekanntes status_preset");
    expect(result.content[0].text).toContain("mahnkandidaten");
    expect(mockClient.get).not.toHaveBeenCalled();
  });

  it("filters quotes by status_preset='angenommen' (only beauftragt)", async () => {
    mockPaginatedGet([
      { id: 1, belegnr: "AN-001", status: "beauftragt", name: "A", kundennummer: "K1" },
      { id: 2, belegnr: "AN-002", status: "freigegeben", name: "B", kundennummer: "K2" },
      { id: 3, belegnr: "AN-003", status: "beauftragt", name: "C", kundennummer: "K3" },
    ]);

    const result = await handleDocumentReadTool(
      "openxe-list-quotes",
      { status_preset: "angenommen" },
      mockClient as unknown as OpenXEClient
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data).toHaveLength(2);
    expect(parsed.data.map((d) => d.id)).toEqual([1, 3]);
  });

  it("filters orders by status_preset='entwurf'", async () => {
    mockPaginatedGet([
      { id: 1, belegnr: "", status: "angelegt", name: "A", kundennummer: "K1" },
      { id: 2, belegnr: "AU-002", status: "freigegeben", name: "B", kundennummer: "K2" },
      { id: 3, belegnr: "AU-003", status: "angelegt", name: "C", kundennummer: "K3" },
    ]);

    const result = await handleDocumentReadTool(
      "openxe-list-orders",
      { status_preset: "entwurf" },
      mockClient as unknown as OpenXEClient
    );

    const parsed = JSON.parse(result.content[0].text);
    // entwurf: !belegnr OR status === "angelegt"
    expect(parsed.data.map((d) => d.id).sort()).toEqual([1, 3]);
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

    it("returns the WARNUNG as a separate content item when the fetch was truncated", async () => {
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

      // content[0] stays a pure CSV stream so downstream parsers (Excel,
      // pandas) can ingest it unchanged. The truncation warning lives in a
      // separate TextContent so the LLM still sees it.
      const csv = result.content[0].text;
      expect(csv.split("\n", 1)[0].startsWith("#")).toBe(false);
      expect(csv).not.toMatch(/WARNUNG/);

      expect(result.content).toHaveLength(2);
      expect(result.content[1].text).toMatch(/^WARNUNG: Safety-Cap .* 10000 /);
    });

    it("returns a single content item (no warning) when the fetch was not truncated", async () => {
      mockClient.get.mockResolvedValue({
        data: {
          data: [
            {
              id: 1,
              belegnr: "RE-1",
              kundennummer: "K1",
              datum: "2026-01-01",
              positionen: [{ nummer: "ART-1", bezeichnung: "X", menge: "1", preis: "1" }],
            },
          ],
          pagination: undefined,
        },
      });

      const result = await handleDocumentReadTool(
        "openxe-list-invoices",
        { format: "csv-positions" },
        mockClient as unknown as OpenXEClient
      );

      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).not.toMatch(/WARNUNG/);
    });
  });

  it("rejects status_preset on delivery-notes (entity without presets)", async () => {
    const result = await handleDocumentReadTool(
      "openxe-list-delivery-notes",
      { status_preset: "offen" },
      mockClient as unknown as OpenXEClient
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("unterstuetzt kein status_preset");
    expect(result.content[0].text).toContain("openxe-list-delivery-notes");
    expect(mockClient.get).not.toHaveBeenCalled();
  });

  it("rejects any status_preset on credit-memos (entity without presets)", async () => {
    const result = await handleDocumentReadTool(
      "openxe-list-credit-memos",
      { status_preset: "bezahlt" },
      mockClient as unknown as OpenXEClient
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("unterstuetzt kein status_preset");
    expect(result.content[0].text).toContain("openxe-list-credit-memos");
    expect(mockClient.get).not.toHaveBeenCalled();
  });

  // Regression test for Task P: aggregate must run across all pages, not just
  // the first MAX_LIST_RESULTS (=50) invoices. Previously sum() silently
  // returned the total of only the first 50 rows.
  describe("aggregate runs on full dataset (Task P regression)", () => {
    it("list-invoices sum:gesamtsumme sums across both pages (150 records)", async () => {
      // 150 invoices, each with gesamtsumme = "10.00" — true total is 1500.00.
      // Without fetchAll on aggregate, the old handler would sum only the
      // first 50 rows (because maxResults caps the fetch) and return 500.00.
      const all: any[] = [];
      for (let i = 1; i <= 150; i++) {
        all.push({
          id: i,
          belegnr: `RE-2026-${String(i).padStart(4, "0")}`,
          kundennummer: `K${1000 + i}`,
          gesamtsumme: "10.00",
        });
      }
      mockClient.get.mockImplementation((_path: string, params?: Record<string, any>) => {
        const page = parseInt(params?.page ?? "1", 10);
        const items = parseInt(params?.items ?? "100", 10);
        const start = (page - 1) * items;
        const slice = all.slice(start, start + items);
        return Promise.resolve({
          data: slice,
          pagination: { totalCount: all.length, page, itemsPerPage: items },
        });
      });

      const result = await handleDocumentReadTool(
        "openxe-list-invoices",
        { aggregate: { sum: "gesamtsumme" } },
        mockClient as unknown as OpenXEClient
      );

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      // With the fix: sum over ALL 150 records = 1500.
      // Without the fix: sum over first 50 records only = 500.
      expect(parsed.sum).toBe(1500);

      // Sanity: both pages must have been requested.
      const pages = mockClient.get.mock.calls
        .map((c: any[]) => c[1]?.page)
        .filter((p: string | undefined): p is string => p !== undefined);
      expect(pages).toContain("1");
      expect(pages).toContain("2");
    });
  });

  // Regression test for Task Q Finding 2: sort_field triggers skipSlim upstream
  // (Task P). The slim re-projection at the end of the handler previously only
  // fired on `where || fields || needsPositions`, not on pure sort_field. That
  // meant raw fetched invoice records (incl. non-slim fields) leaked into the
  // response whenever only sort_field was set.
  describe("sort_field triggers slim re-projection (Task Q Finding 2)", () => {
    it("list-invoices {sort_field:'datum'} strips non-slim fields like positionen/freitext", async () => {
      mockPaginatedGet([
        {
          id: 1,
          belegnr: "RE-2026-0001",
          status: "offen",
          name: "Acme",
          kundennummer: "K1001",
          datum: "2026-01-02",
          soll: "100.00",
          ist: "0.00",
          zahlungsstatus: "offen",
          waehrung: "EUR",
          // Extra non-slim fields that must be stripped by applySlimMode.
          positionen: [{ nummer: "ART-1", bezeichnung: "X" }],
          freitext: "some note",
          internebezeichnung: "internal",
        },
        {
          id: 2,
          belegnr: "RE-2026-0002",
          status: "bezahlt",
          name: "Beta",
          kundennummer: "K1002",
          datum: "2026-01-01",
          soll: "200.00",
          ist: "200.00",
          zahlungsstatus: "bezahlt",
          waehrung: "EUR",
          positionen: [{ nummer: "ART-2", bezeichnung: "Y" }],
          freitext: "another note",
          internebezeichnung: "ref",
        },
      ]);

      const result = await handleDocumentReadTool(
        "openxe-list-invoices",
        { sort_field: "datum" },
        mockClient as unknown as OpenXEClient
      );

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.data).toHaveLength(2);
      // Both records must still be there — we don't assert sort order here
      // since the core of this regression is the slim re-projection, not the
      // sort. Sort correctness is covered by the Task P regression tests.
      // Slim re-projection must have stripped non-slim fields from every row.
      for (const row of parsed.data) {
        expect(row).not.toHaveProperty("positionen");
        expect(row).not.toHaveProperty("freitext");
        expect(row).not.toHaveProperty("internebezeichnung");
        // Sanity: slim fields must still be present.
        expect(row).toHaveProperty("id");
        expect(row).toHaveProperty("belegnr");
        expect(row).toHaveProperty("datum");
      }
    });
  });
});
