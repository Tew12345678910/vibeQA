import { describe, expect, it } from "vitest";

import { isPrivateOrLocalHostname, normalizeRoutes, validateHostedHttpsUrl } from "./urlSafety";

describe("validateHostedHttpsUrl", () => {
  it("rejects non-https URLs", () => {
    expect(validateHostedHttpsUrl("http://example.com").valid).toBe(false);
  });

  it("rejects private/local hosts", () => {
    expect(validateHostedHttpsUrl("https://localhost:3000").valid).toBe(false);
    expect(validateHostedHttpsUrl("https://127.0.0.1").valid).toBe(false);
    expect(validateHostedHttpsUrl("https://10.0.2.2").valid).toBe(false);
    expect(validateHostedHttpsUrl("https://192.168.1.3").valid).toBe(false);
    expect(validateHostedHttpsUrl("https://172.20.0.2").valid).toBe(false);
  });

  it("accepts hosted https URLs", () => {
    expect(validateHostedHttpsUrl("https://example.com").valid).toBe(true);
  });
});

describe("isPrivateOrLocalHostname", () => {
  it("detects local hostnames", () => {
    expect(isPrivateOrLocalHostname("localhost")).toBe(true);
    expect(isPrivateOrLocalHostname("::1")).toBe(true);
  });
});

describe("normalizeRoutes", () => {
  it("normalizes and deduplicates routes", () => {
    expect(normalizeRoutes(["/", "pricing", "https://example.com/about", "pricing"])).toEqual([
      "/",
      "/pricing",
      "/about",
    ]);
  });
});
