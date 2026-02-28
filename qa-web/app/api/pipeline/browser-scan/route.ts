import { NextResponse } from "next/server";

/**
 * Mock browser-use scan endpoint.
 *
 * When the real browser-use API is ready, replace the body of this handler
 * with a call to that service, passing `url`, `projectName`, and `instruction`
 * from the request body.
 *
 * Expected request body:
 *   { url: string; projectName: string; instruction: string }
 *
 * Expected response shape (also used by ProjectDetailClient):
 *   { issues: Array<{ id, title, priority, category, description }> }
 */

type BrowserScanBody = {
  url?: string;
  projectName?: string;
  instruction?: string;
  routes?: string[];
  siteAuthType?: "none" | "credentials" | "social";
  siteUsername?: string;
  sitePassword?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BrowserScanBody;
    const url = body.url?.trim() ?? "";
    const projectName = body.projectName?.trim() ?? "Unknown Project";
    const routes = Array.isArray(body.routes)
      ? body.routes.map((route) => String(route).trim()).filter(Boolean)
      : [];
    const routeSummary = routes.length > 0 ? ` (${routes.join(", ")})` : "";

    if (!url) {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    // ----------------------------------------------------------------
    // TODO: Replace with real browser-use API call, e.g.:
    //
    //   const response = await fetch(process.env.BROWSER_USE_API_URL!, {
    //     method: "POST",
    //     headers: { "content-type": "application/json" },
    //     body: JSON.stringify({ url, instruction: body.instruction }),
    //   });
    //   const data = await response.json();
    //   return NextResponse.json({ issues: data.issues });
    //
    // ----------------------------------------------------------------

    // Mock response — returns plausible-looking QA issues for demo purposes
    const mockIssues = [
      {
        id: `mock-${Date.now()}-1`,
        title: "Missing alt text on hero image",
        priority: "P1" as const,
        category: "accessibility",
        description: `The main banner image on ${url}${routeSummary} has no alt attribute, making it inaccessible to screen readers.`,
      },
      {
        id: `mock-${Date.now()}-2`,
        title: "CTA button contrast ratio below WCAG AA",
        priority: "P1" as const,
        category: "accessibility",
        description: `The primary call-to-action button on ${projectName}${routeSummary} does not meet the 4.5:1 contrast ratio requirement.`,
      },
      {
        id: `mock-${Date.now()}-3`,
        title: "Form missing visible error states",
        priority: "P2" as const,
        category: "usability",
        description: `The contact form on ${projectName}${routeSummary} does not highlight invalid fields with visible error messages when submission fails.`,
      },
      {
        id: `mock-${Date.now()}-4`,
        title: "Navigation links not keyboard-focusable",
        priority: "P0" as const,
        category: "accessibility",
        description: `Keyboard navigation skips the top-level menu items, breaking keyboard-only workflows.`,
      },
    ];

    return NextResponse.json({ issues: mockIssues }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Browser scan failed",
      },
      { status: 500 },
    );
  }
}
