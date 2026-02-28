import fs from "node:fs";
import path from "node:path";

type RunReportArgs = {
  runId: number;
  suite: {
    name: string;
    baseUrl: string;
  };
  runSummary: {
    totalCases: number;
    passedCases: number;
    failedCases: number;
    status: string;
  };
  runCaseRows: Array<{
    id: number;
    viewportKey: string;
    status: string;
    error: string | null;
    outputJson: string | null;
    browserUseTaskId: string | null;
    liveUrl: string | null;
    publicShareUrl: string | null;
    externalCaseId: string;
    caseName: string;
    path: string;
  }>;
  issues: Array<{
    severity: string;
    title: string;
    symptom: string;
    expected: string;
    actual: string;
    reproStepsJson: string;
    fileHintsJson: string;
    fixGuidance: string;
  }>;
};

function outputFolderForRun(runId: number): string {
  return path.resolve(process.cwd(), "../output/runs", String(runId));
}

function issueMarkdown(issues: RunReportArgs["issues"]): string {
  if (!issues.length) {
    return "No issues detected.\n";
  }

  return issues
    .map((issue, idx) => {
      const reproSteps = JSON.parse(issue.reproStepsJson) as string[];
      const fileHints = JSON.parse(issue.fileHintsJson) as Array<{ file: string; line: number }>;

      return [
        `## ${idx + 1}. ${issue.title}`,
        `- Severity: ${issue.severity}`,
        `- Symptom: ${issue.symptom}`,
        "- Reproduction:",
        ...reproSteps.map((step) => `  - ${step}`),
        `- Expected: ${issue.expected}`,
        `- Actual: ${issue.actual}`,
        `- Likely Source Files: ${
          fileHints.length
            ? fileHints.map((hint) => `${hint.file}:${hint.line}`).join(", ")
            : "(none)"
        }`,
        `- Recommended Fix Approach: ${issue.fixGuidance}`,
        "- Verification Steps: rerun this suite and confirm the assertion turns green.",
      ].join("\n");
    })
    .join("\n\n");
}

export function writeRunReportFiles(args: RunReportArgs): {
  folder: string;
  reportJsonPath: string;
  reportMdPath: string;
  issuesJsonPath: string;
} {
  const folder = outputFolderForRun(args.runId);
  fs.mkdirSync(folder, { recursive: true });

  const report = {
    runId: args.runId,
    suite: args.suite,
    summary: args.runSummary,
    runCases: args.runCaseRows,
    issues: args.issues,
  };

  const reportJsonPath = path.join(folder, "report.json");
  const reportMdPath = path.join(folder, "report.md");
  const issuesJsonPath = path.join(folder, "issues.json");

  fs.writeFileSync(reportJsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(issuesJsonPath, JSON.stringify(args.issues, null, 2));

  const markdown = [
    `# Run Report ${args.runId}`,
    "",
    `- Suite: ${args.suite.name}`,
    `- Base URL: ${args.suite.baseUrl}`,
    `- Status: ${args.runSummary.status}`,
    `- Total run cases: ${args.runSummary.totalCases}`,
    `- Passed: ${args.runSummary.passedCases}`,
    `- Failed: ${args.runSummary.failedCases}`,
    "",
    "# Issues",
    "",
    issueMarkdown(args.issues),
  ].join("\n");

  fs.writeFileSync(reportMdPath, markdown);

  return {
    folder,
    reportJsonPath,
    reportMdPath,
    issuesJsonPath,
  };
}
