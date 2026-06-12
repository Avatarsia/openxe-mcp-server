# API Path Auto-Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der MCP-Server erkennt den OpenXE-REST-API-Pfad (`/api/index.php` vs. `/www/api/index.php` vs. `/api`) automatisch und heilt sich bei serverseitigen Pfad-Aenderungen selbst.

**Architecture:** Neues Modul `api-path-detector.ts` probt Kandidaten credential-frei (Erfolgssignal: 401 + Digest-Challenge oder 200 + JSON). `OpenXEClient` cached den erkannten Pfad pro Prozess (eager beim Start, lazy beim ersten Request, geteilte Promise gegen parallele Proben) und re-detected einmalig bei 403/404 mit HTML-Body (Self-Healing). Explizit gesetztes `OPENXE_API_PATH` deaktiviert alles.

**Tech Stack:** TypeScript, Node.js fetch, Zod, Vitest (gemockter fetch).

**Spec:** `docs/superpowers/specs/2026-06-12-api-path-autodetection-design.md`

**Spec-Abweichung (begruendet):** Self-Healing triggert nur bei Body-Klassifikation `html` (Apache-Fehlerseite), nicht bei jedem unparseablen 403/404. Grund: OpenXE-eigene 404 mit leerem Body (Modul nicht installiert) muss weiterhin im bestehenden `handle404`-Pfad landen (leere Liste), sonst Regression in `tests/resources/not-available.test.ts`.

**Wichtige Projektregeln:**
- `npm run build` nach jeder Aenderung an `src/`
- stdout ist MCP-Protokoll — Logging NUR via `console.error` (stderr)
- Keine Credentials hardcoden
- Commits auf `master`, kein Push ohne User-Go

---

### Task 1: Config — `OPENXE_API_PATH` optional machen

**Files:**
- Modify: `src/config.ts`
- Test: `tests/client/config.test.ts`

- [ ] **Step 1.1: Failing Tests schreiben**

`tests/client/config.test.ts` — die drei bestehenden `baseUrl`-Assertions ersetzen und einen Test ergaenzen. Neue Semantik: `baseUrl` = nur Server-URL, `apiPath` = expliziter Pfad oder `null` (= Auto-Detection):

```typescript
  it("loads valid config from environment", () => {
    process.env.OPENXE_URL = "https://erp.example.com";
    process.env.OPENXE_USERNAME = "apiuser";
    process.env.OPENXE_PASSWORD = "secret123";
    delete process.env.OPENXE_API_PATH;
    const config = loadConfig();
    expect(config.baseUrl).toBe("https://erp.example.com");
    expect(config.apiPath).toBeNull();
    expect(config.username).toBe("apiuser");
    expect(config.password).toBe("secret123");
    expect(config.timeout).toBe(30000);
  });

  it("strips trailing slash from OPENXE_URL", () => {
    process.env.OPENXE_URL = "https://erp.example.com/";
    process.env.OPENXE_USERNAME = "apiuser";
    process.env.OPENXE_PASSWORD = "secret123";
    delete process.env.OPENXE_API_PATH;
    const config = loadConfig();
    expect(config.baseUrl).toBe("https://erp.example.com");
  });

  it("allows overriding API path via OPENXE_API_PATH", () => {
    process.env.OPENXE_URL = "https://erp.example.com";
    process.env.OPENXE_USERNAME = "apiuser";
    process.env.OPENXE_PASSWORD = "secret123";
    process.env.OPENXE_API_PATH = "/api";
    const config = loadConfig();
    expect(config.baseUrl).toBe("https://erp.example.com");
    expect(config.apiPath).toBe("/api");
  });

  it("returns apiPath null when OPENXE_API_PATH is unset (auto-detection)", () => {
    process.env.OPENXE_URL = "https://erp.example.com";
    process.env.OPENXE_USERNAME = "apiuser";
    process.env.OPENXE_PASSWORD = "secret123";
    delete process.env.OPENXE_API_PATH;
    const config = loadConfig();
    expect(config.apiPath).toBeNull();
  });
```

Achtung: `afterEach` stellt `origEnv` wieder her — falls die Umgebung global `OPENXE_API_PATH` setzt, schlaegt `delete` fehl. Die `delete process.env.OPENXE_API_PATH`-Zeilen sind deshalb in jedem Test explizit.

- [ ] **Step 1.2: Tests laufen lassen — muessen fehlschlagen**

Run: `npx vitest run tests/client/config.test.ts`
Expected: FAIL — `config.baseUrl` enthaelt noch `/api/index.php`, `config.apiPath` ist `undefined`.

- [ ] **Step 1.3: `src/config.ts` anpassen**

```typescript
const EnvSchema = z.object({
  OPENXE_URL: z.string().url("OPENXE_URL must be a valid URL").transform((url) => url.replace(/\/+$/, "")),
  OPENXE_API_PATH: z
    .string()
    .transform((p) => "/" + p.replace(/^\/+|\/+$/g, ""))
    .optional(),
  OPENXE_USERNAME: z.string().min(1, "OPENXE_USERNAME is required"),
  OPENXE_PASSWORD: z.string().min(1, "OPENXE_PASSWORD is required"),
  OPENXE_TIMEOUT: z.coerce.number().positive().default(30000),
  OPENXE_MODE: z.enum(["router", "full", "readonly"]).default("router"),
});
```

Interface erweitern:

```typescript
export interface OpenXEConfig {
  /** Server-URL ohne API-Pfad, z.B. "http://10.20.0.40" */
  baseUrl: string;
  /**
   * Expliziter API-Pfad (z.B. "/api/index.php"). Leerstring erlaubt
   * (Pfad bereits in baseUrl enthalten — Test-Setups).
   * null = Auto-Detection durch den Client.
   */
  apiPath: string | null;
  username: string;
  password: string;
  timeout: number;
  mode: OpenXEMode;
}
```

Return-Block in `loadConfig()`:

```typescript
  return {
    baseUrl: env.OPENXE_URL,
    apiPath: env.OPENXE_API_PATH ?? null,
    username: env.OPENXE_USERNAME,
    password: env.OPENXE_PASSWORD,
    timeout: env.OPENXE_TIMEOUT,
    mode: env.OPENXE_MODE,
  };
```

- [ ] **Step 1.4: Bestehende Test-Configs um `apiPath` ergaenzen (TS-Compile)**

In diesen Dateien dem jeweiligen `OpenXEConfig`-Literal die Zeile `apiPath: "",` direkt nach `baseUrl` hinzufuegen (die dortigen `baseUrl`-Werte enthalten den Pfad bereits — Leerstring = nichts anhaengen):

- `tests/client/openxe-client.test.ts:12-17`
- `tests/resources/addresses.test.ts:28`
- `tests/resources/not-available.test.ts:12`
- `tests/resources/articles.test.ts:10`

In `tests/integration/smart-filters-live.test.ts:39-41` stattdessen `apiPath: null,` ergaenzen (Live-Test nutzt dann die echte Auto-Detection).

- [ ] **Step 1.5: Tests + Build verifizieren**

Run: `npx vitest run tests/client/config.test.ts && npm run build`
Expected: PASS (alle config-Tests), Build ohne Fehler.

Hinweis: Der Server ist nach diesem Task bis Task 3 funktional unvollstaendig (Client haengt noch keinen Pfad an) — kein Deploy zwischen den Tasks.

- [ ] **Step 1.6: Commit**

```bash
git add src/config.ts tests/client/config.test.ts tests/client/openxe-client.test.ts tests/resources/addresses.test.ts tests/resources/not-available.test.ts tests/resources/articles.test.ts tests/integration/smart-filters-live.test.ts
git commit -m "feat(config): make OPENXE_API_PATH optional, split baseUrl/apiPath"
```

---

### Task 2: Detector-Modul `api-path-detector.ts`

**Files:**
- Create: `src/client/api-path-detector.ts`
- Test: `tests/client/api-path-detector.test.ts` (neu)

- [ ] **Step 2.1: Failing Tests schreiben**

`tests/client/api-path-detector.test.ts`:

```typescript
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
```

- [ ] **Step 2.2: Tests laufen lassen — muessen fehlschlagen**

Run: `npx vitest run tests/client/api-path-detector.test.ts`
Expected: FAIL — Modul existiert nicht.

- [ ] **Step 2.3: `src/client/api-path-detector.ts` implementieren**

```typescript
type FetchFn = typeof globalThis.fetch;

/** Kandidaten in Probier-Reihenfolge — haeufigstes Layout zuerst. */
export const API_PATH_CANDIDATES = [
  "/api/index.php",      // DocumentRoot = www/
  "/www/api/index.php",  // DocumentRoot = OpenXE-Repo-Root (offizielle INSTALL.md)
  "/api",                // Setup mit Rewrite-Rules
] as const;

export interface ProbeResult {
  candidate: string;
  status: number;
  bodyKind: "html" | "json" | "empty" | "unknown";
}

export class ApiPathDetectionError extends Error {
  constructor(
    message: string,
    public readonly probes: ProbeResult[]
  ) {
    super(message);
    this.name = "ApiPathDetectionError";
  }
}

function classifyBody(text: string): ProbeResult["bodyKind"] {
  const t = text.trim();
  if (t.length === 0) return "empty";
  if (t.startsWith("<")) return "html";
  try {
    JSON.parse(t);
    return "json";
  } catch {
    return "unknown";
  }
}

function describeProbe(p: ProbeResult): string {
  const detail =
    p.bodyKind === "html"
      ? " (HTML error page — Apache blocked the request)"
      : p.bodyKind === "json"
        ? " (JSON)"
        : p.bodyKind === "empty"
          ? " (empty body)"
          : "";
  return `  ${p.candidate.padEnd(20)} -> HTTP ${p.status}${detail}`;
}

/**
 * Probes the candidate API paths on the given OpenXE server without
 * credentials. A path counts as hit when it answers like the OpenXE API:
 * 401 with a Digest challenge, or 200 with JSON.
 */
export async function detectApiPath(
  serverUrl: string,
  fetchFn: FetchFn,
  timeout: number
): Promise<string> {
  const probes: ProbeResult[] = [];

  for (const candidate of API_PATH_CANDIDATES) {
    const url = `${serverUrl}${candidate}/v1/adressen?limit=1`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    let response: Response;
    try {
      response = await fetchFn(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
    } catch (err) {
      throw new ApiPathDetectionError(
        `OpenXE at ${serverUrl} is unreachable (${err instanceof Error ? err.message : String(err)}). ` +
          `Check: server running? IP/port correct in OPENXE_URL? Firewall?`,
        probes
      );
    } finally {
      clearTimeout(timer);
    }

    const wwwAuth = response.headers.get("www-authenticate") ?? "";
    if (response.status === 401 && wwwAuth.includes("Digest")) {
      return candidate;
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (response.status === 200 && contentType.includes("json")) {
      return candidate;
    }

    let text = "";
    try {
      text = await response.text();
    } catch {
      // body not readable — classify as unknown
    }
    probes.push({ candidate, status: response.status, bodyKind: classifyBody(text) });
  }

  throw new ApiPathDetectionError(
    `OpenXE API path detection failed for ${serverUrl} — no candidate responded like an OpenXE API:\n` +
      probes.map(describeProbe).join("\n") +
      "\nCheck: (1) Is OPENXE_URL correct? (2) Is the OpenXE REST API module enabled? " +
      "(3) Set OPENXE_API_PATH manually if your install uses a custom layout.",
    probes
  );
}
```

- [ ] **Step 2.4: Tests verifizieren**

Run: `npx vitest run tests/client/api-path-detector.test.ts && npm run build`
Expected: PASS (6 Tests), Build ok.

- [ ] **Step 2.5: Commit**

```bash
git add src/client/api-path-detector.ts tests/client/api-path-detector.test.ts
git commit -m "feat(client): add credential-free API path detector with actionable errors"
```

---

### Task 3: Client-Integration — dynamischer Basis-Pfad, eager/lazy Detection

**Files:**
- Modify: `src/client/openxe-client.ts`
- Test: `tests/client/openxe-client.test.ts` (neue describe-Gruppe)

- [ ] **Step 3.1: Failing Tests schreiben**

In `tests/client/openxe-client.test.ts` neue describe-Gruppe anhaengen:

```typescript
describe("API path auto-detection", () => {
  const autoConfig: OpenXEConfig = {
    baseUrl: "https://erp.test",
    apiPath: null,
    username: "testuser",
    password: "testpass",
    timeout: 5000,
  };

  const digestChallenge = () => ({
    status: 401,
    headers: new Map([
      ["www-authenticate", 'Digest realm="Xentral-API", qop="auth", nonce="n1", opaque="o1"'],
    ]),
    text: async () => "",
  });

  const apacheForbidden = () => ({
    status: 403,
    headers: new Map(),
    text: async () => "<html><body><h1>Forbidden</h1></body></html>",
  });

  beforeEach(() => mockFetch.mockReset());

  it("detects path lazily on first request and caches it", async () => {
    const client = new OpenXEClient(autoConfig, mockFetch as any);
    // Probe 1: /api/index.php blocked, Probe 2: /www/api/index.php hit
    mockFetch.mockResolvedValueOnce(apacheForbidden());
    mockFetch.mockResolvedValueOnce(digestChallenge());
    // Request: Digest-Handshake (401) + Daten (200)
    mockFetch.mockResolvedValueOnce(digestChallenge());
    mockFetch.mockResolvedValueOnce({
      status: 200,
      headers: new Map(),
      json: async () => [{ id: 1 }],
    });

    const result = await client.get("/v1/adressen");
    expect(result.data).toEqual([{ id: 1 }]);
    // Request-URLs (Calls 3+4) nutzen den erkannten Pfad
    expect(mockFetch.mock.calls[2][0]).toContain("https://erp.test/www/api/index.php/v1/adressen");

    // Zweiter Request: keine erneuten Proben
    mockFetch.mockResolvedValueOnce({
      status: 200,
      headers: new Map(),
      json: async () => [{ id: 2 }],
    });
    await client.get("/v1/artikel");
    // 4 Calls vorher + 1 neuer = 5 (keine Probe dazwischen)
    expect(mockFetch).toHaveBeenCalledTimes(5);
  });

  it("skips detection entirely when apiPath is explicit", async () => {
    const fixedConfig: OpenXEConfig = { ...autoConfig, apiPath: "/api/index.php" };
    const client = new OpenXEClient(fixedConfig, mockFetch as any);
    mockFetch.mockResolvedValueOnce(digestChallenge());
    mockFetch.mockResolvedValueOnce({
      status: 200,
      headers: new Map(),
      json: async () => [],
    });
    await client.get("/v1/adressen");
    expect(mockFetch.mock.calls[0][0]).toBe("https://erp.test/api/index.php/v1/adressen");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("runs only one probe series for parallel first requests", async () => {
    const client = new OpenXEClient(autoConfig, mockFetch as any);
    // Eine Probe (Hit beim ersten Kandidaten), dann zwei Requests:
    // beide muessen sich die Detection-Promise teilen.
    mockFetch.mockResolvedValueOnce(digestChallenge()); // Probe
    mockFetch.mockResolvedValue({
      status: 200,
      headers: new Map(),
      json: async () => [],
      text: async () => "[]",
    });

    await Promise.all([client.get("/v1/adressen"), client.get("/v1/artikel")]);
    const probeCalls = mockFetch.mock.calls.filter((c) =>
      String(c[0]).includes("limit=1") && c[1]?.headers?.Authorization === undefined && String(c[0]).includes("/v1/adressen?limit=1")
    );
    expect(probeCalls.length).toBe(1);
  });

  it("startApiPathDetection never throws when server is offline", async () => {
    const client = new OpenXEClient(autoConfig, mockFetch as any);
    mockFetch.mockRejectedValue(new TypeError("fetch failed: ECONNREFUSED"));
    expect(() => client.startApiPathDetection()).not.toThrow();
    // Lazy-Retry: naechster Request stoesst neue Detection an
    await new Promise((r) => setImmediate(r)); // eager-Promise abwarten
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce(digestChallenge()); // Probe hit
    mockFetch.mockResolvedValueOnce(digestChallenge()); // Handshake
    mockFetch.mockResolvedValueOnce({
      status: 200,
      headers: new Map(),
      json: async () => [],
    });
    const result = await client.get("/v1/adressen");
    expect(result.data).toEqual([]);
  });
});
```

- [ ] **Step 3.2: Tests laufen lassen — muessen fehlschlagen**

Run: `npx vitest run tests/client/openxe-client.test.ts`
Expected: FAIL — `startApiPathDetection` existiert nicht; URLs ohne Detection falsch.

- [ ] **Step 3.3: `OpenXEClient` umbauen**

Import am Dateianfang ergaenzen:

```typescript
import { detectApiPath, API_PATH_CANDIDATES } from "./api-path-detector.js";
```

Felder + Konstruktor:

```typescript
export class OpenXEClient {
  private auth: DigestAuth;
  private fetchFn: FetchFn;
  private resolvedApiPath: string | null;
  private detectionPromise: Promise<string> | null = null;

  constructor(
    private config: OpenXEConfig,
    fetchFn?: FetchFn
  ) {
    this.auth = new DigestAuth(config.username, config.password);
    this.fetchFn = fetchFn ?? globalThis.fetch.bind(globalThis);
    this.resolvedApiPath = config.apiPath;
  }
```

Neue Methoden (nach dem Konstruktor):

```typescript
  /**
   * Resolve the effective API base URL. With an explicit apiPath this is
   * static; otherwise the path is auto-detected once and cached for the
   * process lifetime. A failed detection clears the cache so the next
   * request retries (lazy fallback).
   */
  private async apiBase(): Promise<string> {
    if (this.resolvedApiPath !== null) {
      return `${this.config.baseUrl}${this.resolvedApiPath}`;
    }
    if (!this.detectionPromise) {
      this.detectionPromise = detectApiPath(
        this.config.baseUrl,
        this.fetchFn,
        this.config.timeout
      );
    }
    try {
      const path = await this.detectionPromise;
      if (this.resolvedApiPath === null) {
        this.resolvedApiPath = path;
        console.error(`[openxe-mcp] OpenXE API path detected: ${path}`);
      }
      return `${this.config.baseUrl}${this.resolvedApiPath}`;
    } catch (err) {
      this.detectionPromise = null;
      throw err;
    }
  }

  /**
   * Eager detection at server startup. Never throws — an unreachable
   * OpenXE must not prevent the MCP server from starting; the next
   * request retries lazily.
   */
  startApiPathDetection(): void {
    if (this.config.apiPath !== null) return;
    void this.apiBase().catch((err) => {
      const reason = err instanceof Error ? err.message.split("\n")[0] : String(err);
      console.error(
        `[openxe-mcp] API path detection at startup failed (${reason}) — will retry on first request.`
      );
    });
  }
```

`buildUrl` bekommt die Basis als Parameter (ersetzt `this.config.baseUrl`-Zugriff):

```typescript
  private buildUrl(
    base: string,
    path: string,
    params?: Record<string, string | number | undefined>
  ): string {
    const url = new URL(`${base}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }
```

Alle Aufrufer anpassen — jeweils erste Zeile(n) der Methode:

```typescript
// get (Zeile ~79):
const url = this.buildUrl(await this.apiBase(), path, params);
// getRaw (~125):
const url = this.buildUrl(await this.apiBase(), path, params);
// post (~142):
const url = this.buildUrl(await this.apiBase(), path);
// postForm (~156):
const url = this.buildUrl(await this.apiBase(), path);
// put (~173):
const url = this.buildUrl(await this.apiBase(), path);
// delete (~183):
const url = this.buildUrl(await this.apiBase(), path);
// legacyPost (~201):
const url = `${await this.apiBase()}/${action}`;
```

- [ ] **Step 3.4: Tests + Build verifizieren**

Run: `npx vitest run tests/client && npm run build`
Expected: PASS (alle Client-Tests inkl. neuer Gruppe; bestehende Tests laufen unveraendert, da `apiPath: ""` Detection deaktiviert).

- [ ] **Step 3.5: Commit**

```bash
git add src/client/openxe-client.ts tests/client/openxe-client.test.ts
git commit -m "feat(client): lazy/eager API path detection with shared promise cache"
```

---

### Task 4: Self-Healing bei Apache-403/404 + aussagekraeftige Fehler

**Files:**
- Modify: `src/client/openxe-client.ts`
- Test: `tests/client/openxe-client.test.ts` (neue describe-Gruppe)
- Check: alle Tests, die `unparseable body`-Mocks nutzen (json-only Mocks fuer >=400-Responses brauchen jetzt `text`)

- [ ] **Step 4.1: Failing Tests schreiben**

Neue describe-Gruppe in `tests/client/openxe-client.test.ts`:

```typescript
describe("self-healing on Apache-blocked paths", () => {
  const autoConfig: OpenXEConfig = {
    baseUrl: "https://erp.test",
    apiPath: null,
    username: "testuser",
    password: "testpass",
    timeout: 5000,
  };

  const digestChallenge = () => ({
    status: 401,
    headers: new Map([
      ["www-authenticate", 'Digest realm="Xentral-API", qop="auth", nonce="n1", opaque="o1"'],
    ]),
    text: async () => "",
  });

  const apacheForbidden = () => ({
    status: 403,
    headers: new Map(),
    text: async () => "<html><body><h1>Forbidden</h1></body></html>",
  });

  beforeEach(() => mockFetch.mockReset());

  it("re-detects and retries once when the cached path gets blocked", async () => {
    const client = new OpenXEClient(autoConfig, mockFetch as any);
    // Initiale Detection: Kandidat 1 hit
    mockFetch.mockResolvedValueOnce(digestChallenge()); // Probe /api/index.php -> hit
    // Request 1: Handshake + Daten ueber /api/index.php
    mockFetch.mockResolvedValueOnce(digestChallenge());
    mockFetch.mockResolvedValueOnce({ status: 200, headers: new Map(), json: async () => [] });
    await client.get("/v1/adressen");

    // Server-Umbau: /api/index.php jetzt geblockt, /www/api/index.php aktiv
    mockFetch.mockResolvedValueOnce(apacheForbidden()); // Request 2 -> 403 HTML
    mockFetch.mockResolvedValueOnce(apacheForbidden()); // Re-Detection Probe 1 -> blocked
    mockFetch.mockResolvedValueOnce(digestChallenge()); // Re-Detection Probe 2 -> hit
    mockFetch.mockResolvedValueOnce({ status: 200, headers: new Map(), json: async () => [{ id: 7 }] }); // Retry mit neuem Pfad (Nonce gecacht)

    const result = await client.get("/v1/adressen");
    expect(result.data).toEqual([{ id: 7 }]);
    const lastUrl = String(mockFetch.mock.calls[mockFetch.mock.calls.length - 1][0]);
    expect(lastUrl).toContain("/www/api/index.php/");
  });

  it("throws enriched error when re-detection finds the same path", async () => {
    const client = new OpenXEClient(autoConfig, mockFetch as any);
    mockFetch.mockResolvedValueOnce(digestChallenge()); // Detection: Kandidat 1 hit
    mockFetch.mockResolvedValueOnce(apacheForbidden()); // Request -> 403 HTML
    mockFetch.mockResolvedValueOnce(digestChallenge()); // Re-Detection: Kandidat 1 wieder hit

    const err = await client.get("/v1/adressen").catch((e) => e);
    expect(err.message).toContain("re-detection returned the same path");
  });

  it("throws enriched error when re-detection fails entirely", async () => {
    const client = new OpenXEClient(autoConfig, mockFetch as any);
    mockFetch.mockResolvedValueOnce(digestChallenge()); // Detection: Kandidat 1 hit
    mockFetch.mockResolvedValueOnce(apacheForbidden()); // Request -> 403 HTML
    mockFetch.mockResolvedValueOnce(apacheForbidden()); // Re-Detection Probe 1
    mockFetch.mockResolvedValueOnce(apacheForbidden()); // Re-Detection Probe 2
    mockFetch.mockResolvedValueOnce(apacheForbidden()); // Re-Detection Probe 3

    const err = await client.get("/v1/adressen").catch((e) => e);
    expect(err.message).toContain("no working alternative");
    expect(err.message).toContain(".htaccess");
  });

  it("does NOT re-detect on a real permission 403 with JSON body", async () => {
    const client = new OpenXEClient(autoConfig, mockFetch as any);
    mockFetch.mockResolvedValueOnce(digestChallenge()); // Detection
    mockFetch.mockResolvedValueOnce({
      status: 403,
      headers: new Map([["content-type", "application/json"]]),
      text: async () => JSON.stringify({ error: { code: 403, message: "No permission for module" } }),
      json: async () => ({ error: { code: 403, message: "No permission for module" } }),
    });

    const err = await client.get("/v1/adressen").catch((e) => e);
    expect(err.message).toContain("No permission for module");
    // Detection-Probe (1) + Request (1) = 2 — KEINE Re-Detection-Probes
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("does NOT self-heal when apiPath is explicit", async () => {
    const fixedConfig: OpenXEConfig = { ...autoConfig, apiPath: "/api/index.php" };
    const client = new OpenXEClient(fixedConfig, mockFetch as any);
    mockFetch.mockResolvedValueOnce(apacheForbidden());

    const err = await client.get("/v1/adressen").catch((e) => e);
    expect(err.message).toContain("HTML error page");
    expect(mockFetch).toHaveBeenCalledTimes(1); // keine Proben
  });
});
```

- [ ] **Step 4.2: Tests laufen lassen — muessen fehlschlagen**

Run: `npx vitest run tests/client/openxe-client.test.ts`
Expected: FAIL — kein Self-Healing, alte Fehlermeldung.

- [ ] **Step 4.3: `UnparseableBodyError` + neue `handleErrorResponse`**

Nach der `OpenXEApiError`-Klasse in `src/client/openxe-client.ts`:

```typescript
/**
 * Thrown when an error response body is not JSON — typically an Apache
 * HTML error page, which means the request never reached OpenXE.
 */
export class UnparseableBodyError extends OpenXEApiError {
  constructor(
    httpCode: number,
    public readonly bodyKind: "html" | "empty" | "unknown",
    message: string
  ) {
    super(7499, httpCode, message);
    this.name = "UnparseableBodyError";
  }
}
```

`handleErrorResponse` komplett ersetzen (liest `text()` statt `json()`, klassifiziert den Body):

```typescript
  private async handleErrorResponse(response: Response): Promise<never> {
    let text = "";
    try {
      text = await response.text();
    } catch {
      // body not readable
    }

    let errorBody: any;
    try {
      errorBody = JSON.parse(text);
    } catch {
      const trimmed = text.trim();
      const kind: "html" | "empty" | "unknown" =
        trimmed.startsWith("<") ? "html" : trimmed === "" ? "empty" : "unknown";
      const message =
        kind === "html"
          ? `HTTP ${response.status} with non-JSON body — the web server returned an HTML error page ` +
            `instead of an API response (request likely blocked before reaching OpenXE).`
          : `HTTP ${response.status} with unparseable body`;
      throw new UnparseableBodyError(response.status, kind, message);
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
```

- [ ] **Step 4.4: Self-Healing-Wrapper einbauen**

Neue private Methoden:

```typescript
  /** Apache-HTML-403/404 bei aktiver Auto-Detection = Pfad-Problem. */
  private isPathProblem(err: unknown): err is UnparseableBodyError {
    return (
      err instanceof UnparseableBodyError &&
      err.bodyKind === "html" &&
      (err.httpCode === 403 || err.httpCode === 404) &&
      this.config.apiPath === null
    );
  }

  /**
   * Runs a request against the resolved API base. If the request fails
   * with an Apache-blocked-path signature, the path is re-detected and
   * the request retried exactly once. Errors from the retry propagate
   * unchanged (loop guard).
   */
  private async withSelfHealing<T>(run: (base: string) => Promise<T>): Promise<T> {
    const base = await this.apiBase();
    try {
      return await run(base);
    } catch (err) {
      if (!this.isPathProblem(err)) throw err;

      const oldPath = this.resolvedApiPath;
      this.resolvedApiPath = null;
      this.detectionPromise = null;

      let newBase: string;
      try {
        newBase = await this.apiBase();
      } catch {
        this.resolvedApiPath = oldPath; // restore: detection found nothing better
        throw new OpenXEApiError(
          7499,
          err.httpCode,
          `${err.message}\nAPI path re-detection found no working alternative ` +
            `(tried: ${API_PATH_CANDIDATES.join(", ")}). The previously working path may have ` +
            `been blocked server-side (.htaccess / vhost config).`
        );
      }

      if (newBase === base) {
        throw new OpenXEApiError(
          7499,
          err.httpCode,
          `${err.message}\nAPI path re-detection returned the same path — the server is ` +
            `blocking this specific request path.`
        );
      }

      console.error(
        `[openxe-mcp] API path changed server-side — switched from ${oldPath} and retrying once.`
      );
      return await run(newBase);
    }
  }
```

Alle public Request-Methoden auf den Wrapper umstellen. Muster — `get` wird zu:

```typescript
  async get<T = unknown>(
    path: string,
    params?: Record<string, string | number | undefined>
  ): Promise<ApiResponse<T>> {
    return this.withSelfHealing(async (base) => {
      const url = this.buildUrl(base, path, params);

      let response: Response;
      try {
        response = await this.authenticatedRequest("GET", url);
      } catch (err) {
        // 404 vom OpenXE-Backend (Modul fehlt) -> Empty-List-Verhalten.
        // 404 mit HTML-Body ist ein Pfad-Problem und gehoert dem Self-Healing.
        if (
          err instanceof OpenXEApiError &&
          err.httpCode === 404 &&
          !(err instanceof UnparseableBodyError && err.bodyKind === "html")
        ) {
          return this.handle404<T>(path);
        }
        throw err;
      }

      const data = (await response.json()) as T;
      const pagination = this.extractPagination(response.headers);

      return { data, pagination };
    });
  }
```

Gleiches Muster fuer die uebrigen Methoden (Body der Methode in den `run`-Callback, `await this.apiBase()` entfaellt — der Wrapper liefert `base`):

```typescript
  async getRaw(path, params?) {
    return this.withSelfHealing(async (base) => {
      const url = this.buildUrl(base, path, params);
      const response = await this.authenticatedRequest("GET", url);
      const contentType = response.headers.get("content-type") ?? "application/octet-stream";
      const arrayBuf = await response.arrayBuffer();
      return { data: Buffer.from(arrayBuf), contentType };
    });
  }

  async post<T = unknown>(path, body) {
    return this.withSelfHealing(async (base) => {
      const url = this.buildUrl(base, path);
      const response = await this.authenticatedRequest("POST", url, body);
      const data = (await response.json()) as T;
      return { data };
    });
  }

  async postForm<T = unknown>(path, data) {
    return this.withSelfHealing(async (base) => {
      const url = this.buildUrl(base, path);
      const rawBody = new URLSearchParams(data).toString();
      const response = await this.authenticatedRequest("POST", url, undefined, {
        rawBody,
        contentType: "application/x-www-form-urlencoded",
      });
      const responseData = (await response.json()) as T;
      return { data: responseData };
    });
  }

  async put<T = unknown>(path, body) {
    return this.withSelfHealing(async (base) => {
      const url = this.buildUrl(base, path);
      const response = await this.authenticatedRequest("PUT", url, body);
      const data = (await response.json()) as T;
      return { data };
    });
  }

  async delete(path) {
    return this.withSelfHealing(async (base) => {
      const url = this.buildUrl(base, path);
      const response = await this.authenticatedRequest("DELETE", url);
      if (response.status !== 204) {
        await this.handleErrorResponse(response);
      }
    });
  }

  async legacyPost<T = unknown>(action, data) {
    return this.withSelfHealing(async (base) => {
      const url = `${base}/${action}`;
      // ... bestehender legacyPost-Body ab `const response = await this.authenticatedRequest(...)`
    });
  }
```

(Signaturen unveraendert lassen — oben verkuerzt notiert; die TypeScript-Typen aus dem Bestand uebernehmen.)

Hinweis Self-Healing + Writes: Der Retry wiederholt den Original-Request (auch POST). Das ist sicher, weil der 403/404-HTML-Fall bedeutet, dass der erste Versuch OpenXE nie erreicht hat — es kann kein Duplikat entstehen.

- [ ] **Step 4.5: Komplette Suite laufen lassen, Mock-Brueche fixen**

Run: `npx vitest run`

`handleErrorResponse` liest jetzt `response.text()` statt `response.json()`. Alle bestehenden Test-Mocks fuer Error-Responses (>=400), die nur `json` bereitstellen, brechen mit `response.text is not a function`. Suche:

```bash
grep -rn "status: 4" tests/ | grep -v "401"
grep -rn "unparseable" tests/
```

Jedem betroffenen Mock ein passendes `text: async () => JSON.stringify(<bisheriger json-Inhalt>)` ergaenzen (bzw. `text: async () => ""` fuer body-lose Mocks). Message-Assertions auf `"unparseable body"` pruefen: bei HTML-Bodies lautet die Meldung jetzt `"with non-JSON body"` — Assertions entsprechend anpassen.

Expected: PASS, 0 Failures (416 Bestand + ~15 neue, 17 skipped).

- [ ] **Step 4.6: Build + Commit**

```bash
npm run build
git add src/client/openxe-client.ts tests/
git commit -m "feat(client): self-heal blocked API paths, classify non-JSON error bodies"
```

---

### Task 5: Eager-Start in `index.ts`

**Files:**
- Modify: `src/index.ts:136-137`

- [ ] **Step 5.1: Aufruf ergaenzen**

```typescript
async function main() {
  const config = loadConfig();
  const client = new OpenXEClient(config);
  client.startApiPathDetection();
```

(Kein eigener Test — die Methode selbst ist in Task 3 getestet, inkl. "wirft nie".)

- [ ] **Step 5.2: Build + Smoke-Test**

```bash
npm run build
npx vitest run
```

Expected: Build ok, Suite gruen.

Manueller Smoke-Test gegen den echten Server (`.env` zeigt auf `http://10.20.0.40`, **ohne** `OPENXE_API_PATH`):

```bash
node dist/index.js <<'EOF'
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}
EOF
```

Expected auf stderr: `[openxe-mcp] OpenXE API path detected: /www/api/index.php`

- [ ] **Step 5.3: Commit**

```bash
git add src/index.ts
git commit -m "feat: start eager API path detection at server startup"
```

---

### Task 6: Doku — `.env.example` + README

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

- [ ] **Step 6.1: `.env.example`**

`OPENXE_API_PATH`-Eintrag ergaenzen/ersetzen:

```bash
# Optional: expliziter API-Pfad. Wenn NICHT gesetzt, erkennt der Server den
# Pfad automatisch (probiert: /api/index.php, /www/api/index.php, /api).
# Nur setzen, wenn die Installation ein abweichendes Layout hat.
# OPENXE_API_PATH=/api/index.php
```

- [ ] **Step 6.2: README**

Im Konfigurations-Abschnitt des README bei `OPENXE_API_PATH` dokumentieren: optional, Auto-Detection-Verhalten (Kandidatenliste, Erfolgssignal 401-Digest/200-JSON, eager+lazy, Self-Healing bei serverseitigem Pfadwechsel, Override deaktiviert alles).

- [ ] **Step 6.3: Finale Verifikation + Commit**

```bash
npx vitest run && npm run build
git add .env.example README.md
git commit -m "docs: document optional OPENXE_API_PATH and auto-detection"
```

---

## Self-Review (gegen Spec)

- Spec §1 Config → Task 1 ✓
- Spec §2 Detector + Kandidaten + Treffer-Kriterium → Task 2 ✓
- Spec §3 eager/lazy/Concurrency-Guard → Task 3 ✓; Self-Healing inkl. Loop-Schutz, Berechtigungs-403-Ausnahme, "Writes nie als Probe" → Task 4 ✓
- Spec §4 Fehlermeldungen (Detection-Fehlschlag, unreachable, 403 nach Re-Detection) → Task 2 + 4 ✓
- Spec §5 stderr-Logging → Task 3 (detected/startup-failed) + Task 4 (switched) ✓
- Spec §6 Tests → Tasks 1-4 ✓ (Layouts, Digest-Signal, Override ohne Proben, Offline-Start, Healing-Faelle, Parallel-Guard)
- Spec §7 Doku → Task 6 ✓
- Abweichung dokumentiert: Healing nur bei `bodyKind === "html"` (Kopf des Plans)
