import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleDocumentTool,
  DOCUMENT_TOOL_DEFINITIONS,
} from "../../src/tools/document-tools.js";
import { OpenXEClient } from "../../src/client/openxe-client.js";

describe("Document Tools", () => {
  let mockClient: {
    legacyPost: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    getRaw: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockClient = { legacyPost: vi.fn(), delete: vi.fn(), getRaw: vi.fn() };
  });

  it("defines all expected document tools", () => {
    const names = DOCUMENT_TOOL_DEFINITIONS.map((t) => t.name);
    expect(names).toContain("openxe-create-order");
    expect(names).toContain("openxe-create-quote");
    expect(names).toContain("openxe-create-invoice");
    expect(names).toContain("openxe-release-order");
    expect(names).toContain("openxe-convert-quote-to-order");
    expect(names).toContain("openxe-get-document-pdf");
    expect(names).toContain("openxe-delete-draft-invoice");
    expect(names).toHaveLength(11);
  });

  it("creates order via Legacy API AuftragCreate", async () => {
    mockClient.legacyPost.mockResolvedValue({
      success: true,
      data: { id: 100, belegnr: "AU-2026-0001" },
    });

    const result = await handleDocumentTool(
      "openxe-create-order",
      {
        adresse: 42,
        positionen: [{ nummer: 10, menge: 5, preis: 29.99 }],
      },
      mockClient as unknown as OpenXEClient
    );

    // AuftragCreate expects entity wrapper: {"auftrag": {...}}
    expect(mockClient.legacyPost).toHaveBeenCalledWith("AuftragCreate", {
      auftrag: {
        adresse: 42,
        positionen: [{ nummer: 10, menge: 5, preis: 29.99 }],
      },
    });
    expect(result.content[0].text).toContain("AU-2026-0001");
  });

  it("deletes draft invoice via REST v1 DELETE", async () => {
    mockClient.delete.mockResolvedValue(undefined);

    const result = await handleDocumentTool(
      "openxe-delete-draft-invoice",
      { id: 55 },
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.delete).toHaveBeenCalledWith("/v1/belege/rechnungen/55");
    expect(result.content[0].text).toContain("deleted");
  });

  it("gets document PDF via getRaw with GET params", async () => {
    const fakePdf = Buffer.from("%PDF-1.4 fake content");
    mockClient.getRaw.mockResolvedValue({
      data: fakePdf,
      contentType: "application/pdf",
    });

    const result = await handleDocumentTool(
      "openxe-get-document-pdf",
      { typ: "rechnung", id: 99 },
      mockClient as unknown as OpenXEClient
    );

    // Should call getRaw with GET params (beleg=rechnung&id=99), NOT legacyPost
    expect(mockClient.getRaw).toHaveBeenCalledWith("/BelegPDF", {
      beleg: "rechnung",
      id: "99",
    });
    expect(mockClient.legacyPost).not.toHaveBeenCalled();

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.filename).toBe("rechnung-99.pdf");
    expect(parsed.content_type).toBe("application/pdf");
    expect(parsed.size_bytes).toBe(fakePdf.length);
    expect(parsed.base64).toBe(fakePdf.toString("base64"));
  });

  it("releases order via flat JSON (no wrapper key)", async () => {
    mockClient.legacyPost.mockResolvedValue({ success: true });

    await handleDocumentTool(
      "openxe-release-order",
      { id: 10 },
      mockClient as unknown as OpenXEClient
    );

    // Freigabe endpoints expect flat {id: N}, NOT {auftrag: {id: N}}
    expect(mockClient.legacyPost).toHaveBeenCalledWith("AuftragFreigabe", {
      id: 10,
    });
  });

  it("releases invoice via flat JSON (no wrapper key)", async () => {
    mockClient.legacyPost.mockResolvedValue({ success: true });

    await handleDocumentTool(
      "openxe-release-invoice",
      { id: 20 },
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.legacyPost).toHaveBeenCalledWith("RechnungFreigabe", {
      id: 20,
    });
  });

  it("marks invoice paid via flat JSON (no wrapper key)", async () => {
    mockClient.legacyPost.mockResolvedValue({ success: true });

    await handleDocumentTool(
      "openxe-mark-invoice-paid",
      { id: 30 },
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.legacyPost).toHaveBeenCalledWith(
      "RechnungAlsBezahltMarkieren",
      { id: 30 }
    );
  });

  it("converts quote to order via flat JSON (no wrapper key)", async () => {
    mockClient.legacyPost.mockResolvedValue({
      success: true,
      data: { id: 200 },
    });

    await handleDocumentTool(
      "openxe-convert-quote-to-order",
      { id: 5 },
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.legacyPost).toHaveBeenCalledWith("AngebotZuAuftrag", {
      id: 5,
    });
  });

  it("converts order to invoice via flat JSON (no wrapper key)", async () => {
    mockClient.legacyPost.mockResolvedValue({
      success: true,
      data: { id: 300 },
    });

    await handleDocumentTool(
      "openxe-convert-order-to-invoice",
      { id: 7 },
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.legacyPost).toHaveBeenCalledWith(
      "WeiterfuehrenAuftragZuRechnung",
      { id: 7 }
    );
  });

  it("gets document PDF for angebot typ", async () => {
    const fakePdf = Buffer.from("%PDF-1.4 angebot");
    mockClient.getRaw.mockResolvedValue({
      data: fakePdf,
      contentType: "application/pdf",
    });

    const result = await handleDocumentTool(
      "openxe-get-document-pdf",
      { typ: "angebot", id: 1 },
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.getRaw).toHaveBeenCalledWith("/BelegPDF", {
      beleg: "angebot",
      id: "1",
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.filename).toBe("angebot-1.pdf");
    expect(parsed.content_type).toBe("application/pdf");
    expect(parsed.size_bytes).toBe(fakePdf.length);
  });
});
