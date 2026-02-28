/**
 * Report Generation Utilities
 * Creates human-language issue reports and exports
 */

import {
  Run,
  Suite,
  TestCase,
  RunCase,
  Issue,
  ReportData,
  ExportedReport,
} from '../types/schema';
import { runStore, testCaseStore, runCaseStore, issueStore, suiteStore } from './store';

// ==================== Report Builder ====================

export const reportBuilder = {
  /**
   * Generate complete report data for a run
   */
  generateReportData: (runId: string): ReportData | null => {
    const run = runStore.getById(runId);
    if (!run) return null;

    const suite = suiteStore.getById(run.suiteId);
    if (!suite) return null;

    const testCases = testCaseStore.getBySuite(suite.id);
    const runCases = runCaseStore.getByRun(runId);
    const issues = issueStore.getByRun(runId);

    // Calculate summary
    let passed = 0;
    let failed = 0;
    let total = runCases.length;

    runCases.forEach(rc => {
      if (rc.status === 'passed') passed++;
      else if (rc.status === 'failed') failed++;
    });

    const startTime = new Date(run.startedAt).getTime();
    const endTime = run.finishedAt ? new Date(run.finishedAt).getTime() : Date.now();
    const duration = Math.round((endTime - startTime) / 1000);

    return {
      run,
      suite,
      testCases,
      runCases,
      issues,
      summary: {
        totalTests: total,
        passed,
        failed,
        passRate: total > 0 ? Math.round((passed / total) * 100) : 0,
        duration,
      },
    };
  },

  /**
   * Generate Markdown report
   */
  generateMarkdown: (reportData: ReportData): string => {
    const { run, suite, runCases, issues, summary } = reportData;

    const formatDate = (date: Date) => {
      return new Date(date).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    };

    const getStatusBadge = (status: string) => {
      switch (status) {
        case 'passed':
          return '✅ PASSED';
        case 'failed':
          return '❌ FAILED';
        case 'running':
          return '🔄 RUNNING';
        case 'pending':
          return '⏳ PENDING';
        case 'canceled':
          return '🚫 CANCELED';
        default:
          return '❓ UNKNOWN';
      }
    };

    let markdown = `# QA Test Report

## Run Summary

- **Suite**: ${suite.name}
- **Run ID**: ${run.id}
- **Status**: ${getStatusBadge(run.status)}
- **Trigger**: ${run.trigger}
- **Started**: ${formatDate(run.startedAt)}
- **Finished**: ${run.finishedAt ? formatDate(run.finishedAt) : 'N/A'}
- **Duration**: ${summary.duration}s

## Test Results

| Metric | Value |
|--------|-------|
| Total Tests | ${summary.totalTests} |
| Passed | ${summary.passed} |
| Failed | ${summary.failed} |
| Pass Rate | ${summary.passRate}% |

## Test Cases

`;

    // Group run cases by test case
    const runCasesByTestCase = new Map<string, RunCase[]>();
    runCases.forEach(rc => {
      const existing = runCasesByTestCase.get(rc.testCaseId) || [];
      existing.push(rc);
      runCasesByTestCase.set(rc.testCaseId, existing);
    });

    runCasesByTestCase.forEach((cases, testCaseId) => {
      const testCase = testCaseStore.getById(testCaseId);
      if (!testCase) return;

      const allPassed = cases.every(c => c.status === 'passed');
      const status = allPassed ? '✅' : '❌';

      markdown += `### ${status} ${testCase.name}

- **Path**: ${testCase.path}
- **Origin**: ${testCase.origin}

#### Results by Viewport

| Viewport | Status | Error |
|----------|--------|-------|
`;

      cases.forEach(rc => {
        const vpStatus = rc.status === 'passed' ? '✅' : '❌';
        const error = rc.error || '-';
        markdown += `| ${rc.viewportKey} | ${vpStatus} ${rc.status} | ${error} |\n`;
      });

      // Add assertion details for failed cases
      const failedCases = cases.filter(c => c.status === 'failed');
      if (failedCases.length > 0) {
        markdown += `\n#### Failed Assertions\n\n`;
        failedCases.forEach(rc => {
          const failedAssertions = rc.assertionResults?.filter(a => !a.passed) || [];
          if (failedAssertions.length > 0) {
            markdown += `**${rc.viewportKey.toUpperCase()} Viewport:**\n`;
            failedAssertions.forEach(a => {
              markdown += `- ${a.assertionKind}: ${a.message}\n`;
            });
            markdown += '\n';
          }
        });
      }
    });

    // Issues section
    if (issues.length > 0) {
      markdown += `## Issues Found

`;
      issues.forEach((issue, index) => {
        const severityEmoji = issue.severity === 'critical' ? '🔴' :
          issue.severity === 'major' ? '🟠' : '🟡';

        markdown += `### ${severityEmoji} ${issue.severity.toUpperCase()}: ${issue.title}

**Symptom:** ${issue.symptom}

**Expected:** ${issue.expected}

**Actual:** ${issue.actual}

**Reproduction Steps:**
`;

        try {
          const reproSteps = JSON.parse(issue.reproStepsJson);
          reproSteps.forEach((step: string, i: number) => {
            markdown += `${i + 1}. ${step}\n`;
          });
        } catch {
          markdown += issue.reproStepsJson + '\n';
        }

        markdown += `\n**Recommended Fix:** ${issue.fixGuidance}\n\n`;

        try {
          const fileHints = JSON.parse(issue.fileHintsJson);
          if (fileHints.length > 0) {
            markdown += `**Likely Source Files:**\n`;
            fileHints.forEach((hint: { file: string; line: number }) => {
              markdown += `- \`${hint.file}:${hint.line}\`\n`;
            });
          }
        } catch {
          // Ignore parse errors
        }

        markdown += '\n---\n\n';
      });
    } else {
      markdown += `## Issues Found

No issues detected. All tests passed! 🎉
`;
    }

    // Footer
    markdown += `
---
*Generated by BrowserQA Studio on ${new Date().toISOString()}*
`;

    return markdown;
  },

  /**
   * Generate JSON export
   */
  generateJSON: (reportData: ReportData): string => {
    return JSON.stringify(reportData, null, 2);
  },

  /**
   * Generate complete export package
   */
  generateExport: (runId: string): ExportedReport | null => {
    const reportData = reportBuilder.generateReportData(runId);
    if (!reportData) return null;

    return {
      markdown: reportBuilder.generateMarkdown(reportData),
      json: reportData,
      issues: reportData.issues,
    };
  },

  /**
   * Download report as file
   */
  downloadReport: (runId: string, format: 'markdown' | 'json'): void => {
    const exportData = reportBuilder.generateExport(runId);
    if (!exportData) return;

    const content = format === 'markdown' ? exportData.markdown : JSON.stringify(exportData.json, null, 2);
    const mimeType = format === 'markdown' ? 'text/markdown' : 'application/json';
    const extension = format === 'markdown' ? 'md' : 'json';

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qa-report-${runId}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};

// ==================== Export ====================

export default {
  reportBuilder,
};
