import fs from "node:fs";
import path from "node:path";

import { and, desc, eq, sql } from "drizzle-orm";

import { getDb } from "./client";
import { issue, run, runCase, suite, suiteViewport, testCase } from "./schema";

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

export function getDashboardStats() {
  const db = getDb();

  const suites = db.select({ count: sql<number>`count(*)` }).from(suite).all()[0]?.count ?? 0;
  const runs = db.select({ count: sql<number>`count(*)` }).from(run).all()[0]?.count ?? 0;
  const recentRuns = db
    .select({ id: run.id, status: run.status, startedAt: run.startedAt, summaryJson: run.summaryJson, suiteId: run.suiteId })
    .from(run)
    .orderBy(desc(run.id))
    .limit(8)
    .all();

  const failedRuns = recentRuns.filter((row) => row.status === "failed").length;
  return {
    suites,
    runs,
    failedRuns,
    recentRuns,
  };
}

export function listSuitesWithLatestRun() {
  const db = getDb();
  const suites = db.select().from(suite).orderBy(desc(suite.updatedAt)).all();

  return suites.map((entry) => {
    const latestRun = db
      .select({
        id: run.id,
        status: run.status,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        summaryJson: run.summaryJson,
      })
      .from(run)
      .where(eq(run.suiteId, entry.id))
      .orderBy(desc(run.id))
      .limit(1)
      .all()[0];

    return {
      ...entry,
      latestRun: latestRun
        ? {
            ...latestRun,
            summary: parseJson<Record<string, unknown>>(latestRun.summaryJson, {}),
          }
        : null,
    };
  });
}

export function getSuiteDetails(suiteId: number) {
  const db = getDb();
  const suiteRow = db.select().from(suite).where(eq(suite.id, suiteId)).all()[0] || null;
  if (!suiteRow) {
    return null;
  }

  const viewports = db
    .select()
    .from(suiteViewport)
    .where(eq(suiteViewport.suiteId, suiteId))
    .orderBy(suiteViewport.id)
    .all();

  const tests = db
    .select({
      id: testCase.id,
      externalCaseId: testCase.externalCaseId,
      name: testCase.name,
      path: testCase.path,
      origin: testCase.origin,
      assertionsJson: testCase.assertionsJson,
      sourceRefsJson: testCase.sourceRefsJson,
      createdAt: testCase.createdAt,
    })
    .from(testCase)
    .where(eq(testCase.suiteId, suiteId))
    .orderBy(testCase.id)
    .all();

  const runs = db
    .select({
      id: run.id,
      status: run.status,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      summaryJson: run.summaryJson,
      trigger: run.trigger,
    })
    .from(run)
    .where(eq(run.suiteId, suiteId))
    .orderBy(desc(run.id))
    .all();

  return {
    suite: suiteRow,
    viewports,
    tests: tests.map((row) => ({
      ...row,
      assertions: parseJson<unknown[]>(row.assertionsJson, []),
      sourceRefs: parseJson<unknown[]>(row.sourceRefsJson, []),
    })),
    runs: runs.map((row) => ({
      ...row,
      summary: parseJson<Record<string, unknown>>(row.summaryJson, {}),
    })),
  };
}

export function getRunDetails(runId: number) {
  const db = getDb();

  const runRow = db
    .select({
      id: run.id,
      suiteId: run.suiteId,
      status: run.status,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      summaryJson: run.summaryJson,
      trigger: run.trigger,
      suiteName: suite.name,
      suiteBaseUrl: suite.baseUrl,
    })
    .from(run)
    .innerJoin(suite, eq(suite.id, run.suiteId))
    .where(eq(run.id, runId))
    .all()[0];

  if (!runRow) {
    return null;
  }

  const matrix = db
    .select({
      id: runCase.id,
      status: runCase.status,
      viewportKey: runCase.viewportKey,
      browserUseTaskId: runCase.browserUseTaskId,
      error: runCase.error,
      liveUrl: runCase.liveUrl,
      publicShareUrl: runCase.publicShareUrl,
      outputJson: runCase.outputJson,
      startedAt: runCase.startedAt,
      finishedAt: runCase.finishedAt,
      testCaseId: testCase.id,
      externalCaseId: testCase.externalCaseId,
      testCaseName: testCase.name,
      testCasePath: testCase.path,
    })
    .from(runCase)
    .innerJoin(testCase, eq(testCase.id, runCase.testCaseId))
    .where(eq(runCase.runId, runId))
    .orderBy(runCase.id)
    .all();

  const issues = db
    .select()
    .from(issue)
    .where(eq(issue.runId, runId))
    .orderBy(issue.id)
    .all();

  return {
    run: {
      ...runRow,
      summary: parseJson<Record<string, unknown>>(runRow.summaryJson, {}),
    },
    matrix: matrix.map((row) => ({
      ...row,
      output: parseJson<Record<string, unknown>>(row.outputJson, {}),
    })),
    issues: issues.map((row) => ({
      ...row,
      reproSteps: parseJson<string[]>(row.reproStepsJson, []),
      fileHints: parseJson<Array<{ file: string; line: number }>>(row.fileHintsJson, []),
    })),
  };
}

export function getRunIssues(runId: number) {
  const db = getDb();
  return db
    .select()
    .from(issue)
    .where(eq(issue.runId, runId))
    .orderBy(issue.id)
    .all()
    .map((row) => ({
      ...row,
      reproSteps: parseJson<string[]>(row.reproStepsJson, []),
      fileHints: parseJson<Array<{ file: string; line: number }>>(row.fileHintsJson, []),
    }));
}

export function getRunReportBundle(runId: number) {
  const outputDir = path.resolve(process.cwd(), "../output/runs", String(runId));
  const reportPath = path.join(outputDir, "report.json");
  const issuesPath = path.join(outputDir, "issues.json");
  const mdPath = path.join(outputDir, "report.md");

  const fromDisk =
    fs.existsSync(reportPath) && fs.existsSync(issuesPath) && fs.existsSync(mdPath)
      ? {
          report: parseJson<Record<string, unknown>>(fs.readFileSync(reportPath, "utf-8"), {}),
          issues: parseJson<unknown[]>(fs.readFileSync(issuesPath, "utf-8"), []),
          markdown: fs.readFileSync(mdPath, "utf-8"),
        }
      : null;

  if (fromDisk) {
    return fromDisk;
  }

  const details = getRunDetails(runId);
  if (!details) {
    return null;
  }

  return {
    report: {
      run: details.run,
      matrixCount: details.matrix.length,
    },
    issues: details.issues,
    markdown: "Report exports are not generated yet for this run.",
  };
}

export function getLatestRunForSuite(suiteId: number) {
  const db = getDb();
  return (
    db
      .select()
      .from(run)
      .where(eq(run.suiteId, suiteId))
      .orderBy(desc(run.id))
      .limit(1)
      .all()[0] || null
  );
}

export function getRunCaseRows(runId: number) {
  const db = getDb();
  return db.select().from(runCase).where(eq(runCase.runId, runId)).all();
}
