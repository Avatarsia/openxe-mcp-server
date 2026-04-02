import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleBatchPDFTool,
  BATCH_PDF_TOOL_DEFINITION,
} from "../../src/tools/batch-pdf-tools.js";
import { OpenXEClient } from "../../src/client/openxe-client.js";

describe("Batch PDF Tools", () => {
  let mockClient: {
    get: ReturnType<typeof vi.fn>;
    getRaw: ReturnType<typeof vi.fn>;
  };

  const fakePdf = (id: number) => Buffer.from(`%PDF-1.4 fake-${id}`);

  beforeEach(() => {
    mockClient = {
      get: vi.fn(),
      getRaw: vi.fn(),
    };
  });

  // --- Tool definition ---

  it("defines openxe-batch-pdf tool", () => {
    expect(BATCH_PDF_TOOL_DEFINITION.name).toBe("openxe-batch-pdf");
    expect(BATCH_PDF_TOOL_DEFINITION.description).toContain("PDF");
    expect(BATCH_PDF_TOOL_DEFINITION.description).toContain("20");
  });

  // --- Direct IDs ---

  it("downloads PDFs for explicit ids", async () => {
    mockClient.getRaw
      .mockResolvedValueOnce({ data: fakePdf(1), contentType: "application/pdf" })
      .mockResolvedValueOnce({ data: fakePdf(2), contentType: "application/pdf" });

    const result = await handleBatchPDFTool(
      "openxe-batch-pdf",
      { typ: "rechnung", ids: [1, 2] },
      mockClient as unknown as OpenXEClient
    );

    expect(result.isError).toBeUndefined();

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.total_requested).toBe(2);
    expect(parsed.total_downloaded).toBe(2);
    expect(parsed.results).toHaveLength(2);

    // Check first PDF
    expect(parsed.results[0].id).toBe(1);
    expect(parsed.results[0].filename).toBe("rechnung-1.pdf");
    expect(parsed.results[0].base64).toBe(fakePdf(1).toString("base64"));

    // Check second PDF
    expect(parsed.results[1].id).toBe(2);
    expect(parsed.results[1].filename).toBe("rechnung-2.pdf");

    // Should call getRaw for each ID, not client.get for listing
    expect(mockClient.getRaw).toHaveBeenCalledTimes(2);
    expect(mockClient.getRaw).toHaveBeenCalledWith("/BelegPDF", { beleg: "rechnung", id: "1" });
    expect(mockClient.getRaw).toHaveBeenCalledWith("/BelegPDF", { beleg: "rechnung", id: "2" });
    expect(mockClient.get).not.toHaveBeenCalled();
  });

  // --- Filter-based resolution ---

  it("resolves IDs from status_preset filter", async () => {
    mockClient.get.mockResolvedValue({
      data: [
        { id: 10, belegnr: "RE-2026-0010" },
        { id: 11, belegnr: "RE-2026-0011" },
      ],
    });
    mockClient.getRaw
      .mockResolvedValueOnce({ data: fakePdf(10), contentType: "application/pdf" })
      .mockResolvedValueOnce({ data: fakePdf(11), contentType: "application/pdf" });

    const result = await handleBatchPDFTool(
      "openxe-batch-pdf",
      { typ: "rechnung", status_preset: "freigegeben" },
      mockClient as unknown as OpenXEClient
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.total_downloaded).toBe(2);
    expect(parsed.results[0].belegnr).toBe("RE-2026-0010");
    expect(parsed.results[1].belegnr).toBe("RE-2026-0011");

    // Should have fetched the list first
    expect(mockClient.get).toHaveBeenCalledWith(
      "/v1/belege/rechnungen",
      expect.objectContaining({ status: "freigegeben" })
    );
  });

  it("resolves IDs from zeitraum filter", async () => {
    mockClient.get.mockResolvedValue({
      data: [{ id: 5, belegnr: "AU-2026-0005" }],
    });
    mockClient.getRaw.mockResolvedValue({
      data: fakePdf(5),
      contentType: "application/pdf",
    });

    const result = await handleBatchPDFTool(
      "openxe-batch-pdf",
      { typ: "auftrag", zeitraum: "2026-01-01" },
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.get).toHaveBeenCalledWith(
      "/v1/belege/auftraege",
      expect.objectContaining({ datum_gte: "2026-01-01" })
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.total_downloaded).toBe(1);
    expect(parsed.results[0].filename).toBe("auftrag-5.pdf");
  });

  it("resolves IDs from where clause", async () => {
    mockClient.get.mockResolvedValue({
      data: [{ id: 7, belegnr: "AN-2026-0007" }],
    });
    mockClient.getRaw.mockResolvedValue({
      data: fakePdf(7),
      contentType: "application/pdf",
    });

    const result = await handleBatchPDFTool(
      "openxe-batch-pdf",
      { typ: "angebot", where: { kundennummer: "10001" } },
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.get).toHaveBeenCalledWith(
      "/v1/belege/angebote",
      expect.objectContaining({ kundennummer: "10001" })
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.total_downloaded).toBe(1);
  });

  // --- Safety limit ---

  it("rejects when more than 20 IDs provided", async () => {
    const ids = Array.from({ length: 21 }, (_, i) => i + 1);

    const result = await handleBatchPDFTool(
      "openxe-batch-pdf",
      { typ: "rechnung", ids },
      mockClient as unknown as OpenXEClient
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("21");
    expect(result.content[0].text).toContain("20");
    expect(mockClient.getRaw).not.toHaveBeenCalled();
  });

  it("rejects when filter returns more than 20 results", async () => {
    const bigList = Array.from({ length: 21 }, (_, i) => ({
      id: i + 1,
      belegnr: `RE-2026-${String(i + 1).padStart(4, "0")}`,
    }));
    mockClient.get.mockResolvedValue({ data: bigList });

    const result = await handleBatchPDFTool(
      "openxe-batch-pdf",
      { typ: "rechnung", status_preset: "freigegeben" },
      mockClient as unknown as OpenXEClient
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("21");
    expect(result.content[0].text).toContain("20");
    expect(mockClient.getRaw).not.toHaveBeenCalled();
  });

  // --- Edge cases ---

  it("returns empty result when no documents match filter", async () => {
    mockClient.get.mockResolvedValue({ data: [] });

    const result = await handleBatchPDFTool(
      "openxe-batch-pdf",
      { typ: "gutschrift", status_preset: "freigegeben" },
      mockClient as unknown as OpenXEClient
    );

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.results).toEqual([]);
    expect(parsed._info).toContain("Keine Belege");
  });

  it("returns error when no ids and no filters provided", async () => {
    const result = await handleBatchPDFTool(
      "openxe-batch-pdf",
      { typ: "rechnung" },
      mockClient as unknown as OpenXEClient
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("ids");
  });

  it("reports partial failures when some PDFs fail", async () => {
    mockClient.getRaw
      .mockResolvedValueOnce({ data: fakePdf(1), contentType: "application/pdf" })
      .mockRejectedValueOnce(new Error("PDF generation failed"))
      .mockResolvedValueOnce({ data: fakePdf(3), contentType: "application/pdf" });

    const result = await handleBatchPDFTool(
      "openxe-batch-pdf",
      { typ: "rechnung", ids: [1, 2, 3] },
      mockClient as unknown as OpenXEClient
    );

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.total_requested).toBe(3);
    expect(parsed.total_downloaded).toBe(2);
    expect(parsed.results).toHaveLength(2);
    expect(parsed.errors).toHaveLength(1);
    expect(parsed.errors[0].id).toBe(2);
    expect(parsed.errors[0].error).toContain("PDF generation failed");
    expect(parsed._info).toContain("1 Fehler");
  });

  it("filters out deleted records from list results", async () => {
    mockClient.get.mockResolvedValue({
      data: [
        { id: 1, belegnr: "RE-2026-0001" },
        { id: 2, belegnr: "DEL-RE-2026-0002", geloescht: "1" },
        { id: 3, belegnr: "RE-2026-0003" },
      ],
    });
    mockClient.getRaw
      .mockResolvedValueOnce({ data: fakePdf(1), contentType: "application/pdf" })
      .mockResolvedValueOnce({ data: fakePdf(3), contentType: "application/pdf" });

    const result = await handleBatchPDFTool(
      "openxe-batch-pdf",
      { typ: "rechnung", status_preset: "freigegeben" },
      mockClient as unknown as OpenXEClient
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.total_downloaded).toBe(2);
    // Only non-deleted IDs should be downloaded
    expect(mockClient.getRaw).toHaveBeenCalledTimes(2);
    expect(mockClient.getRaw).toHaveBeenCalledWith("/BelegPDF", { beleg: "rechnung", id: "1" });
    expect(mockClient.getRaw).toHaveBeenCalledWith("/BelegPDF", { beleg: "rechnung", id: "3" });
  });

  it("works with all supported document types", async () => {
    const types = ["rechnung", "auftrag", "angebot", "lieferschein", "gutschrift"];
    const pathMap: Record<string, string> = {
      rechnung: "rechnungen",
      auftrag: "auftraege",
      angebot: "angebote",
      lieferschein: "lieferscheine",
      gutschrift: "gutschriften",
    };

    for (const typ of types) {
      mockClient.get.mockResolvedValue({
        data: [{ id: 1, belegnr: `${typ.toUpperCase()}-001` }],
      });
      mockClient.getRaw.mockResolvedValue({
        data: fakePdf(1),
        contentType: "application/pdf",
      });

      const result = await handleBatchPDFTool(
        "openxe-batch-pdf",
        { typ, status_preset: "freigegeben" },
        mockClient as unknown as OpenXEClient
      );

      expect(mockClient.get).toHaveBeenCalledWith(
        `/v1/belege/${pathMap[typ]}`,
        expect.any(Object)
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.results[0].filename).toBe(`${typ}-1.pdf`);

      mockClient.get.mockClear();
      mockClient.getRaw.mockClear();
    }
  });

  it("returns error for unknown tool name", async () => {
    const result = await handleBatchPDFTool(
      "openxe-unknown",
      { typ: "rechnung", ids: [1] },
      mockClient as unknown as OpenXEClient
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Unknown");
  });

  it("allows exactly 20 IDs (boundary)", async () => {
    const ids = Array.from({ length: 20 }, (_, i) => i + 1);

    for (let i = 0; i < 20; i++) {
      mockClient.getRaw.mockResolvedValueOnce({
        data: fakePdf(i + 1),
        contentType: "application/pdf",
      });
    }

    const result = await handleBatchPDFTool(
      "openxe-batch-pdf",
      { typ: "rechnung", ids },
      mockClient as unknown as OpenXEClient
    );

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.total_downloaded).toBe(20);
    expect(parsed.results).toHaveLength(20);
  });

  it("combines status_preset and where filters", async () => {
    mockClient.get.mockResolvedValue({
      data: [{ id: 42, belegnr: "RE-2026-0042" }],
    });
    mockClient.getRaw.mockResolvedValue({
      data: fakePdf(42),
      contentType: "application/pdf",
    });

    await handleBatchPDFTool(
      "openxe-batch-pdf",
      {
        typ: "rechnung",
        status_preset: "freigegeben",
        where: { kundennummer: "10001" },
      },
      mockClient as unknown as OpenXEClient
    );

    // status_preset should override any status in where, and kundennummer passes through
    expect(mockClient.get).toHaveBeenCalledWith(
      "/v1/belege/rechnungen",
      expect.objectContaining({
        status: "freigegeben",
        kundennummer: "10001",
      })
    );
  });
});
