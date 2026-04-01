import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { OpenXEClient } from "../../src/client/openxe-client.js";
import { registerAddressResources } from "../../src/resources/addresses.js";
import type { OpenXEConfig } from "../../src/config.js";

// Spy on McpServer.registerResource to capture registrations
const registeredResources: Array<{
  name: string;
  uriOrTemplate: string | ResourceTemplate;
  config: any;
  callback: Function;
}> = [];

const mockRegisterResource = vi.fn(
  (name: string, uriOrTemplate: any, config: any, callback: Function) => {
    registeredResources.push({ name, uriOrTemplate, config, callback });
    return { name, enabled: true, enable: vi.fn(), disable: vi.fn(), update: vi.fn(), remove: vi.fn() };
  }
);

const mockServer = {
  registerResource: mockRegisterResource,
} as unknown as McpServer;

const mockFetch = vi.fn();
const config: OpenXEConfig = {
  baseUrl: "https://erp.test/api",
  username: "testuser",
  password: "testpass",
  timeout: 5000,
};

describe("registerAddressResources", () => {
  let client: OpenXEClient;

  beforeEach(() => {
    mockFetch.mockReset();
    mockRegisterResource.mockClear();
    registeredResources.length = 0;
    client = new OpenXEClient(config, mockFetch as any);
    registerAddressResources(mockServer, client);
  });

  it("registers four resources", () => {
    expect(mockRegisterResource).toHaveBeenCalledTimes(4);
  });

  it("registers adressen-list with correct URI and metadata", () => {
    const reg = registeredResources.find((r) => r.name === "adressen-list");
    expect(reg).toBeDefined();
    expect(reg!.uriOrTemplate).toBe("openxe://adressen");
    expect(reg!.config.mimeType).toBe("application/json");
    expect(reg!.config.description).toContain("addresses");
  });

  it("registers adressen-detail with a ResourceTemplate", () => {
    const reg = registeredResources.find((r) => r.name === "adressen-detail");
    expect(reg).toBeDefined();
    expect(reg!.uriOrTemplate).toBeInstanceOf(ResourceTemplate);
    expect(reg!.config.description).toContain("single address");
  });

  it("registers lieferadressen-list with correct URI", () => {
    const reg = registeredResources.find(
      (r) => r.name === "lieferadressen-list"
    );
    expect(reg).toBeDefined();
    expect(reg!.uriOrTemplate).toBe("openxe://lieferadressen");
    expect(reg!.config.description).toContain("delivery addresses");
  });

  it("registers lieferadressen-detail with a ResourceTemplate", () => {
    const reg = registeredResources.find(
      (r) => r.name === "lieferadressen-detail"
    );
    expect(reg).toBeDefined();
    expect(reg!.uriOrTemplate).toBeInstanceOf(ResourceTemplate);
    expect(reg!.config.description).toContain("delivery address");
  });

  describe("adressen-list callback", () => {
    it("calls client.get and returns formatted JSON", async () => {
      // Prime digest auth
      mockFetch.mockResolvedValueOnce({
        status: 401,
        headers: new Map([
          [
            "www-authenticate",
            'Digest realm="Xentral-API", qop="auth", nonce="n1", opaque="o1"',
          ],
        ]),
      });
      mockFetch.mockResolvedValueOnce({
        status: 200,
        headers: new Map([
          ["x-total-count", "2"],
          ["x-page", "1"],
          ["x-items-per-page", "20"],
        ]),
        json: async () => [
          { id: 1, name: "Acme GmbH" },
          { id: 2, name: "Test AG" },
        ],
      });

      const reg = registeredResources.find((r) => r.name === "adressen-list")!;
      const result = await reg.callback(new URL("openxe://adressen"));

      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].uri).toBe("openxe://adressen");
      expect(result.contents[0].mimeType).toBe("application/json");

      const parsed = JSON.parse(result.contents[0].text);
      expect(parsed.data).toHaveLength(2);
      expect(parsed.data[0].name).toBe("Acme GmbH");
      expect(parsed.pagination.totalCount).toBe(2);
    });
  });

  describe("adressen-detail callback", () => {
    it("calls client.get with the correct path", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 401,
        headers: new Map([
          [
            "www-authenticate",
            'Digest realm="Xentral-API", qop="auth", nonce="n2", opaque="o2"',
          ],
        ]),
      });
      mockFetch.mockResolvedValueOnce({
        status: 200,
        headers: new Map(),
        json: async () => ({ id: 42, name: "Einzeladresse" }),
      });

      const reg = registeredResources.find(
        (r) => r.name === "adressen-detail"
      )!;
      const result = await reg.callback(new URL("openxe://adressen/42"), {
        id: "42",
      });

      expect(result.contents).toHaveLength(1);
      const parsed = JSON.parse(result.contents[0].text);
      expect(parsed.id).toBe(42);
      expect(parsed.name).toBe("Einzeladresse");

      // Verify the fetch URL included /v1/adressen/42
      const secondCallUrl = mockFetch.mock.calls[1][0];
      expect(secondCallUrl).toContain("/v1/adressen/42");
    });
  });

  describe("lieferadressen-list callback", () => {
    it("calls client.get for delivery addresses", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 401,
        headers: new Map([
          [
            "www-authenticate",
            'Digest realm="Xentral-API", qop="auth", nonce="n3", opaque="o3"',
          ],
        ]),
      });
      mockFetch.mockResolvedValueOnce({
        status: 200,
        headers: new Map([["x-total-count", "1"]]),
        json: async () => [{ id: 10, name: "Lager Nord" }],
      });

      const reg = registeredResources.find(
        (r) => r.name === "lieferadressen-list"
      )!;
      const result = await reg.callback(new URL("openxe://lieferadressen"));

      const parsed = JSON.parse(result.contents[0].text);
      expect(parsed.data).toHaveLength(1);
      expect(parsed.data[0].name).toBe("Lager Nord");
    });
  });

  describe("lieferadressen-detail callback", () => {
    it("calls client.get with delivery address ID", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 401,
        headers: new Map([
          [
            "www-authenticate",
            'Digest realm="Xentral-API", qop="auth", nonce="n4", opaque="o4"',
          ],
        ]),
      });
      mockFetch.mockResolvedValueOnce({
        status: 200,
        headers: new Map(),
        json: async () => ({ id: 7, name: "Filiale Sued" }),
      });

      const reg = registeredResources.find(
        (r) => r.name === "lieferadressen-detail"
      )!;
      const result = await reg.callback(
        new URL("openxe://lieferadressen/7"),
        { id: "7" }
      );

      const parsed = JSON.parse(result.contents[0].text);
      expect(parsed.id).toBe(7);

      const secondCallUrl = mockFetch.mock.calls[1][0];
      expect(secondCallUrl).toContain("/v1/lieferadressen/7");
    });
  });
});
