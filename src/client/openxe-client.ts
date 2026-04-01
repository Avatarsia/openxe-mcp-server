import { DigestAuth } from "./digest-auth.js";
import type { OpenXEConfig } from "../config.js";

export interface Pagination {
  totalCount: number;
  page: number;
  itemsPerPage: number;
}

export interface ApiResponse<T = unknown> {
  data: T;
  pagination?: Pagination;
}

export interface LegacyResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export class OpenXEApiError extends Error {
  constructor(
    public readonly code: number,
    public readonly httpCode: number,
    message: string,
    public readonly href?: string
  ) {
    super(message);
    this.name = "OpenXEApiError";
  }
}

/**
 * Thrown when a REST v1 endpoint returns 404, meaning the endpoint
 * is not registered on this OpenXE instance (module not installed/enabled).
 */
export class EndpointNotAvailableError extends Error {
  constructor(public readonly path: string) {
    super(
      `Resource not available on this OpenXE instance: ${path}`
    );
    this.name = "EndpointNotAvailableError";
  }
}

type FetchFn = typeof globalThis.fetch;

/**
 * HTTP client for OpenXE API with automatic Digest Auth handling.
 *
 * - Caches nonce across requests for the nonce's 24h lifetime
 * - Automatically re-authenticates on nonce expiry (401 after cached nonce)
 * - Supports REST v1 (GET/POST/PUT/DELETE) and Legacy API (POST /api/{Action})
 */
export class OpenXEClient {
  private auth: DigestAuth;
  private fetchFn: FetchFn;

  constructor(
    private config: OpenXEConfig,
    fetchFn?: FetchFn
  ) {
    this.auth = new DigestAuth(config.username, config.password);
    this.fetchFn = fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  /**
   * GET a REST v1 endpoint. Returns parsed JSON data + pagination headers.
   *
   * 404 handling: many REST v1 endpoints return 404 when the module is not
   * registered on a particular OpenXE instance. For list endpoints (path
   * without a trailing numeric ID) we return an empty result set. For single-
   * resource endpoints we throw {@link EndpointNotAvailableError}.
   */
  async get<T = unknown>(
    path: string,
    params?: Record<string, string | number | undefined>
  ): Promise<ApiResponse<T>> {
    const url = this.buildUrl(path, params);

    let response: Response;
    try {
      response = await this.authenticatedRequest("GET", url);
    } catch (err) {
      // authenticatedRequest calls handleErrorResponse for >= 400.
      // Intercept 404 before it becomes a fatal OpenXEApiError.
      if (err instanceof OpenXEApiError && err.httpCode === 404) {
        return this.handle404<T>(path);
      }
      throw err;
    }

    const data = (await response.json()) as T;
    const pagination = this.extractPagination(response.headers);

    return { data, pagination };
  }

  /**
   * Decide how to handle a 404 based on whether the path looks like a list
   * endpoint or a single-resource endpoint.
   */
  private handle404<T>(path: string): ApiResponse<T> {
    // A path ending with a numeric segment (e.g. /v1/artikel/42) is a
    // single-resource lookup — the caller expects exactly one item.
    const isSingleResource = /\/\d+$/.test(path);

    if (isSingleResource) {
      throw new EndpointNotAvailableError(path);
    }

    // List endpoint — return an empty collection so callers can proceed.
    return { data: [] as unknown as T, pagination: undefined };
  }

  /**
   * GET a raw binary response (e.g. PDF). Performs the same Digest Auth
   * handshake as {@link get} but does NOT attempt JSON parsing. Returns the
   * response body as a Node.js Buffer together with the Content-Type header.
   */
  async getRaw(
    path: string,
    params?: Record<string, string>
  ): Promise<{ data: Buffer; contentType: string }> {
    const url = this.buildUrl(path, params);
    const response = await this.authenticatedRequest("GET", url);

    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    const arrayBuf = await response.arrayBuffer();
    const data = Buffer.from(arrayBuf);

    return { data, contentType };
  }

  /**
   * POST to a REST v1 endpoint (e.g., creating delivery addresses).
   */
  async post<T = unknown>(
    path: string,
    body: Record<string, unknown>
  ): Promise<ApiResponse<T>> {
    const url = this.buildUrl(path);
    const response = await this.authenticatedRequest("POST", url, body);
    const data = (await response.json()) as T;
    return { data };
  }

  /**
   * POST to a REST v1 endpoint with URL-encoded form data.
   * Used for endpoints that reject JSON (e.g. /v1/dateien).
   */
  async postForm<T = unknown>(
    path: string,
    data: Record<string, string>
  ): Promise<ApiResponse<T>> {
    const url = this.buildUrl(path);
    const rawBody = new URLSearchParams(data).toString();
    const response = await this.authenticatedRequest("POST", url, undefined, {
      rawBody,
      contentType: "application/x-www-form-urlencoded",
    });
    const responseData = (await response.json()) as T;
    return { data: responseData };
  }

  /**
   * PUT to a REST v1 endpoint.
   */
  async put<T = unknown>(
    path: string,
    body: Record<string, unknown>
  ): Promise<ApiResponse<T>> {
    const url = this.buildUrl(path);
    const response = await this.authenticatedRequest("PUT", url, body);
    const data = (await response.json()) as T;
    return { data };
  }

  /**
   * DELETE a REST v1 resource.
   */
  async delete(path: string): Promise<void> {
    const url = this.buildUrl(path);
    const response = await this.authenticatedRequest("DELETE", url);
    if (response.status !== 204) {
      await this.handleErrorResponse(response);
    }
  }

  /**
   * POST to Legacy API endpoint: POST /api/{action} with body {"data": {...}}.
   *
   * Some OpenXE instances return XML instead of JSON for legacy endpoints.
   * We attempt JSON parsing first; if the response is XML we extract a
   * simple key/value result from the XML body.
   */
  async legacyPost<T = unknown>(
    action: string,
    data: Record<string, unknown>
  ): Promise<LegacyResponse<T>> {
    const url = `${this.config.baseUrl}/${action}`;
    const response = await this.authenticatedRequest("POST", url, {
      data,
    });

    const contentType = response.headers.get("content-type") ?? "";
    const text = await response.text();

    let result: LegacyResponse<T>;

    const isXml = contentType.includes("xml")
      || text.trimStart().startsWith("<?xml")
      || (text.trimStart().startsWith("<") && !text.trimStart().startsWith("<!")); // not HTML doctype

    if (isXml) {
      result = this.parseLegacyXml<T>(text);
    } else {
      try {
        result = this.normaliseLegacyJson<T>(JSON.parse(text));
      } catch {
        // Last resort: maybe it's XML without proper content-type
        if (text.includes("<") && text.includes(">")) {
          result = this.parseLegacyXml<T>(text);
        } else {
          throw new OpenXEApiError(
            0,
            response.status,
            `Legacy API ${action}: unparseable response — ${text.substring(0, 120)}`
          );
        }
      }
    }

    if (!result.success) {
      throw new OpenXEApiError(
        0,
        400,
        result.error ?? `Legacy API ${action} failed`
      );
    }

    return result;
  }

  /**
   * Normalise a parsed JSON legacy response into our LegacyResponse shape.
   *
   * OpenXE legacy JSON format:
   *   { status: { action, message, messageCode: "1" }, data: { ... } }
   *
   * We map messageCode "1" -> success: true.
   */
  private normaliseLegacyJson<T>(raw: any): LegacyResponse<T> {
    // Already in our expected shape (has explicit "success" key)
    if (typeof raw.success === "boolean") {
      return raw as LegacyResponse<T>;
    }

    // OpenXE native format: status.messageCode + data
    if (raw?.status?.messageCode !== undefined || raw?.status?.messagecode !== undefined) {
      const messageCode = raw.status.messageCode ?? raw.status.messagecode;
      const success = messageCode === "1" || messageCode === 1;
      const error = success ? undefined : (raw?.status?.message ?? "Unknown legacy error");
      return { success, data: raw.data as T, error };
    }

    // Some legacy endpoints return { xml: { ... } } with no status wrapper.
    // A 200 HTTP response is itself proof of success.
    if (raw?.xml !== undefined) {
      return { success: true, data: raw.xml as T };
    }

    // Fallback: treat any 200-level JSON blob as success with the whole body as data.
    return { success: true, data: raw as T };
  }

  /**
   * Minimal XML parser for legacy API responses.
   *
   * Typical shape from OpenXE:
   *   <response>
   *     <status><action>...</action><message>OK</message><messageCode>1</messageCode></status>
   *     <xml><key>value</key>...</xml>
   *   </response>
   */
  private parseLegacyXml<T>(xml: string): LegacyResponse<T> {
    // Determine success from <messageCode>1</messageCode>
    const codeMatch = xml.match(/<messageCode>\s*(\d+)\s*<\/messageCode>/i);
    const success = codeMatch ? codeMatch[1] === "1" : !xml.includes("<error>");

    // Extract <message> for error reporting
    const msgMatch = xml.match(/<message>([\s\S]*?)<\/message>/i);

    // Extract payload: <xml>...</xml> or <data>...</data>
    const payloadMatch = xml.match(/<(?:xml|data)>([\s\S]*?)<\/(?:xml|data)>/i);
    const payloadXml = payloadMatch ? payloadMatch[1] : xml;

    // Parse child elements into a record
    const record: Record<string, string> = {};
    const tagRegex = /<(\w+)>([\s\S]*?)<\/\1>/g;
    let m: RegExpExecArray | null;
    while ((m = tagRegex.exec(payloadXml)) !== null) {
      if (["response", "status", "xml", "data"].includes(m[1].toLowerCase())) continue;
      record[m[1]] = m[2].trim();
    }

    return {
      success,
      data: (Object.keys(record).length > 0 ? record : payloadXml.trim()) as unknown as T,
      error: success ? undefined : (msgMatch?.[1]?.trim() ?? "Unknown XML error"),
    };
  }

  private buildUrl(
    path: string,
    params?: Record<string, string | number | undefined>
  ): string {
    const url = new URL(`${this.config.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  private async authenticatedRequest(
    method: string,
    url: string,
    body?: Record<string, unknown>,
    options?: { rawBody?: string; contentType?: string }
  ): Promise<Response> {
    const parsed = new URL(url);
    const uri = parsed.search ? `${parsed.pathname}${parsed.search}` : parsed.pathname;
    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    // Determine serialised body and content-type
    const serialisedBody = options?.rawBody ?? (body ? JSON.stringify(body) : undefined);
    if (serialisedBody !== undefined) {
      headers["Content-Type"] = options?.contentType ?? "application/json";
    }

    // If we have a cached challenge, try the authenticated request first
    if (this.auth.hasChallenge()) {
      headers.Authorization = this.auth.generateHeader(method, uri);

      const response = await this.fetchFn(url, {
        method,
        headers,
        body: serialisedBody,
      });

      // If not 401, we're done
      if (response.status !== 401) {
        if (response.status >= 400) {
          await this.handleErrorResponse(response);
        }
        return response;
      }

      // 401 means nonce expired — parse new challenge and fall through
      const wwwAuth = response.headers.get("www-authenticate");
      if (wwwAuth) {
        this.auth.parseChallenge(wwwAuth);
      }
    }

    // No cached challenge or nonce expired — do initial 401 handshake
    if (!this.auth.hasChallenge()) {
      const challengeResponse = await this.fetchFn(url, {
        method,
        headers: { Accept: "application/json" },
      });

      if (challengeResponse.status !== 401) {
        // Unexpected — server didn't challenge us
        if (challengeResponse.status >= 400) {
          await this.handleErrorResponse(challengeResponse);
        }
        return challengeResponse;
      }

      const wwwAuth = challengeResponse.headers.get("www-authenticate");
      if (!wwwAuth) {
        throw new OpenXEApiError(
          7411,
          401,
          "Server returned 401 without WWW-Authenticate header"
        );
      }

      this.auth.parseChallenge(wwwAuth);
    }

    // Now send the authenticated request
    headers.Authorization = this.auth.generateHeader(method, uri);

    const response = await this.fetchFn(url, {
      method,
      headers,
      body: serialisedBody,
    });

    if (response.status >= 400) {
      await this.handleErrorResponse(response);
    }

    return response;
  }

  private async handleErrorResponse(response: Response): Promise<never> {
    let errorBody: any;
    try {
      errorBody = await response.json();
    } catch {
      throw new OpenXEApiError(
        7499,
        response.status,
        `HTTP ${response.status} with unparseable body`
      );
    }

    if (errorBody?.error) {
      throw new OpenXEApiError(
        errorBody.error.code ?? 7499,
        errorBody.error.http_code ?? response.status,
        errorBody.error.message ?? "Unknown error",
        errorBody.error.href
      );
    }

    throw new OpenXEApiError(
      7499,
      response.status,
      `HTTP ${response.status}`
    );
  }

  private extractPagination(
    headers: Headers | Map<string, string>
  ): Pagination | undefined {
    const get = (key: string) =>
      headers instanceof Map ? headers.get(key) : headers.get(key);

    const totalCount = get("x-total-count");
    if (!totalCount) return undefined;

    return {
      totalCount: parseInt(totalCount, 10),
      page: parseInt(get("x-page") ?? "1", 10),
      itemsPerPage: parseInt(get("x-items-per-page") ?? "20", 10),
    };
  }
}
