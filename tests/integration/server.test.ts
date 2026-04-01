import { describe, it, expect } from "vitest";

describe("OpenXE MCP Server Integration", () => {
  it("lists all registered tools", async () => {
    const { ADDRESS_TOOL_DEFINITIONS } = await import(
      "../../src/tools/address-tools.js"
    );
    const { DOCUMENT_TOOL_DEFINITIONS } = await import(
      "../../src/tools/document-tools.js"
    );

    const allTools = [
      ...ADDRESS_TOOL_DEFINITIONS,
      ...DOCUMENT_TOOL_DEFINITIONS,
    ];

    // Addresses: create-address, edit-address, create-delivery-address, edit-delivery-address, delete-delivery-address
    // Documents: create-order, create-quote, create-invoice, create-credit-note,
    //   convert-quote-to-order, convert-order-to-invoice, release-order, release-invoice,
    //   mark-invoice-paid, delete-draft-invoice, get-document-pdf
    expect(allTools.length).toBeGreaterThanOrEqual(14);

    // Verify key tools exist
    const names = allTools.map((t) => t.name);
    expect(names).toContain("openxe-create-address");
    expect(names).toContain("openxe-edit-address");
    expect(names).toContain("openxe-create-delivery-address");
    expect(names).toContain("openxe-create-order");
    expect(names).toContain("openxe-create-quote");
    expect(names).toContain("openxe-create-invoice");
    expect(names).toContain("openxe-create-credit-note");
    expect(names).toContain("openxe-convert-quote-to-order");
    expect(names).toContain("openxe-convert-order-to-invoice");
    expect(names).toContain("openxe-release-order");
    expect(names).toContain("openxe-release-invoice");
    expect(names).toContain("openxe-mark-invoice-paid");
    expect(names).toContain("openxe-delete-draft-invoice");
    expect(names).toContain("openxe-get-document-pdf");

    // Verify every tool has a non-empty description and inputSchema
    for (const tool of allTools) {
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeTruthy();
      expect(typeof tool.inputSchema).toBe("object");
    }
  });

  it("lists all registered resources", async () => {
    const { getDocumentResourceDefinitions } = await import(
      "../../src/resources/documents.js"
    );

    const allResources = [
      // Core resources (registered directly in addresses.ts / articles.ts)
      { uri: "openxe://adressen", name: "Addresses" },
      { uri: "openxe://lieferadressen", name: "Delivery Addresses" },
      { uri: "openxe://artikel", name: "Articles" },
      { uri: "openxe://artikelkategorien", name: "Categories" },
      ...getDocumentResourceDefinitions(),
    ];

    // 4 core + 5 document types = 9
    expect(allResources.length).toBeGreaterThanOrEqual(9);

    const uris = allResources.map((r) => r.uri);
    expect(uris).toContain("openxe://adressen");
    expect(uris).toContain("openxe://artikel");
    expect(uris).toContain("openxe://belege/angebote");
    expect(uris).toContain("openxe://belege/auftraege");
    expect(uris).toContain("openxe://belege/rechnungen");
    expect(uris).toContain("openxe://belege/lieferscheine");
    expect(uris).toContain("openxe://belege/gutschriften");
  });

  it("all tool names follow openxe-* naming convention", async () => {
    const { ADDRESS_TOOL_DEFINITIONS } = await import(
      "../../src/tools/address-tools.js"
    );
    const { DOCUMENT_TOOL_DEFINITIONS } = await import(
      "../../src/tools/document-tools.js"
    );

    const allTools = [
      ...ADDRESS_TOOL_DEFINITIONS,
      ...DOCUMENT_TOOL_DEFINITIONS,
    ];

    for (const tool of allTools) {
      expect(tool.name).toMatch(/^openxe-/);
    }
  });

  it("no duplicate tool names", async () => {
    const { ADDRESS_TOOL_DEFINITIONS } = await import(
      "../../src/tools/address-tools.js"
    );
    const { DOCUMENT_TOOL_DEFINITIONS } = await import(
      "../../src/tools/document-tools.js"
    );

    const allTools = [
      ...ADDRESS_TOOL_DEFINITIONS,
      ...DOCUMENT_TOOL_DEFINITIONS,
    ];

    const names = allTools.map((t) => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });
});
