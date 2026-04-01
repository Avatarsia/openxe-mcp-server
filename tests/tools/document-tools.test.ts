import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleDocumentTool,
  DOCUMENT_TOOL_DEFINITIONS,
} from "../../src/tools/document-tools.js";
import { OpenXEClient } from "../../src/client/openxe-client.js";

describe("Document Tools", () => {
  let mockClient: { legacyPost: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockClient = { legacyPost: vi.fn(), delete: vi.fn() };
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

  it("gets document PDF via BelegPDF", async () => {
    mockClient.legacyPost.mockResolvedValue({
      success: true,
      data: { base64: "JVBER...", filename: "RE-2026-0001.pdf" },
    });

    const result = await handleDocumentTool(
      "openxe-get-document-pdf",
      { typ: "rechnung", id: 99 },
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.legacyPost).toHaveBeenCalledWith("BelegPDF", {
      typ: "rechnung",
      id: 99,
    });
    expect(result.content[0].text).toContain("RE-2026-0001.pdf");
  });
});
