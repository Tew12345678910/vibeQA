import type { Assertion } from "../contracts";

import type { AssertionEvaluation } from "./parser";

type IssueSeverity = "high" | "medium" | "low";

export type NormalizedIssue = {
  severity: IssueSeverity;
  title: string;
  symptom: string;
  expected: string;
  actual: string;
  reproSteps: string[];
  fileHints: Array<{ file: string; line: number }>;
  fixGuidance: string;
};

function severityFromAssertion(kind: Assertion["kind"]): IssueSeverity {
  if (kind === "url_path_equals") {
    return "high";
  }
  if (kind === "title_contains") {
    return "low";
  }
  return "medium";
}

function fixGuidanceForKind(kind: Assertion["kind"], expected: string): string {
  if (kind === "text_present") {
    return `Render the expected text '${expected}' or update the requirement if the copy changed intentionally.`;
  }
  if (kind === "text_absent") {
    return `Remove text '${expected}' from the route or gate it behind the correct condition.`;
  }
  if (kind === "url_path_equals") {
    return "Align route registration and navigation logic so the browser lands on the expected path.";
  }
  return `Set the page title to include '${expected}' or revise the assertion if policy changed.`;
}

export function issuesFromAssertionResults(
  caseId: string,
  caseName: string,
  path: string,
  assertionResults: AssertionEvaluation[],
): NormalizedIssue[] {
  const issues: NormalizedIssue[] = [];

  for (const result of assertionResults) {
    if (result.passed) {
      continue;
    }

    const kind = result.assertionKind as Assertion["kind"];
    issues.push({
      severity: severityFromAssertion(kind),
      title: `${caseId}: ${result.assertionKind} failed`,
      symptom: result.message,
      expected: result.expected,
      actual: result.actual,
      reproSteps: [
        `Open ${path}`,
        `Run test case '${caseName}'`,
        `Observe assertion '${result.assertionKind}'`,
      ],
      fileHints: result.source ? [result.source] : [],
      fixGuidance: fixGuidanceForKind(kind, result.expected),
    });
  }

  return issues;
}
