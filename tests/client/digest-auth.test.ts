import { describe, it, expect } from "vitest";
import { DigestAuth } from "../../src/client/digest-auth.js";

describe("DigestAuth", () => {
  const auth = new DigestAuth("apiuser", "secret123");

  it("parses WWW-Authenticate challenge", () => {
    const challenge = 'Digest realm="Xentral-API",qop="auth",nonce="abc123",opaque="xyz789"';
    const parsed = auth.parseChallenge(challenge);
    expect(parsed.realm).toBe("Xentral-API");
    expect(parsed.qop).toBe("auth");
    expect(parsed.nonce).toBe("abc123");
    expect(parsed.opaque).toBe("xyz789");
  });

  it("generates valid Authorization header", () => {
    const challenge = 'Digest realm="Xentral-API",qop="auth",nonce="abc123",opaque="xyz789"';
    auth.parseChallenge(challenge);
    const header = auth.generateHeader("GET", "/api/v1/adressen");
    expect(header).toMatch(/^Digest /);
    expect(header).toContain('username="apiuser"');
    expect(header).toContain('realm="Xentral-API"');
    expect(header).toContain('nonce="abc123"');
    expect(header).toContain('qop=auth');
    expect(header).toContain("nc=00000001");
    expect(header).toContain("response=");
    expect(header).toContain('opaque="xyz789"');
  });

  it("increments nonce count", () => {
    const challenge = 'Digest realm="Xentral-API",qop="auth",nonce="nc-test",opaque="op"';
    auth.parseChallenge(challenge);
    const h1 = auth.generateHeader("GET", "/test1");
    const h2 = auth.generateHeader("GET", "/test2");
    expect(h1).toContain("nc=00000001");
    expect(h2).toContain("nc=00000002");
  });

  it("computes correct MD5 response hash", () => {
    const challenge = 'Digest realm="Xentral-API",qop="auth",nonce="testnonce",opaque="testopaque"';
    auth.parseChallenge(challenge);
    const header = auth.generateHeader("GET", "/api/v1/adressen");
    expect(header).toMatch(/response="[a-f0-9]{32}"/);
  });

  it("resets nonce count on new challenge", () => {
    auth.parseChallenge('Digest realm="Xentral-API",qop="auth",nonce="nonce1",opaque="op1"');
    auth.generateHeader("GET", "/test");
    auth.generateHeader("GET", "/test");
    auth.parseChallenge('Digest realm="Xentral-API",qop="auth",nonce="nonce2",opaque="op2"');
    const header = auth.generateHeader("GET", "/test");
    expect(header).toContain("nc=00000001");
    expect(header).toContain('nonce="nonce2"');
  });

  it("hasChallenge returns false initially", () => {
    const fresh = new DigestAuth("user", "pass");
    expect(fresh.hasChallenge()).toBe(false);
  });

  it("hasChallenge returns true after parsing", () => {
    auth.parseChallenge('Digest realm="Xentral-API",qop="auth",nonce="n",opaque="o"');
    expect(auth.hasChallenge()).toBe(true);
  });
});
