import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { RETENTION_MS, RUNS_DIRECTORY } from "@/lib/project-auditor/constants";
import {
  analyzeResultSchema,
  ingestionRecordSchema,
  type AnalyzeResult,
  type BrowserUseTestPlan,
  type IngestionRecord,
  type StandardsScorecard,
} from "@/lib/project-auditor/schemas";

const INGESTION_FILE = "ingestion.json";
const SCORECARD_FILE = "standards_scorecard.json";
const TEST_PLAN_FILE = "browser_use_test_plan.json";
const AI_REPORT_FILE = "ai_report.md";
const RESULT_FILE = "result.json";
const SOURCE_ZIP_FILE = "source.zip";

function runsRoot(): string {
  return path.join(process.cwd(), RUNS_DIRECTORY);
}

export function getRunDirectory(id: string): string {
  return path.join(runsRoot(), id);
}

function ingestionFilePath(id: string): string {
  return path.join(getRunDirectory(id), INGESTION_FILE);
}

export function zipFilePath(id: string): string {
  return path.join(getRunDirectory(id), SOURCE_ZIP_FILE);
}

function scorecardPath(id: string): string {
  return path.join(getRunDirectory(id), SCORECARD_FILE);
}

function planPath(id: string): string {
  return path.join(getRunDirectory(id), TEST_PLAN_FILE);
}

function aiReportPath(id: string): string {
  return path.join(getRunDirectory(id), AI_REPORT_FILE);
}

function resultPath(id: string): string {
  return path.join(getRunDirectory(id), RESULT_FILE);
}

async function ensureRunsRoot(): Promise<void> {
  await fs.mkdir(runsRoot(), { recursive: true });
}

export async function cleanupExpiredRuns(now = Date.now()): Promise<void> {
  await ensureRunsRoot();

  const entries = await fs.readdir(runsRoot(), { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const dirPath = path.join(runsRoot(), entry.name);
    const ingestPath = path.join(dirPath, INGESTION_FILE);

    try {
      const raw = await fs.readFile(ingestPath, "utf8");
      const parsed = ingestionRecordSchema.parse(JSON.parse(raw));
      const ageMs = now - Date.parse(parsed.updatedAt);
      if (ageMs > RETENTION_MS) {
        await fs.rm(dirPath, { recursive: true, force: true });
      }
    } catch {
      const stat = await fs.stat(dirPath);
      if (now - stat.mtimeMs > RETENTION_MS) {
        await fs.rm(dirPath, { recursive: true, force: true });
      }
    }
  }
}

export async function createIngestionRecord(args: {
  sourceType: "zip" | "github";
  sourceLabel: string;
  zipFileName: string;
  zipBytes: number;
  projectNameHint: string;
}): Promise<IngestionRecord> {
  await ensureRunsRoot();

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const record: IngestionRecord = {
    id,
    sourceType: args.sourceType,
    sourceLabel: args.sourceLabel,
    createdAt,
    updatedAt: createdAt,
    status: "ingested",
    error: null,
    zipFileName: args.zipFileName,
    zipBytes: args.zipBytes,
    projectNameHint: args.projectNameHint,
  };

  await fs.mkdir(getRunDirectory(id), { recursive: true });
  await writeIngestionRecord(record);
  return record;
}

export async function writeIngestionRecord(record: IngestionRecord): Promise<void> {
  const parsed = ingestionRecordSchema.parse(record);
  await fs.writeFile(
    ingestionFilePath(parsed.id),
    `${JSON.stringify(parsed, null, 2)}\n`,
    "utf8",
  );
}

export async function readIngestionRecord(id: string): Promise<IngestionRecord | null> {
  try {
    const raw = await fs.readFile(ingestionFilePath(id), "utf8");
    return ingestionRecordSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function updateIngestionStatus(args: {
  id: string;
  status: IngestionRecord["status"];
  error?: string | null;
}): Promise<IngestionRecord> {
  const existing = await readIngestionRecord(args.id);
  if (!existing) {
    throw new Error("Ingestion record not found");
  }

  const next: IngestionRecord = {
    ...existing,
    status: args.status,
    error: args.error ?? null,
    updatedAt: new Date().toISOString(),
  };

  await writeIngestionRecord(next);
  return next;
}

export async function patchIngestionRecord(args: {
  id: string;
  patch: Partial<
    Pick<
      IngestionRecord,
      "zipBytes" | "zipFileName" | "sourceLabel" | "projectNameHint" | "status" | "error"
    >
  >;
}): Promise<IngestionRecord> {
  const existing = await readIngestionRecord(args.id);
  if (!existing) {
    throw new Error("Ingestion record not found");
  }

  const next: IngestionRecord = ingestionRecordSchema.parse({
    ...existing,
    ...args.patch,
    updatedAt: new Date().toISOString(),
  });

  await writeIngestionRecord(next);
  return next;
}

export async function writeZipBuffer(id: string, data: Buffer): Promise<void> {
  await fs.writeFile(zipFilePath(id), data);
}

export async function writeAnalyzeArtifacts(args: {
  id: string;
  scorecard: StandardsScorecard;
  browserUseTestPlan: BrowserUseTestPlan;
  aiReportMarkdown: string;
}): Promise<AnalyzeResult> {
  const generatedAt = new Date().toISOString();
  const result: AnalyzeResult = analyzeResultSchema.parse({
    id: args.id,
    scorecard: args.scorecard,
    browserUseTestPlan: args.browserUseTestPlan,
    aiReportMarkdown: args.aiReportMarkdown,
    generatedAt,
  });

  await Promise.all([
    fs.writeFile(scorecardPath(args.id), `${JSON.stringify(args.scorecard, null, 2)}\n`, "utf8"),
    fs.writeFile(planPath(args.id), `${JSON.stringify(args.browserUseTestPlan, null, 2)}\n`, "utf8"),
    fs.writeFile(aiReportPath(args.id), `${args.aiReportMarkdown.trimEnd()}\n`, "utf8"),
    fs.writeFile(resultPath(args.id), `${JSON.stringify(result, null, 2)}\n`, "utf8"),
  ]);

  return result;
}

export async function readAnalyzeResult(id: string): Promise<AnalyzeResult | null> {
  try {
    const raw = await fs.readFile(resultPath(id), "utf8");
    return analyzeResultSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function getArtifactNames() {
  return {
    scorecard: SCORECARD_FILE,
    testPlan: TEST_PLAN_FILE,
    aiReport: AI_REPORT_FILE,
  };
}
