import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  OpenXEClient,
  EndpointNotAvailableError,
} from "../../src/client/openxe-client.js";
import type { OpenXEConfig } from "../../src/config.js";

// We mock at the fetch level using vi.fn
const mockFetch = vi.fn();

describe("OpenXEClient", () => {
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
  });

  describe("REST v1 GET with Digest handshake", () => {
    it("handles 401 challenge then succeeds on retry", async () => {
      // First call: 401 with WWW-Authenticate
      mockFetch.mockResolvedValueOnce({
        status: 401,
        headers: new Map([
          [
            "www-authenticate",
            'Digest realm="Xentral-API", qop="auth", nonce="servernonce123", opaque="serveropaque456"',
          ],
        ]),
      });

      // Second call: 200 with data
      mockFetch.mockResolvedValueOnce({
        status: 200,
        headers: new Map([
          ["x-total-count", "42"],
          ["x-page", "1"],
          ["x-items-per-page", "20"],
        ]),
        json: async () => [{ id: 1, name: "Test Address" }],
      });

      const result = await client.get("/v1/adressen", { page: 1 });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.data).toEqual([{ id: 1, name: "Test Address" }]);
      expect(result.pagination).toEqual({
        totalCount: 42,
        page: 1,
        itemsPerPage: 20,
      });
    });

    it("reuses cached nonce on subsequent requests", async () => {
      // First request: 401 + 200
      mockFetch.mockResolvedValueOnce({
        status: 401,
        headers: new Map([
          [
            "www-authenticate",
            'Digest realm="Xentral-API", qop="auth", nonce="nonce1", opaque="opaque1"',
          ],
        ]),
      });
      mockFetch.mockResolvedValueOnce({
        status: 200,
        headers: new Map(),
        json: async () => [{ id: 1 }],
      });

      await client.get("/v1/adressen");

      // Second request: should skip 401, go straight to authenticated
      mockFetch.mockResolvedValueOnce({
        status: 200,
        headers: new Map(),
        json: async () => [{ id: 2 }],
      });

      await client.get("/v1/artikel");

      // 401 + 200 + 200 = 3 calls total
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("re-authenticates on nonce expiry (401 after cached nonce)", async () => {
      // Prime the cache
      mockFetch.mockResolvedValueOnce({
        status: 401,
        headers: new Map([
          [
            "www-authenticate",
            'Digest realm="Xentral-API", qop="auth", nonce="oldnonce", opaque="oldopaque"',
          ],
        ]),
      });
      mockFetch.mockResolvedValueOnce({
        status: 200,
        headers: new Map(),
        json: async () => [],
      });
      await client.get("/v1/adressen");

      // Now nonce expired: authenticated request gets 401
      mockFetch.mockResolvedValueOnce({
        status: 401,
        headers: new Map([
          [
            "www-authenticate",
            'Digest realm="Xentral-API", qop="auth", nonce="newnonce", opaque="newopaque"',
          ],
        ]),
      });
      mockFetch.mockResolvedValueOnce({
        status: 200,
        headers: new Map(),
        json: async () => [{ id: 99 }],
      });

      const result = await client.get("/v1/adressen");
      expect(result.data).toEqual([{ id: 99 }]);
    });
  });

  describe("Legacy API POST", () => {
    it("posts to Legacy API endpoint with JSON body", async () => {
      // 401 challenge
      mockFetch.mockResolvedValueOnce({
        status: 401,
        headers: new Map([
          [
            "www-authenticate",
            'Digest realm="Xentral-API", qop="auth", nonce="legacynonce", opaque="legacyopaque"',
          ],
        ]),
      });

      // 200 success
      mockFetch.mockResolvedValueOnce({
        status: 200,
        headers: new Map(),
        text: async () => JSON.stringify({ success: true, data: { id: 42 } }),
        json: async () => ({ success: true, data: { id: 42 } }),
      });

      const result = await client.legacyPost("AdresseCreate", {
        typ: "firma",
        name: "Acme GmbH",
      });

      expect(result).toEqual({ success: true, data: { id: 42 } });

      // Verify the second call (authenticated) posted to correct URL
      const secondCall = mockFetch.mock.calls[1];
      expect(secondCall[0]).toBe("https://erp.test/api/AdresseCreate");
    });

    it("extracts nested xml data when response has status + xml (ZeiterfassungGet pattern)", async () => {
      // The real ZeiterfassungGet returns: {status:{messageCode:"1"}, xml:{zeiterfassungen:{zeiterfassung:[...]}}}
      const apiBody = {
        status: { action: "ZeiterfassungGet", message: "OK", messageCode: "1" },
        xml: {
          zeiterfassungen: {
            zeiterfassung: [
              { id: 5, aufgabe: "Entwicklung", von: "2026-04-01 08:00:00", bis: "2026-04-01 12:00:00" },
              { id: 6, aufgabe: "Support", von: "2026-04-01 13:00:00", bis: "2026-04-01 17:00:00" },
            ],
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        status: 401,
        headers: new Map([
          ["www-authenticate", 'Digest realm="Xentral-API", qop="auth", nonce="n", opaque="o"'],
        ]),
      });
      mockFetch.mockResolvedValueOnce({
        status: 200,
        headers: new Map(),
        text: async () => JSON.stringify(apiBody),
      });

      const result = await client.legacyPost("ZeiterfassungGet", { adresse: 1 });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(apiBody.xml);
      expect((result.data as any).zeiterfassungen.zeiterfassung).toHaveLength(2);
      expect((result.data as any).zeiterfassungen.zeiterfassung[0].id).toBe(5);
    });

    it("extracts xml data when response has only xml wrapper (no status)", async () => {
      // Some endpoints return {xml:{...}} without a status wrapper
      const apiBody = {
        xml: {
          adressen: { adresse: [{ id: 1, name: "Test GmbH" }] },
        },
      };

      mockFetch.mockResolvedValueOnce({
        status: 401,
        headers: new Map([
          ["www-authenticate", 'Digest realm="Xentral-API", qop="auth", nonce="n", opaque="o"'],
        ]),
      });
      mockFetch.mockResolvedValueOnce({
        status: 200,
        headers: new Map(),
        text: async () => JSON.stringify(apiBody),
      });

      const result = await client.legacyPost("AdresseListeGet", { typ: "firma" });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(apiBody.xml);
      expect((result.data as any).adressen.adresse[0].name).toBe("Test GmbH");
    });

    it("extracts xml data for StechuhrSummary (status + xml pattern)", async () => {
      const apiBody = {
        status: { action: "StechuhrSummary", message: "OK", messageCode: "1" },
        xml: {
          summary: {
            soll_stunden: "40.00",
            ist_stunden: "38.50",
            ueberstunden: "-1.50",
            urlaubstage: "28",
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        status: 401,
        headers: new Map([
          ["www-authenticate", 'Digest realm="Xentral-API", qop="auth", nonce="n", opaque="o"'],
        ]),
      });
      mockFetch.mockResolvedValueOnce({
        status: 200,
        headers: new Map(),
        text: async () => JSON.stringify(apiBody),
      });

      const result = await client.legacyPost("StechuhrSummary", { adresse: 1 });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(apiBody.xml);
      expect((result.data as any).summary.soll_stunden).toBe("40.00");
    });

    it("still extracts data from status+data pattern (non-xml)", async () => {
      // Ensure the classic {status, data} pattern still works
      const apiBody = {
        status: { action: "SomeAction", message: "OK", messageCode: "1" },
        data: { id: 99, name: "classic" },
      };

      mockFetch.mockResolvedValueOnce({
        status: 401,
        headers: new Map([
          ["www-authenticate", 'Digest realm="Xentral-API", qop="auth", nonce="n", opaque="o"'],
        ]),
      });
      mockFetch.mockResolvedValueOnce({
        status: 200,
        headers: new Map(),
        text: async () => JSON.stringify(apiBody),
      });

      const result = await client.legacyPost("SomeAction", {});

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: 99, name: "classic" });
    });
  });

  describe("error handling", () => {
    it("throws OpenXEApiError on 5xx response", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 401,
        headers: new Map([
          [
            "www-authenticate",
            'Digest realm="Xentral-API", qop="auth", nonce="n", opaque="o"',
          ],
        ]),
      });
      mockFetch.mockResolvedValueOnce({
        status: 500,
        headers: new Map(),
        json: async () => ({
          error: {
            code: 7499,
            http_code: 500,
            message: "Internal Server Error",
          },
        }),
      });

      await expect(client.get("/v1/adressen")).rejects.toThrow(
        "Internal Server Error"
      );
    });
  });

  describe("404 handling", () => {
    it("returns empty data for list endpoint on 404", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 401,
        headers: new Map([
          [
            "www-authenticate",
            'Digest realm="Xentral-API", qop="auth", nonce="n", opaque="o"',
          ],
        ]),
      });
      mockFetch.mockResolvedValueOnce({
        status: 404,
        headers: new Map(),
        json: async () => ({
          error: {
            code: 7452,
            http_code: 404,
            message: "Not found",
          },
        }),
      });

      const result = await client.get("/v1/lagercharge");
      expect(result.data).toEqual([]);
      expect(result.pagination).toBeUndefined();
    });

    it("throws EndpointNotAvailableError for single-resource 404", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 401,
        headers: new Map([
          [
            "www-authenticate",
            'Digest realm="Xentral-API", qop="auth", nonce="n", opaque="o"',
          ],
        ]),
      });
      mockFetch.mockResolvedValueOnce({
        status: 404,
        headers: new Map(),
        json: async () => ({
          error: {
            code: 7452,
            http_code: 404,
            message: "Resource not found",
            href: "/api/v1/adressen/99999",
          },
        }),
      });

      const err = await client
        .get("/v1/adressen/99999")
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(EndpointNotAvailableError);
      expect((err as EndpointNotAvailableError).message).toBe(
        "Resource not available on this OpenXE instance: /v1/adressen/99999"
      );
    });

    it("returns empty data for belege list endpoint on 404", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 401,
        headers: new Map([
          [
            "www-authenticate",
            'Digest realm="Xentral-API", qop="auth", nonce="n", opaque="o"',
          ],
        ]),
      });
      mockFetch.mockResolvedValueOnce({
        status: 404,
        headers: new Map(),
        json: async () => ({
          error: { code: 7452, http_code: 404, message: "Not found" },
        }),
      });

      const result = await client.get("/v1/belege/gutschriften");
      expect(result.data).toEqual([]);
      expect(result.pagination).toBeUndefined();
    });
  });
});
