import { z } from "zod";

const EnvSchema = z.object({
  OPENXE_URL: z.string().url("OPENXE_URL must be a valid URL").transform((url) => url.replace(/\/+$/, "")),
  OPENXE_API_PATH: z.string().default("/api/index.php").transform((p) => "/" + p.replace(/^\/+|\/+$/g, "")),
  OPENXE_USERNAME: z.string().min(1, "OPENXE_USERNAME is required"),
  OPENXE_PASSWORD: z.string().min(1, "OPENXE_PASSWORD is required"),
  OPENXE_TIMEOUT: z.coerce.number().positive().default(30000),
});

export interface OpenXEConfig {
  baseUrl: string;
  username: string;
  password: string;
  timeout: number;
}

export function loadConfig(): OpenXEConfig {
  const env = EnvSchema.parse(process.env);
  return {
    baseUrl: `${env.OPENXE_URL}${env.OPENXE_API_PATH}`,
    username: env.OPENXE_USERNAME,
    password: env.OPENXE_PASSWORD,
    timeout: env.OPENXE_TIMEOUT,
  };
}
