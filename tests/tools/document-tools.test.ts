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
    get: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockClient = {
      legacyPost: vi.fn(),
      delete: vi.fn(),
      getRaw: vi.fn(),
      get: vi.fn(),
    };
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
    // Edit tools (5 document edit tools)
    expect(names).toContain("openxe-edit-order");
    expect(names).toContain("openxe-edit-invoice");
    expect(names).toContain("openxe-edit-quote");
    expect(names).toContain("openxe-edit-delivery-note");
    expect(names).toContain("openxe-edit-credit-memo");
    expect(names).toHaveLength(16);
  });

  it("creates order via Legacy API AuftragCreate", async () => {
    // AuftragCreate (live-verified format):
    //  - FLAT payload, no {"auftrag": {...}} wrapper
    //  - kundennummer is required; auto-looked-up from the address
    //  - positions nested as artikelliste.position, not flat positionen
    // Any deviation causes OpenXE to throw error 7499 (uncaught exception).
    mockClient.get.mockResolvedValue({
      data: { data: { id: "42", kundennummer: "K00042", name: "Test" } },
    });
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

    expect(mockClient.get).toHaveBeenCalledWith("/v1/adressen/42");
    expect(mockClient.legacyPost).toHaveBeenCalledWith("AuftragCreate", {
      adresse: 42,
      kundennummer: "K00042",
      artikelliste: {
        position: [{ nummer: 10, menge: 5, preis: 29.99 }],
      },
    });
    expect(result.content[0].text).toContain("AU-2026-0001");
  });

  it("fails create-order when address has no kundennummer", async () => {
    // Empty kundennummer on the address means OpenXE will reject the document.
    // We catch this client-side with a helpful error instead of forwarding the
    // opaque 7499 from the server.
    mockClient.get.mockResolvedValue({
      data: { data: { id: "2", kundennummer: "", name: "Ghost" } },
    });

    const result = await handleDocumentTool(
      "openxe-create-order",
      {
        adresse: 2,
        positionen: [{ nummer: 10, menge: 1, preis: 5 }],
      },
      mockClient as unknown as OpenXEClient
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("no kundennummer");
    expect(mockClient.legacyPost).not.toHaveBeenCalled();
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
