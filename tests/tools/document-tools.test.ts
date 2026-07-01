import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleDocumentTool,
  DOCUMENT_TOOL_DEFINITIONS,
  resetIdempotencyCache,
} from "../../src/tools/document-tools.js";
import { OpenXEClient, OpenXEApiError } from "../../src/client/openxe-client.js";

describe("Document Tools", () => {
  let mockClient: {
    legacyPost: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    getRaw: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    resetIdempotencyCache();
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

  // --- Fix 1: type coercion (string -> number) ---

  it("coerces string adresse/menge/preis on create-quote", async () => {
    mockClient.get.mockResolvedValue({
      data: { data: { id: "2773", kundennummer: "12610", name: "Fuel" } },
    });
    mockClient.legacyPost.mockResolvedValue({
      success: true,
      data: { id: 500, belegnr: "AN-2026-0001" },
    });

    const result = await handleDocumentTool(
      "openxe-create-quote",
      {
        adresse: "2773",
        positionen: [{ nummer: "100039", menge: "2", preis: "28.00" }],
      },
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.get).toHaveBeenCalledWith("/v1/adressen/2773");
    expect(mockClient.legacyPost).toHaveBeenCalledWith("AngebotCreate", {
      adresse: 2773,
      kundennummer: "12610",
      artikelliste: { position: [{ nummer: "100039", menge: 2, preis: 28 }] },
    });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("AN-2026-0001");
  });

  // --- Fix 2: idempotency guard ---

  it("dedupes an identical create-quote within the TTL (no second legacyPost)", async () => {
    mockClient.get.mockResolvedValue({
      data: { data: { id: "42", kundennummer: "K42", name: "T" } },
    });
    mockClient.legacyPost.mockResolvedValue({
      success: true,
      data: { id: 1, belegnr: "AN-1" },
    });

    const args = {
      adresse: 42,
      positionen: [{ nummer: 10, menge: 1, preis: 5 }],
    };
    const first = await handleDocumentTool(
      "openxe-create-quote",
      { ...args },
      mockClient as unknown as OpenXEClient
    );
    const second = await handleDocumentTool(
      "openxe-create-quote",
      { ...args },
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.legacyPost).toHaveBeenCalledTimes(1);
    expect(first.content[0].text).toContain("AN-1");
    expect(second.content[0].text).toContain("AN-1");
    expect(second.content.some((c) => c.text.includes("Idempotenz"))).toBe(true);
  });

  // --- Fix 3: post-error verification on OpenXE 7499 ---

  it("reports the orphan document when 7499 fired but the beleg exists", async () => {
    // created_at must fall inside VERIFY_WINDOW_MS relative to Date.now().
    // Build a LOCAL wall-clock string (OpenXE stores local time; parseOpenXETs
    // parses without a TZ suffix, i.e. as local) — a UTC toISOString() would be
    // off by the timezone offset and fall outside the window.
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const nowTs = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    // address resolve, then verification list lookup
    mockClient.get
      .mockResolvedValueOnce({
        data: { data: { id: "2773", kundennummer: "12610", name: "Fuel" } },
      })
      .mockResolvedValueOnce({
        data: {
          data: [
            {
              id: "343",
              belegnr: "AN-2026-0343",
              kundennummer: "12610",
              created_at: nowTs,
            },
          ],
        },
      });
    mockClient.legacyPost.mockRejectedValue(
      new OpenXEApiError(7499, 400, "Unexpected error")
    );

    const result = await handleDocumentTool(
      "openxe-create-quote",
      { adresse: 2773, positionen: [{ nummer: 100039, menge: 2, preis: 28 }] },
      mockClient as unknown as OpenXEClient
    );

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("TROTZ Server-Fehler");
    expect(result.content[0].text).toContain("AN-2026-0343");
    expect(result.content[0].text).toContain("NICHT erneut");
  });

  it("returns a no-retry error when 7499 fired and no beleg was found", async () => {
    mockClient.get
      .mockResolvedValueOnce({
        data: { data: { id: "2773", kundennummer: "12610", name: "Fuel" } },
      })
      .mockResolvedValueOnce({ data: { data: [] } });
    mockClient.legacyPost.mockRejectedValue(
      new OpenXEApiError(7499, 400, "Unexpected error")
    );

    const result = await handleDocumentTool(
      "openxe-create-quote",
      { adresse: 2773, positionen: [{ nummer: 100039, menge: 1, preis: 5 }] },
      mockClient as unknown as OpenXEClient
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("KEIN Beleg");
    expect(result.content[0].text).toContain("NICHT identisch wiederholen");
  });

  it("warns (unknown) when verification itself fails after 7499", async () => {
    mockClient.get
      .mockResolvedValueOnce({
        data: { data: { id: "2773", kundennummer: "12610", name: "Fuel" } },
      })
      .mockRejectedValueOnce(new Error("endpoint down"));
    mockClient.legacyPost.mockRejectedValue(
      new OpenXEApiError(7499, 400, "Unexpected error")
    );

    const result = await handleDocumentTool(
      "openxe-create-quote",
      { adresse: 2773, positionen: [{ nummer: 100039, menge: 1, preis: 5 }] },
      mockClient as unknown as OpenXEClient
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("NICHT verifiziert");
    expect(result.content[0].text).toContain("list-quotes");
  });
});
