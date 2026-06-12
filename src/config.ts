import { z } from "zod";

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

export type OpenXEMode = "router" | "full" | "readonly";

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

export function loadConfig(): OpenXEConfig {
  const env = EnvSchema.parse(process.env);

  // Warn when OPENXE_URL uses plain HTTP with a non-localhost host
  if (!process.env.OPENXE_ALLOW_HTTP) {
    const parsed = new URL(env.OPENXE_URL);
    if (
      parsed.protocol === "http:" &&
      !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)
    ) {
      console.error(
        "[WARN] OPENXE_URL uses HTTP — credentials and ERP data are transmitted unencrypted. " +
          "Use HTTPS for production or set OPENXE_ALLOW_HTTP=1 to suppress this warning."
      );
    }
  }

  return {
    baseUrl: env.OPENXE_URL,
    apiPath: env.OPENXE_API_PATH ?? null,
    username: env.OPENXE_USERNAME,
    password: env.OPENXE_PASSWORD,
    timeout: env.OPENXE_TIMEOUT,
    mode: env.OPENXE_MODE,
  };
}
