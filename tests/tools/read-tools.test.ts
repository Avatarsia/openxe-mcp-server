import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenXEClient } from "../../src/client/openxe-client.js";
import {
  handleReadTool,
  READ_TOOL_DEFINITIONS,
} from "../../src/tools/read-tools.js";

describe("Read Tools", () => {
  let mockClient: {
    get: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockClient = {
      get: vi.fn(),
    };
  });

  it("defines all 7 read tools", () => {
    const names = READ_TOOL_DEFINITIONS.map((t) => t.name);
    expect(names).toContain("openxe-list-addresses");
    expect(names).toContain("openxe-get-address");
    expect(names).toContain("openxe-list-articles");
    expect(names).toContain("openxe-get-article");
    expect(names).toContain("openxe-list-categories");
    expect(names).toContain("openxe-list-shipping-methods");
    expect(names).toContain("openxe-list-files");
    expect(names).toHaveLength(7);
  });

  it("each tool definition has name, description, and inputSchema", () => {
    for (const tool of READ_TOOL_DEFINITIONS) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeTruthy();
    }
  });

  it("lists addresses with no filters", async () => {
    mockClient.get.mockResolvedValue({
      data: [{ id: 1, name: "Acme" }],
      pagination: { totalCount: 1, page: 1, itemsPerPage: 20 },
    });

    const result = await handleReadTool(
      "openxe-list-addresses",
      {},
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.get).toHaveBeenCalledWith("/v1/adressen", {});
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data).toHaveLength(1);
    expect(parsed.data[0].name).toBe("Acme");
  });

  it("lists addresses with kundennummer (server-side filter)", async () => {
    mockClient.get.mockResolvedValue({
      data: [{ id: 1, name: "Acme", kundennummer: "K1001" }],
      pagination: { totalCount: 1, page: 1, itemsPerPage: 20 },
    });

    await handleReadTool(
      "openxe-list-addresses",
      { kundennummer: "K1001" },
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.get).toHaveBeenCalledWith("/v1/adressen", {
      kundennummer: "K1001",
    });
  });

  it("filters addresses by name client-side", async () => {
    mockClient.get.mockResolvedValue({
      data: [
        { id: 1, name: "Acme GmbH", firma: "" },
        { id: 2, name: "Beta Corp", firma: "" },
        { id: 3, name: "Test", firma: "Acme Holding" },
      ],
      pagination: { totalCount: 3, page: 1, itemsPerPage: 20 },
    });

    const result = await handleReadTool(
      "openxe-list-addresses",
      { name: "acme" },
      mockClient as unknown as OpenXEClient
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data).toHaveLength(2);
    expect(parsed.data.map((a: any) => a.id)).toEqual([1, 3]);
  });

  it("filters addresses by email client-side", async () => {
    mockClient.get.mockResolvedValue({
      data: [
        { id: 1, name: "A", email: "info@acme.de" },
        { id: 2, name: "B", email: "hello@beta.com" },
      ],
      pagination: undefined,
    });

    const result = await handleReadTool(
      "openxe-list-addresses",
      { email: "acme" },
      mockClient as unknown as OpenXEClient
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data).toHaveLength(1);
    expect(parsed.data[0].id).toBe(1);
  });

  it("filters addresses by land client-side", async () => {
    mockClient.get.mockResolvedValue({
      data: [
        { id: 1, name: "A", land: "DE" },
        { id: 2, name: "B", land: "AT" },
      ],
      pagination: undefined,
    });

    const result = await handleReadTool(
      "openxe-list-addresses",
      { land: "de" },
      mockClient as unknown as OpenXEClient
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data).toHaveLength(1);
    expect(parsed.data[0].land).toBe("DE");
  });

  it("gets a single address by ID", async () => {
    mockClient.get.mockResolvedValue({
      data: { id: 42, name: "Acme GmbH", email: "info@acme.de" },
    });

    const result = await handleReadTool(
      "openxe-get-address",
      { id: 42 },
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.get).toHaveBeenCalledWith("/v1/adressen/42");
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.id).toBe(42);
    expect(parsed.name).toBe("Acme GmbH");
  });

  it("lists articles with include", async () => {
    mockClient.get.mockResolvedValue({
      data: [{ id: 1, name: "PLA Filament", name_de: "PLA Filament" }],
      pagination: { totalCount: 1, page: 1, itemsPerPage: 20 },
    });

    const result = await handleReadTool(
      "openxe-list-articles",
      { include: "verkaufspreise,lagerbestand" },
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.get).toHaveBeenCalledWith("/v1/artikel", {
      include: "verkaufspreise,lagerbestand",
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data).toHaveLength(1);
  });

  it("lists articles with filters and pagination", async () => {
    mockClient.get.mockResolvedValue({
      data: [],
      pagination: { totalCount: 0, page: 2, itemsPerPage: 10 },
    });

    await handleReadTool(
      "openxe-list-articles",
      { name_de: "Filament", typ: "produkt", page: 2, items: 10 },
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.get).toHaveBeenCalledWith("/v1/artikel", {
      name_de: "Filament",
      typ: "produkt",
      page: 2,
      items: 10,
    });
  });

  it("gets a single article by ID with include", async () => {
    mockClient.get.mockResolvedValue({
      data: { id: 5, name_de: "PETG Filament" },
    });

    const result = await handleReadTool(
      "openxe-get-article",
      { id: 5, include: "verkaufspreise" },
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.get).toHaveBeenCalledWith("/v1/artikel/5", {
      include: "verkaufspreise",
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.id).toBe(5);
  });

  it("gets article without include", async () => {
    mockClient.get.mockResolvedValue({
      data: { id: 5, name_de: "PETG Filament" },
    });

    await handleReadTool(
      "openxe-get-article",
      { id: 5 },
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.get).toHaveBeenCalledWith("/v1/artikel/5", {});
  });

  it("lists categories with filters", async () => {
    mockClient.get.mockResolvedValue({
      data: [{ id: 1, bezeichnung: "Filamente" }],
      pagination: { totalCount: 1, page: 1, itemsPerPage: 20 },
    });

    await handleReadTool(
      "openxe-list-categories",
      { bezeichnung: "Filamente", parent: 0 },
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.get).toHaveBeenCalledWith("/v1/artikelkategorien", {
      bezeichnung: "Filamente",
      parent: 0,
    });
  });

  it("lists shipping methods", async () => {
    mockClient.get.mockResolvedValue({
      data: [{ id: 1, name: "DHL Paket", bezeichnung: "DHL Paket" }],
      pagination: undefined,
    });

    const result = await handleReadTool(
      "openxe-list-shipping-methods",
      {},
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.get).toHaveBeenCalledWith("/v1/versandarten", {});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data[0].bezeichnung).toBe("DHL Paket");
  });

  it("lists files with filters", async () => {
    mockClient.get.mockResolvedValue({
      data: [{ id: 10, objekt: "Artikel", parameter: "5" }],
      pagination: { totalCount: 1, page: 1, itemsPerPage: 20 },
    });

    await handleReadTool(
      "openxe-list-files",
      { objekt: "Artikel", parameter: "5" },
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.get).toHaveBeenCalledWith("/v1/dateien", {
      objekt: "Artikel",
      parameter: "5",
    });
  });

  it("returns error for unknown tool name", async () => {
    const result = await handleReadTool(
      "openxe-unknown-tool",
      {},
      mockClient as unknown as OpenXEClient
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Unknown read tool");
  });
});
