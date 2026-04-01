import { describe, it, expect, afterEach } from "vitest";
import { loadConfig } from "../../src/config.js";

describe("loadConfig", () => {
  const origEnv = { ...process.env };
  afterEach(() => { process.env = { ...origEnv }; });

  it("loads valid config from environment", () => {
    process.env.OPENXE_URL = "https://erp.example.com";
    process.env.OPENXE_USERNAME = "apiuser";
    process.env.OPENXE_PASSWORD = "secret123";
    const config = loadConfig();
    expect(config.baseUrl).toBe("https://erp.example.com/api/index.php");
    expect(config.username).toBe("apiuser");
    expect(config.password).toBe("secret123");
    expect(config.timeout).toBe(30000);
  });

  it("strips trailing slash from OPENXE_URL", () => {
    process.env.OPENXE_URL = "https://erp.example.com/";
    process.env.OPENXE_USERNAME = "apiuser";
    process.env.OPENXE_PASSWORD = "secret123";
    const config = loadConfig();
    expect(config.baseUrl).toBe("https://erp.example.com/api/index.php");
  });

  it("allows overriding API path via OPENXE_API_PATH", () => {
    process.env.OPENXE_URL = "https://erp.example.com";
    process.env.OPENXE_USERNAME = "apiuser";
    process.env.OPENXE_PASSWORD = "secret123";
    process.env.OPENXE_API_PATH = "/api";
    const config = loadConfig();
    expect(config.baseUrl).toBe("https://erp.example.com/api");
  });

  it("throws on missing OPENXE_URL", () => {
    delete process.env.OPENXE_URL;
    process.env.OPENXE_USERNAME = "apiuser";
    process.env.OPENXE_PASSWORD = "secret123";
    expect(() => loadConfig()).toThrow();
  });

  it("throws on missing OPENXE_USERNAME", () => {
    process.env.OPENXE_URL = "https://erp.example.com";
    delete process.env.OPENXE_USERNAME;
    process.env.OPENXE_PASSWORD = "secret123";
    expect(() => loadConfig()).toThrow();
  });

  it("throws on missing OPENXE_PASSWORD", () => {
    process.env.OPENXE_URL = "https://erp.example.com";
    process.env.OPENXE_USERNAME = "apiuser";
    delete process.env.OPENXE_PASSWORD;
    expect(() => loadConfig()).toThrow();
  });

  it("accepts custom timeout", () => {
    process.env.OPENXE_URL = "https://erp.example.com";
    process.env.OPENXE_USERNAME = "apiuser";
    process.env.OPENXE_PASSWORD = "secret123";
    process.env.OPENXE_TIMEOUT = "60000";
    const config = loadConfig();
    expect(config.timeout).toBe(60000);
  });
});
