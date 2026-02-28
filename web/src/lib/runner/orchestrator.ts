import { and, eq, inArray } from "drizzle-orm";

import type { Assertion } from "../contracts";
import { getTask, pollTaskUntilTerminal, runTask, stopTask } from "../browseruse/client";
import { mapBrowserUseLifecycleToRunCaseStatus } from "../browseruse/mapper";
import { getDb } from "../db/client";
import { artifact, issue, run, runCase, suite, suiteViewport, testCase } from "../db/schema";
import { issuesFromAssertionResults } from "../reporting/issues";
import { buildAssertionResults } from "../reporting/parser";
import { writeRunReportFiles } from "../reporting/reportBuilder";
import { DEFAULT_VIEWPORTS, expandRunCaseMatrix } from "./matrix";

function now(): number {
  return Date.now();
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function buildStructuredOutputSchema() {
  return {
    type: "object",
    properties: {
      finalUrl: { type: "string" },
      pageTitle: { type: "string" },
      checks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            kind: { type: "string" },
            expected: { type: "string" },
            actual: { type: "string" },
            passed: { type: "boolean" },
            message: { type: "string" },
          },
          required: ["kind", "expected", "actual", "passed", "message"],
        },
      },
    },
    required: ["checks"],
  };
}

function buildTaskPrompt(baseUrl: string, routePath: string, assertions: Assertion[]): string {
  const target = `${baseUrl}${routePath}`;
  const lines = [
    `Open ${target}.`,
    "Evaluate each assertion in order.",
    "Return structured output with one check item per assertion.",
    "Do not include assertions that were not requested.",
    "Assertions:",
    ...assertions.map((assertion, idx) => `${idx + 1}. ${assertion.kind} :: ${assertion.value}`),
  ];
  return lines.join("\n");
}

function candidateMediaUrls(raw: Record<string, unknown>): string[] {
  const out = new Set<string>();
  const candidates: unknown[] = [
    raw["screenshot_url"],
    raw["screenshotUrl"],
    raw["recording_url"],
    raw["recordingUrl"],
    raw["media_url"],
    raw["mediaUrl"],
  ];

  for (const value of candidates) {
    if (typeof value === "string" && value) {
      out.add(value);
    }
  }

  return [...out];
}

async function upsertRunCases(runId: number): Promise<void> {
  const db = getDb();

  const runRows = db.select().from(run).where(eq(run.id, runId)).all();
  if (!runRows.length) {
    throw new Error(`Run ${runId} not found`);
  }

  const suiteId = runRows[0].suiteId;
  const cases = db.select().from(testCase).where(eq(testCase.suiteId, suiteId)).all();
  const viewportRows = db
    .select()
    .from(suiteViewport)
    .where(eq(suiteViewport.suiteId, suiteId))
    .all();

  const effectiveViewports = viewportRows.length
    ? viewportRows.map((viewport) => ({
        key: viewport.key,
        label: viewport.label,
        width: viewport.width,
        height: viewport.height,
        enabled: viewport.enabled,
      }))
    : DEFAULT_VIEWPORTS;

  const matrix = expandRunCaseMatrix(
    cases.map((item) => item.id),
    effectiveViewports,
  );

  for (const entry of matrix) {
    db.insert(runCase)
      .values({
        runId,
        testCaseId: entry.testCaseId,
        viewportKey: entry.viewportKey,
        status: "pending",
      })
      .onConflictDoNothing()
      .run();
  }
}

function computeRunSummary(runId: number): {
  total: number;
  passed: number;
  failed: number;
  running: number;
  pending: number;
} {
  const db = getDb();
  const rows = db.select({ status: runCase.status }).from(runCase).where(eq(runCase.runId, runId)).all();

  const summary = {
    total: rows.length,
    passed: 0,
    failed: 0,
    running: 0,
    pending: 0,
  };

  for (const row of rows) {
    if (row.status === "passed") {
      summary.passed += 1;
    } else if (row.status === "failed") {
      summary.failed += 1;
    } else if (row.status === "running") {
      summary.running += 1;
    } else {
      summary.pending += 1;
    }
  }

  return summary;
}

function deriveRunStatus(summary: ReturnType<typeof computeRunSummary>): string {
  if (summary.running > 0) {
    return "running";
  }
  if (summary.failed > 0) {
    return "failed";
  }
  if (summary.total > 0 && summary.passed === summary.total) {
    return "passed";
  }
  return "pending";
}

async function processRunCase(runCaseId: number): Promise<void> {
  const db = getDb();

  const rows = db
    .select({
      runCaseId: runCase.id,
      runId: runCase.runId,
      viewportKey: runCase.viewportKey,
      casePath: testCase.path,
      caseName: testCase.name,
      externalCaseId: testCase.externalCaseId,
      assertionsJson: testCase.assertionsJson,
      suiteBaseUrl: suite.baseUrl,
      suiteName: suite.name,
      vpWidth: suiteViewport.width,
      vpHeight: suiteViewport.height,
      vpLabel: suiteViewport.label,
    })
    .from(runCase)
    .innerJoin(testCase, eq(testCase.id, runCase.testCaseId))
    .innerJoin(run, eq(run.id, runCase.runId))
    .innerJoin(suite, eq(suite.id, run.suiteId))
    .leftJoin(
      suiteViewport,
      and(
        eq(suiteViewport.suiteId, suite.id),
        eq(suiteViewport.key, runCase.viewportKey),
      ),
    )
    .where(eq(runCase.id, runCaseId))
    .all();

  if (!rows.length) {
    return;
  }

  const row = rows[0];
  const assertions = parseJson<Assertion[]>(row.assertionsJson, []);
  const width = row.vpWidth ?? DEFAULT_VIEWPORTS.find((vp) => vp.key === row.viewportKey)?.width ?? 1440;
  const height = row.vpHeight ?? DEFAULT_VIEWPORTS.find((vp) => vp.key === row.viewportKey)?.height ?? 900;

  db.update(runCase)
    .set({
      status: "running",
      startedAt: now(),
      error: null,
    })
    .where(eq(runCase.id, runCaseId))
    .run();

  let taskId: string | null = null;

  try {
    const created = await runTask({
      task: buildTaskPrompt(row.suiteBaseUrl, row.casePath, assertions),
      browser_viewport_width: width,
      browser_viewport_height: height,
      structured_output_json: buildStructuredOutputSchema(),
      allowed_domains: [new URL(row.suiteBaseUrl).hostname],
      enable_public_share: true,
    });

    taskId = created.id;

    db.update(runCase)
      .set({
        browserUseTaskId: created.id,
        liveUrl: created.liveUrl || null,
        publicShareUrl: created.publicShareUrl || null,
      })
      .where(eq(runCase.id, runCaseId))
      .run();

    const terminal = await pollTaskUntilTerminal(created.id);
    const mappedStatus = mapBrowserUseLifecycleToRunCaseStatus(terminal.status);
    const assertionResults = buildAssertionResults(assertions, terminal.output, terminal.error);
    const passedAssertions = assertionResults.every((item) => item.passed);
    const finalStatus = mappedStatus === "passed" && passedAssertions ? "passed" : "failed";

    db.update(runCase)
      .set({
        status: finalStatus,
        finishedAt: now(),
        error: finalStatus === "failed" ? terminal.error || null : null,
        outputJson: JSON.stringify({
          raw: terminal.raw,
          output: terminal.output,
          assertionResults,
        }),
        liveUrl: terminal.liveUrl || created.liveUrl || null,
        publicShareUrl: terminal.publicShareUrl || created.publicShareUrl || null,
      })
      .where(eq(runCase.id, runCaseId))
      .run();

    db.delete(issue).where(eq(issue.runCaseId, runCaseId)).run();
    const normalizedIssues = issuesFromAssertionResults(
      row.externalCaseId,
      row.caseName,
      row.casePath,
      assertionResults,
    );

    if (normalizedIssues.length) {
      db.insert(issue)
        .values(
          normalizedIssues.map((entry) => ({
            runId: row.runId,
            runCaseId,
            severity: entry.severity,
            title: entry.title,
            symptom: entry.symptom,
            expected: entry.expected,
            actual: entry.actual,
            reproStepsJson: JSON.stringify(entry.reproSteps),
            fileHintsJson: JSON.stringify(entry.fileHints),
            fixGuidance: entry.fixGuidance,
          })),
        )
        .run();
    }

    const mediaUrls = candidateMediaUrls(terminal.raw);
    const artifactsToInsert: Array<{ kind: string; urlOrPath: string; metadataJson: string }> = [];

    if (terminal.liveUrl) {
      artifactsToInsert.push({
        kind: "live_url",
        urlOrPath: terminal.liveUrl,
        metadataJson: JSON.stringify({ source: "browseruse" }),
      });
    }
    if (terminal.publicShareUrl) {
      artifactsToInsert.push({
        kind: "public_share",
        urlOrPath: terminal.publicShareUrl,
        metadataJson: JSON.stringify({ source: "browseruse" }),
      });
    }

    for (const mediaUrl of mediaUrls) {
      artifactsToInsert.push({
        kind: "media",
        urlOrPath: mediaUrl,
        metadataJson: JSON.stringify({ source: "browseruse" }),
      });
    }

    if (artifactsToInsert.length) {
      db.insert(artifact)
        .values(
          artifactsToInsert.map((entry) => ({
            runCaseId,
            kind: entry.kind,
            urlOrPath: entry.urlOrPath,
            metadataJson: entry.metadataJson,
          })),
        )
        .run();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown run-case error";

    if (taskId) {
      try {
        const task = await getTask(taskId);
        if (["created", "running"].includes(task.status)) {
          await stopTask(taskId);
        }
      } catch {
        // Best effort cleanup.
      }
    }

    db.update(runCase)
      .set({
        status: "failed",
        error: message,
        finishedAt: now(),
      })
      .where(eq(runCase.id, runCaseId))
      .run();

    db.insert(issue)
      .values({
        runId: row.runId,
        runCaseId,
        severity: "high",
        title: `${row.externalCaseId}: run-case execution failed`,
        symptom: message,
        expected: "Task should complete and return assertion-level output",
        actual: "Task failed before structured assertion output was available",
        reproStepsJson: JSON.stringify([
          `Open ${row.casePath}`,
          `Run test case '${row.caseName}' on viewport '${row.viewportKey}'`,
          "Observe task failure before assertion checks complete",
        ]),
        fileHintsJson: JSON.stringify([]),
        fixGuidance:
          "Check Browser-Use connectivity, target reachability, and task prompt constraints, then rerun.",
      })
      .run();
  }
}

function writeRunExports(runId: number): void {
  const db = getDb();

  const runRows = db
    .select({
      runId: run.id,
      status: run.status,
      summaryJson: run.summaryJson,
      suiteName: suite.name,
      suiteBaseUrl: suite.baseUrl,
    })
    .from(run)
    .innerJoin(suite, eq(suite.id, run.suiteId))
    .where(eq(run.id, runId))
    .all();

  if (!runRows.length) {
    return;
  }

  const runRow = runRows[0];
  const summary = parseJson<{ total?: number; passed?: number; failed?: number }>(runRow.summaryJson, {});

  const runCaseRows = db
    .select({
      id: runCase.id,
      viewportKey: runCase.viewportKey,
      status: runCase.status,
      error: runCase.error,
      outputJson: runCase.outputJson,
      browserUseTaskId: runCase.browserUseTaskId,
      liveUrl: runCase.liveUrl,
      publicShareUrl: runCase.publicShareUrl,
      externalCaseId: testCase.externalCaseId,
      caseName: testCase.name,
      path: testCase.path,
    })
    .from(runCase)
    .innerJoin(testCase, eq(testCase.id, runCase.testCaseId))
    .where(eq(runCase.runId, runId))
    .all();

  const issueRows = db.select().from(issue).where(eq(issue.runId, runId)).all();

  const files = writeRunReportFiles({
    runId,
    suite: { name: runRow.suiteName, baseUrl: runRow.suiteBaseUrl },
    runSummary: {
      totalCases: summary.total ?? runCaseRows.length,
      passedCases: summary.passed ?? 0,
      failedCases: summary.failed ?? 0,
      status: runRow.status,
    },
    runCaseRows,
    issues: issueRows,
  });

  if (runCaseRows.length) {
    db.insert(artifact)
      .values([
        {
          runCaseId: runCaseRows[0].id,
          kind: "report_json",
          urlOrPath: files.reportJsonPath,
          metadataJson: JSON.stringify({ runScoped: true }),
        },
        {
          runCaseId: runCaseRows[0].id,
          kind: "report_md",
          urlOrPath: files.reportMdPath,
          metadataJson: JSON.stringify({ runScoped: true }),
        },
        {
          runCaseId: runCaseRows[0].id,
          kind: "issues_json",
          urlOrPath: files.issuesJsonPath,
          metadataJson: JSON.stringify({ runScoped: true }),
        },
      ])
      .onConflictDoNothing()
      .run();
  }
}

export async function executeRun(runId: number): Promise<void> {
  const db = getDb();

  db.update(run)
    .set({
      status: "running",
      startedAt: now(),
      finishedAt: null,
    })
    .where(eq(run.id, runId))
    .run();

  try {
    await upsertRunCases(runId);

    const caseRows = db
      .select({ id: runCase.id, status: runCase.status })
      .from(runCase)
      .where(eq(runCase.runId, runId))
      .all();

    for (const row of caseRows) {
      if (["passed", "failed"].includes(row.status)) {
        continue;
      }
      await processRunCase(row.id);

      const summaryAfterCase = computeRunSummary(runId);
      db.update(run)
        .set({
          summaryJson: JSON.stringify(summaryAfterCase),
          status: deriveRunStatus(summaryAfterCase),
        })
        .where(eq(run.id, runId))
        .run();
    }

    const finalSummary = computeRunSummary(runId);
    const finalStatus = finalSummary.failed > 0 ? "failed" : "passed";

    db.update(run)
      .set({
        status: finalStatus,
        summaryJson: JSON.stringify(finalSummary),
        finishedAt: now(),
      })
      .where(eq(run.id, runId))
      .run();

    writeRunExports(runId);
  } catch (error) {
    db.update(run)
      .set({
        status: "failed",
        finishedAt: now(),
        summaryJson: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      })
      .where(eq(run.id, runId))
      .run();
  }
}

export async function cancelRun(runId: number): Promise<void> {
  const db = getDb();
  const activeRunCases = db
    .select({ id: runCase.id, taskId: runCase.browserUseTaskId })
    .from(runCase)
    .where(and(eq(runCase.runId, runId), inArray(runCase.status, ["pending", "running"])))
    .all();

  for (const row of activeRunCases) {
    if (row.taskId) {
      try {
        await stopTask(row.taskId);
      } catch {
        // Keep cancel operation best-effort.
      }
    }

    db.update(runCase)
      .set({
        status: "failed",
        error: "Canceled by user",
        finishedAt: now(),
      })
      .where(eq(runCase.id, row.id))
      .run();
  }

  const summary = computeRunSummary(runId);

  db.update(run)
    .set({
      status: "canceled",
      finishedAt: now(),
      summaryJson: JSON.stringify(summary),
    })
    .where(eq(run.id, runId))
    .run();

  writeRunExports(runId);
}
