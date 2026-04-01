import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleArticleResource } from "../../src/resources/articles.js";
import { handleDocumentResource } from "../../src/resources/documents.js";
import { handleInventoryResource } from "../../src/resources/inventory.js";
import { handleMasterDataResource } from "../../src/resources/master-data.js";
import { OpenXEClient } from "../../src/client/openxe-client.js";
import type { OpenXEConfig } from "../../src/config.js";

const mockFetch = vi.fn();

const config: OpenXEConfig = {
  baseUrl: "https://erp.test/api",
  username: "testuser",
  password: "testpass",
  timeout: 5000,
};

function prime401() {
  mockFetch.mockResolvedValueOnce({
    status: 401,
    headers: new Map([
      [
        "www-authenticate",
        'Digest realm="Xentral-API", qop="auth", nonce="n", opaque="o"',
      ],
    ]),
  });
}

function mock404() {
  mockFetch.mockResolvedValueOnce({
    status: 404,
    headers: new Map(),
    json: async () => ({
      error: { code: 7452, http_code: 404, message: "Not found" },
    }),
  });
}

describe("Resource handlers return helpful message on 404", () => {
  let client: OpenXEClient;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new OpenXEClient(config, mockFetch as any);
  });

  it("handleArticleResource list returns empty data on 404", async () => {
    prime401();
    mock404();

    const result = await handleArticleResource("openxe://artikel", client);
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!.contents[0].text);
    // List 404 -> client returns empty array, handler formats it normally
    expect(parsed.data).toEqual([]);
  });

  it("handleArticleResource single returns error message on 404", async () => {
    prime401();
    mock404();

    const result = await handleArticleResource("openxe://artikel/42", client);
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!.contents[0].text);
    expect(parsed.available).toBe(false);
    expect(parsed.error).toContain("not available");
  });

  it("handleDocumentResource list returns empty data on 404", async () => {
    prime401();
    mock404();

    const result = await handleDocumentResource(
      "openxe://belege/gutschriften",
      client
    );
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!.contents[0].text);
    expect(parsed.data).toEqual([]);
  });

  it("handleDocumentResource single returns error message on 404", async () => {
    prime401();
    mock404();

    const result = await handleDocumentResource(
      "openxe://belege/auftraege/42",
      client
    );
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!.contents[0].text);
    expect(parsed.available).toBe(false);
    expect(parsed.error).toContain("not available");
  });

  it("handleInventoryResource list returns empty data on 404", async () => {
    prime401();
    mock404();

    const result = await handleInventoryResource(
      "openxe://lagercharge",
      client
    );
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!.contents[0].text);
    expect(parsed.data).toEqual([]);
  });

  it("handleInventoryResource single returns error message on 404", async () => {
    prime401();
    mock404();

    const result = await handleInventoryResource(
      "openxe://lagercharge/5",
      client
    );
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!.contents[0].text);
    expect(parsed.available).toBe(false);
    expect(parsed.error).toContain("not available");
  });

  it("handleMasterDataResource list returns empty data on 404", async () => {
    prime401();
    mock404();

    const result = await handleMasterDataResource(
      "openxe://steuersaetze",
      client
    );
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!.contents[0].text);
    expect(parsed.data).toEqual([]);
  });

  it("handleMasterDataResource single returns error message on 404", async () => {
    prime401();
    mock404();

    const result = await handleMasterDataResource(
      "openxe://steuersaetze/3",
      client
    );
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!.contents[0].text);
    expect(parsed.available).toBe(false);
    expect(parsed.error).toContain("not available");
  });
});
