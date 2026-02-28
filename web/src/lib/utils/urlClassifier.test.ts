import { describe, expect, it } from "vitest";

import {
  isLikelyCloudBrowserUseEndpoint,
  isPrivateOrLocalUrl,
  validateSuiteBaseUrl,
} from "./urlClassifier";

describe("isPrivateOrLocalUrl", () => {
  it("detects localhost and private ipv4 ranges", () => {
    expect(isPrivateOrLocalUrl("http://localhost:3000")).toBe(true);
    expect(isPrivateOrLocalUrl("http://127.0.0.1:8080")).toBe(true);
    expect(isPrivateOrLocalUrl("http://192.168.1.5")).toBe(true);
    expect(isPrivateOrLocalUrl("http://10.4.2.1")).toBe(true);
    expect(isPrivateOrLocalUrl("http://172.20.10.3")).toBe(true);
  });

  it("treats hosted urls as non-private", () => {
    expect(isPrivateOrLocalUrl("https://example.com")).toBe(false);
    expect(isPrivateOrLocalUrl("https://www.openai.com")).toBe(false);
  });
});

describe("isLikelyCloudBrowserUseEndpoint", () => {
  it("detects cloud hostnames", () => {
    expect(isLikelyCloudBrowserUseEndpoint(undefined)).toBe(true);
    expect(isLikelyCloudBrowserUseEndpoint("https://api.browser-use.com")).toBe(true);
    expect(isLikelyCloudBrowserUseEndpoint("https://browseruse.com")).toBe(true);
    expect(isLikelyCloudBrowserUseEndpoint("http://localhost:8081")).toBe(false);
  });
});

describe("validateSuiteBaseUrl", () => {
  it("validates protocol and format", () => {
    expect(validateSuiteBaseUrl("https://example.com").valid).toBe(true);
    expect(validateSuiteBaseUrl("ftp://example.com").valid).toBe(false);
    expect(validateSuiteBaseUrl("not-a-url").valid).toBe(false);
  });
});
