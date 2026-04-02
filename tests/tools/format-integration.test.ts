import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenXEClient } from "../../src/client/openxe-client.js";
import { handleReadTool } from "../../src/tools/read-tools.js";
import { handleDocumentReadTool } from "../../src/tools/document-read-tools.js";

describe("Format integration: read-tools", () => {
  let mockClient: { get: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockClient = { get: vi.fn() };
  });

  function mockPaginatedGet(data: any[]) {
    mockClient.get.mockImplementation((_path: string, params?: Record<string, any>) => {
      const page = parseInt(params?.page ?? "1", 10);
      if (page === 1) {
        return Promise.resolve({
          data,
          pagination: { totalCount: data.length, page: 1, itemsPerPage: 100 },
        });
      }
      return Promise.resolve({ data: [], pagination: undefined });
    });
  }

  it("list-addresses format=json returns JSON (default)", async () => {
    mockPaginatedGet([{ id: 1, name: "Acme", kundennummer: "K1000" }]);
    const result = await handleReadTool(
      "openxe-list-addresses",
      {},
      mockClient as unknown as OpenXEClient
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed._info).toBeDefined();
    expect(parsed.data).toBeDefined();
  });

  it("list-addresses format=table returns readable table", async () => {
    mockPaginatedGet([
      { id: 1, name: "Acme", kundennummer: "K1000", land: "DE" },
      { id: 2, name: "Beta", kundennummer: "K1001", land: "AT" },
    ]);
    const result = await handleReadTool(
      "openxe-list-addresses",
      { format: "table" },
      mockClient as unknown as OpenXEClient
    );
    const text = result.content[0].text;
    expect(text).toContain(" | ");
    expect(text).toContain("-|-");
    // Should contain the data values
    expect(text).toContain("Acme");
    expect(text).toContain("Beta");
    // Should NOT be JSON
    expect(() => JSON.parse(text)).toThrow();
  });

  it("list-addresses format=csv returns semicolon-separated CSV", async () => {
    mockPaginatedGet([
      { id: 1, name: "Acme", kundennummer: "K1000" },
      { id: 2, name: "Beta", kundennummer: "K1001" },
    ]);
    const result = await handleReadTool(
      "openxe-list-addresses",
      { format: "csv" },
      mockClient as unknown as OpenXEClient
    );
    const text = result.content[0].text;
    const lines = text.split("\n");
    // First line is header with semicolons
    expect(lines[0]).toContain(";");
    // Data rows
    expect(lines.length).toBeGreaterThan(1);
    expect(text).toContain("Acme");
  });

  it("list-addresses format=ids returns comma-separated IDs", async () => {
    mockPaginatedGet([
      { id: 1, name: "Acme", kundennummer: "K1000" },
      { id: 2, name: "Beta", kundennummer: "K1001" },
      { id: 3, name: "Gamma", kundennummer: "K1002" },
    ]);
    const result = await handleReadTool(
      "openxe-list-addresses",
      { format: "ids" },
      mockClient as unknown as OpenXEClient
    );
    const text = result.content[0].text;
    expect(text).toBe("1,2,3");
  });

  it("list-articles format=table works", async () => {
    mockPaginatedGet([
      { id: 10, name_de: "PLA Filament", nummer: "ART-001" },
    ]);
    const result = await handleReadTool(
      "openxe-list-articles",
      { format: "table" },
      mockClient as unknown as OpenXEClient
    );
    const text = result.content[0].text;
    expect(text).toContain(" | ");
    expect(text).toContain("PLA Filament");
  });

  it("list-shipping-methods format=csv works", async () => {
    mockPaginatedGet([
      { id: 1, bezeichnung: "DHL Paket", type: "versand", aktiv: "1" },
    ]);
    const result = await handleReadTool(
      "openxe-list-shipping-methods",
      { format: "csv" },
      mockClient as unknown as OpenXEClient
    );
    const text = result.content[0].text;
    expect(text).toContain(";");
    expect(text).toContain("DHL Paket");
  });
});

describe("Format integration: document-read-tools", () => {
  let mockClient: { get: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockClient = { get: vi.fn() };
  });

  function mockPaginatedGet(data: any[]) {
    mockClient.get.mockImplementation((_path: string, params?: Record<string, any>) => {
      const page = parseInt(params?.page ?? "1", 10);
      if (page === 1) {
        return Promise.resolve({
          data,
          pagination: { totalCount: data.length, page: 1, itemsPerPage: 100 },
        });
      }
      return Promise.resolve({ data: [], pagination: undefined });
    });
  }

  it("list-orders format=table returns readable table", async () => {
    mockPaginatedGet([
      { id: 1, belegnr: "AU-2026-0001", status: "freigegeben", name: "Acme", datum: "2026-03-01", gesamtsumme: "150.00" },
      { id: 2, belegnr: "AU-2026-0002", status: "angelegt", name: "Beta", datum: "2026-03-02", gesamtsumme: "300.00" },
    ]);
    const result = await handleDocumentReadTool(
      "openxe-list-orders",
      { format: "table" },
      mockClient as unknown as OpenXEClient
    );
    const text = result.content[0].text;
    expect(text).toContain(" | ");
    expect(text).toContain("-|-");
    expect(text).toContain("AU-2026-0001");
    expect(text).toContain("AU-2026-0002");
  });

  it("list-invoices format=csv returns semicolon CSV", async () => {
    mockPaginatedGet([
      { id: 5, belegnr: "RE-2026-0010", status: "versendet", name: "Acme", datum: "2026-01-15", soll: "500.00" },
    ]);
    const result = await handleDocumentReadTool(
      "openxe-list-invoices",
      { format: "csv" },
      mockClient as unknown as OpenXEClient
    );
    const text = result.content[0].text;
    expect(text).toContain(";");
    expect(text).toContain("RE-2026-0010");
  });

  it("list-orders format=ids returns comma-separated IDs", async () => {
    mockPaginatedGet([
      { id: 10, belegnr: "AU-2026-0001" },
      { id: 20, belegnr: "AU-2026-0002" },
    ]);
    const result = await handleDocumentReadTool(
      "openxe-list-orders",
      { format: "ids" },
      mockClient as unknown as OpenXEClient
    );
    expect(result.content[0].text).toBe("10,20");
  });

  it("list-orders format=json (default) returns normal JSON", async () => {
    mockPaginatedGet([{ id: 1, belegnr: "AU-2026-0001" }]);
    const result = await handleDocumentReadTool(
      "openxe-list-orders",
      {},
      mockClient as unknown as OpenXEClient
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed._info).toBeDefined();
    expect(parsed.data).toBeDefined();
  });
});
