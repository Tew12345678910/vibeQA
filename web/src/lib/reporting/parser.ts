import { URL } from "node:url";

import type { Assertion } from "../contracts";

export type AssertionEvaluation = {
  assertionKind: string;
  expected: string;
  actual: string;
  passed: boolean;
  message: string;
  source?: { file: string; line: number };
};

type StructuredOutput = {
  finalUrl?: string;
  pageTitle?: string;
  checks?: Array<{
    kind?: string;
    expected?: string;
    actual?: string;
    passed?: boolean;
    message?: string;
    source?: { file?: string; line?: number };
  }>;
};

function normalizeOutput(raw: unknown): StructuredOutput {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  return raw as StructuredOutput;
}

function fallbackActual(assertion: Assertion, output: StructuredOutput): string {
  if (assertion.kind === "url_path_equals" && output.finalUrl) {
    try {
      return new URL(output.finalUrl).pathname;
    } catch {
      return output.finalUrl;
    }
  }

  if (assertion.kind === "title_contains") {
    return output.pageTitle || "";
  }

  return "not provided";
}

export function buildAssertionResults(
  assertions: Assertion[],
  outputRaw: unknown,
  runtimeError?: string,
): AssertionEvaluation[] {
  const output = normalizeOutput(outputRaw);
  const checks = output.checks || [];

  return assertions.map((assertion) => {
    const check = checks.find(
      (item) => item.kind === assertion.kind && item.expected === assertion.value,
    );

    if (check) {
      return {
        assertionKind: assertion.kind,
        expected: assertion.value,
        actual: String(check.actual ?? ""),
        passed: Boolean(check.passed),
        message: check.message || `${assertion.kind} assertion evaluated`,
        source: assertion.source,
      };
    }

    const runtimeDrivenFailure = runtimeError
      ? `Run failed before assertion execution: ${runtimeError}`
      : "Structured output missing assertion result";

    return {
      assertionKind: assertion.kind,
      expected: assertion.value,
      actual: fallbackActual(assertion, output),
      passed: false,
      message: runtimeDrivenFailure,
      source: assertion.source,
    };
  });
}
