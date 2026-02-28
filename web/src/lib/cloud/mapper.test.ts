import { describe, expect, it } from "vitest";

import { emptyAuditSummary, mapCloudAuditPayload } from "./mapper";

describe("emptyAuditSummary", () => {
  it("creates predictable zero summary", () => {
    const summary = emptyAuditSummary("https://example.com");
    expect(summary.baseUrl).toBe("https://example.com");
    expect(summary.pagesAudited).toBe(0);
  });
});

describe("mapCloudAuditPayload", () => {
  it("maps cloud payload fields into normalized response", () => {
    const mapped = mapCloudAuditPayload({
      baseUrl: "https://example.com",
      raw: {
        status: "completed",
        pageResults: [
          {
            route: "/",
            viewportKey: "desktop",
            fullUrl: "https://example.com/",
            finalUrl: "https://example.com/",
            title: "Home",
            status: "ok",
            signals: { ctaAboveFold: true, navWorks: true, mobileHorizontalScroll: false, formLabelingOk: true },
            evidence: {
              screenshots: [{ label: "aboveFold", url: "https://cdn.example.com/home.png" }],
              notes: ["sample"],
            },
          },
        ],
        issues: [
          {
            severity: "high",
            category: "security",
            title: "Mixed content",
            symptom: "HTTP script loaded",
            reproSteps: ["Open /"],
            expected: "Only HTTPS resources",
            actual: "HTTP resource observed",
            impact: "Content tampering risk",
            recommendedFixApproach: "Serve resource over HTTPS",
            verificationSteps: ["Reload and inspect network"],
            evidenceLinks: ["https://cdn.example.com/evidence.png"],
          },
        ],
      },
    });

    expect(mapped.status).toBe("completed");
    expect(mapped.pageResults).toHaveLength(1);
    expect(mapped.issues).toHaveLength(1);
    expect(mapped.artifacts.length).toBeGreaterThan(0);
  });
});
