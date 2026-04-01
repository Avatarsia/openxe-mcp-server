import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleArticleResource } from "../../src/resources/articles.js";
import { OpenXEClient } from "../../src/client/openxe-client.js";
import type { OpenXEConfig } from "../../src/config.js";

const mockFetch = vi.fn();

describe("handleArticleResource", () => {
  const config: OpenXEConfig = {
    baseUrl: "https://erp.test/api",
    username: "testuser",
    password: "testpass",
    timeout: 5000,
  };

  let client: OpenXEClient;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new OpenXEClient(config, mockFetch as any);

    // Prime digest auth for all tests
    mockFetch.mockResolvedValueOnce({
      status: 401,
      headers: new Map([
        [
          "www-authenticate",
          'Digest realm="Xentral-API", qop="auth", nonce="testnonce", opaque="testopaque"',
        ],
      ]),
    });
  });

  it("returns null for non-article URIs", async () => {
    const result = await handleArticleResource(
      "openxe://adressen",
      client
    );
    expect(result).toBeNull();
  });

  it("lists articles with pagination", async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      headers: new Map([
        ["x-total-count", "150"],
        ["x-page", "1"],
        ["x-items-per-page", "20"],
      ]),
      json: async () => [
        { id: 1, name_de: "PLA Filament", nummer: "ART-001" },
        { id: 2, name_de: "ABS Filament", nummer: "ART-002" },
      ],
    });

    const result = await handleArticleResource(
      "openxe://artikel?page=1&items_per_page=20",
      client
    );

    expect(result).not.toBeNull();
    expect(result!.contents).toHaveLength(1);
    expect(result!.contents[0].mimeType).toBe("application/json");

    const parsed = JSON.parse(result!.contents[0].text);
    expect(parsed.data).toHaveLength(2);
    expect(parsed.pagination).toEqual({
      totalCount: 150,
      page: 1,
      itemsPerPage: 20,
    });
  });

  it("lists articles with filters and includes", async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      headers: new Map([
        ["x-total-count", "5"],
        ["x-page", "1"],
        ["x-items-per-page", "20"],
      ]),
      json: async () => [
        {
          id: 1,
          name_de: "PLA Filament",
          verkaufspreise: [{ preis: "29.90" }],
        },
      ],
    });

    const result = await handleArticleResource(
      "openxe://artikel?name_de=Filament&include=verkaufspreise",
      client
    );

    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!.contents[0].text);
    expect(parsed.data[0].verkaufspreise).toBeDefined();

    // Verify the correct query params were sent
    const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
    const url = new URL(lastCall[0]);
    expect(url.searchParams.get("name_de")).toBe("Filament");
    expect(url.searchParams.get("include")).toBe("verkaufspreise");
  });

  it("gets a single article by ID", async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      headers: new Map(),
      json: async () => ({
        id: 42,
        name_de: "PETG Filament",
        nummer: "ART-042",
      }),
    });

    const result = await handleArticleResource(
      "openxe://artikel/42",
      client
    );

    expect(result).not.toBeNull();
    expect(result!.contents).toHaveLength(1);

    const parsed = JSON.parse(result!.contents[0].text);
    expect(parsed.id).toBe(42);
    expect(parsed.name_de).toBe("PETG Filament");

    const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
    expect(lastCall[0]).toContain("/v1/artikel/42");
  });

  it("gets a single article with includes", async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      headers: new Map(),
      json: async () => ({
        id: 42,
        name_de: "PETG Filament",
        verkaufspreise: [{ preis: "24.90" }],
        lagerbestand: { menge: 100 },
      }),
    });

    const result = await handleArticleResource(
      "openxe://artikel/42?include=verkaufspreise,lagerbestand",
      client
    );

    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!.contents[0].text);
    expect(parsed.verkaufspreise).toBeDefined();
    expect(parsed.lagerbestand).toBeDefined();

    const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
    const url = new URL(lastCall[0]);
    expect(url.searchParams.get("include")).toBe(
      "verkaufspreise,lagerbestand"
    );
  });

  it("lists article categories", async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      headers: new Map([
        ["x-total-count", "10"],
        ["x-page", "1"],
        ["x-items-per-page", "20"],
      ]),
      json: async () => [
        { id: 1, bezeichnung: "Filamente" },
        { id: 2, bezeichnung: "Drucker" },
      ],
    });

    const result = await handleArticleResource(
      "openxe://artikelkategorien",
      client
    );

    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!.contents[0].text);
    expect(parsed.data).toHaveLength(2);
  });

  it("gets a single article category by ID", async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      headers: new Map(),
      json: async () => ({ id: 1, bezeichnung: "Filamente" }),
    });

    const result = await handleArticleResource(
      "openxe://artikelkategorien/1",
      client
    );

    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!.contents[0].text);
    expect(parsed.id).toBe(1);
    expect(parsed.bezeichnung).toBe("Filamente");
  });
});
