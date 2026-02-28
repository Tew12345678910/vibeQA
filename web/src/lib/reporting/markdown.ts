import type { AuditStatusResponse } from "../contracts";

export function buildAuditMarkdown(report: AuditStatusResponse): string {
  const lines: string[] = [];

  lines.push(`# Audit Report ${report.auditId}`);
  lines.push("");
  lines.push(`- Base URL: ${report.summary.baseUrl}`);
  lines.push(`- Status: ${report.status}`);
  lines.push(`- Pages audited: ${report.summary.pagesAudited}`);
  lines.push(`- Pass count: ${report.summary.passCount}`);
  lines.push(`- Fail count: ${report.summary.failCount}`);
  lines.push(`- High risk count: ${report.summary.highRiskCount}`);
  lines.push("");

  lines.push("## Key Findings");
  if (!report.summary.keyFindings.length) {
    lines.push("No key findings.");
  } else {
    for (const finding of report.summary.keyFindings) {
      lines.push(`- ${finding}`);
    }
  }

  lines.push("");
  lines.push("## Issues");

  if (!report.issues.length) {
    lines.push("No issues found.");
  } else {
    for (const issue of report.issues) {
      lines.push("");
      lines.push(`### ${issue.title}`);
      lines.push(`- Severity: ${issue.severity}`);
      lines.push(`- Category: ${issue.category}`);
      lines.push(`- Symptom: ${issue.symptom}`);
      lines.push(`- Expected: ${issue.expected}`);
      lines.push(`- Actual: ${issue.actual}`);
      lines.push(`- Impact: ${issue.impact}`);
      lines.push(`- Recommended Fix Approach: ${issue.recommendedFixApproach}`);
      lines.push("- Repro Steps:");
      for (const step of issue.reproSteps) {
        lines.push(`  - ${step}`);
      }
      lines.push("- Verification Steps:");
      for (const step of issue.verificationSteps) {
        lines.push(`  - ${step}`);
      }
      if (issue.evidenceLinks.length) {
        lines.push("- Evidence Links:");
        for (const link of issue.evidenceLinks) {
          lines.push(`  - ${link}`);
        }
      }
    }
  }

  return lines.join("\n");
}
