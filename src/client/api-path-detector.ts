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
