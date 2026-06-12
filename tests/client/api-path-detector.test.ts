import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  detectApiPath,
  ApiPathDetectionError,
  API_PATH_CANDIDATES,
} from "../../src/client/api-path-detector.js";

const mockFetch = vi.fn();

function digestChallenge() {
  return {
    status: 401,
    headers: new Map([
      ["www-authenticate", 'Digest realm="Xentral-API", qop="auth", nonce="n1", opaque="o1"'],
    ]),
    text: async () => "",
  };
}

function apacheForbidden() {
  return {
    status: 403,
    headers: new Map(),
    text: async () => "<!DOCTYPE HTML><html><body><h1>Forbidden</h1></body></html>",
  };
}

function notFound() {
  return {
    status: 404,
    headers: new Map(),
    text: async () => "",
  };
}

describe("detectApiPath", () => {
  beforeEach(() => mockFetch.mockReset());

  it("returns first candidate on 401 with Digest challenge", async () => {
    mockFetch.mockResolvedValueOnce(digestChallenge());
    const path = await detectApiPath("http://erp.test", mockFetch as any, 5000);
    expect(path).toBe("/api/index.php");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe("http://erp.test/api/index.php/v1/adressen?limit=1");
  });

  it("falls through to second candidate when first is Apache-blocked", async () => {
    mockFetch.mockResolvedValueOnce(apacheForbidden());
    mockFetch.mockResolvedValueOnce(digestChallenge());
    const path = await detectApiPath("http://erp.test", mockFetch as any, 5000);
    expect(path).toBe("/www/api/index.php");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("accepts 200 with JSON content-type as hit", async () => {
    mockFetch.mockResolvedValueOnce(apacheForbidden());
    mockFetch.mockResolvedValueOnce(apacheForbidden());
    mockFetch.mockResolvedValueOnce({
      status: 200,
      headers: new Map([["content-type", "application/json"]]),
      text: async () => '{"data":[]}',
    });
    const path = await detectApiPath("http://erp.test", mockFetch as any, 5000);
    expect(path).toBe("/api");
  });

  it("throws ApiPathDetectionError listing all candidates when none match", async () => {
    mockFetch.mockResolvedValueOnce(apacheForbidden());
    mockFetch.mockResolvedValueOnce(notFound());
    mockFetch.mockResolvedValueOnce(apacheForbidden());
    await expect(detectApiPath("http://erp.test", mockFetch as any, 5000)).rejects.toThrow(
      ApiPathDetectionError
    );
    mockFetch.mockResolvedValueOnce(apacheForbidden());
    mockFetch.mockResolvedValueOnce(notFound());
    mockFetch.mockResolvedValueOnce(apacheForbidden());
    const err = await detectApiPath("http://erp.test", mockFetch as any, 5000).catch((e) => e);
    expect(err.message).toContain("/api/index.php");
    expect(err.message).toContain("HTTP 403 (HTML error page");
    expect(err.message).toContain("HTTP 404");
    expect(err.message).toContain("OPENXE_API_PATH");
    expect(err.probes).toHaveLength(API_PATH_CANDIDATES.length);
  });

  it("throws unreachable error when fetch rejects", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("fetch failed: ECONNREFUSED"));
    const err = await detectApiPath("http://10.20.0.40", mockFetch as any, 5000).catch((e) => e);
    expect(err).toBeInstanceOf(ApiPathDetectionError);
    expect(err.message).toContain("unreachable");
    expect(err.message).toContain("OPENXE_URL");
  });

  it("does not send credentials in probes", async () => {
    mockFetch.mockResolvedValueOnce(digestChallenge());
    await detectApiPath("http://erp.test", mockFetch as any, 5000);
    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers.Authorization).toBeUndefined();
  });
});
