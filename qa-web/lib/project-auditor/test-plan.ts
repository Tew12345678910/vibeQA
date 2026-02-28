import {
  browserUseTestPlanSchema,
  type BrowserUseTestPlan,
  type ScorecardCheck,
  type StandardsScorecard,
} from "@/lib/project-auditor/schemas";

type PlanTest = BrowserUseTestPlan["routes"][number]["tests"][number];

type AiPlanImprovement = {
  path: string;
  tests: Array<{
    category: string;
    goal: string;
    steps: string[];
    expected: string;
    severity_if_fail: "P0" | "P1" | "P2";
  }>;
};

function normalizeBaseUrl(baseUrl?: string): string {
  if (!baseUrl) return "";
  try {
    return new URL(baseUrl).toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function standardFromCheck(check: ScorecardCheck): string {
  if (check.standard === "AuthZ") return "Auth";
  return check.standard;
}

function severityFromCheck(check: ScorecardCheck): "P0" | "P1" | "P2" {
  return check.severity;
}

function defaultRouteTests(pathname: string, index: number): PlanTest[] {
  return [
    {
      id: `${pathname}-ux-smoke-${index}`.replace(/[^a-zA-Z0-9-]/g, "-"),
      category: "UX",
      goal: "Page loads, primary action is visible, and no blocking errors appear.",
      steps: [
        `Open ${pathname} in desktop viewport.`,
        "Wait for network idle and check for uncaught errors in the console.",
        "Verify at least one primary CTA or key page control is visible and clickable.",
      ],
      expected: "Route renders successfully with no blocking JS errors and usable primary UI controls.",
      severity_if_fail: "P2" as const,
    },
  ];
}

function testsFromWeakChecks(checks: ScorecardCheck[]): PlanTest[] {
  const weak = checks.filter((check) => check.status === "warn" || check.status === "fail");
  return weak.slice(0, 6).map((check, idx) => ({
    id: `std-${check.standard.toLowerCase()}-${idx + 1}`,
    category: standardFromCheck(check),
    goal: check.message,
    steps: [
      "Navigate to the most relevant route and trigger the corresponding API behavior.",
      `Exercise scenario targeting ${check.standard} compliance.`,
      "Capture observed behavior and network responses for evidence.",
    ],
    expected: check.recommendations[0] ?? "Behavior matches project standards.",
    severity_if_fail: severityFromCheck(check),
  }));
}

export function generateBrowserUseTestPlan(args: {
  scorecard: StandardsScorecard;
  uiRoutes: string[];
  baseUrl?: string;
  notes: string;
  aiImprovements?: AiPlanImprovement[];
}): BrowserUseTestPlan {
  const routeCandidates = args.uiRoutes.length ? args.uiRoutes.slice(0, 8) : ["/"];
  const weakTests = testsFromWeakChecks(args.scorecard.checks);

  const routes = routeCandidates.map((routePath, idx) => {
    const tests = [...defaultRouteTests(routePath, idx)];
    if (idx === 0) {
      tests.push(...weakTests);
    }

    const aiExtra = (args.aiImprovements ?? []).find((item) => item.path === routePath);
    if (aiExtra) {
      for (const [testIndex, test] of aiExtra.tests.entries()) {
        tests.push({
          id: `ai-${routePath}-${testIndex + 1}`.replace(/[^a-zA-Z0-9-]/g, "-"),
          category: test.category,
          goal: test.goal,
          steps: test.steps,
          expected: test.expected,
          severity_if_fail: test.severity_if_fail,
        });
      }
    }

    return {
      path: routePath,
      purpose: routePath === "/" ? "Primary entry route" : `User flow route: ${routePath}`,
      criticality: idx === 0 ? "high" : idx < 3 ? "medium" : "low",
      tests,
    };
  });

  const standards = [
    "Contract",
    "Validation",
    "Auth",
    "RateLimit",
    "Idempotency",
    "Pagination",
    "UX",
  ];

  return browserUseTestPlanSchema.parse({
    project: {
      name: args.scorecard.project.name,
      framework: "nextjs",
      baseUrl: normalizeBaseUrl(args.baseUrl),
      notes: args.notes,
    },
    standards,
    routes,
  });
}

export type { AiPlanImprovement };
