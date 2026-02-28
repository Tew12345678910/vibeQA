import crypto from "node:crypto";

import type {
  Artifact,
  AuditListItem,
  AuditProgress,
  AuditRequest,
  AuditStatusResponse,
  AuditSummary,
  Issue,
  PageResult,
  RunStatus,
} from "@/lib/contracts";

import { emptyAuditSummary } from "@/lib/cloud/mapper";
import { getDbClient } from "./client";

type AuditRunRow = {
  id: string;
  base_url: string;
  input_json: AuditRequest;
  status: RunStatus;
  external_run_id: string | null;
  summary_json: AuditSummary | null;
  progress_json: AuditProgress | null;
  error: string | null;
  created_at: string | number;
  updated_at: string | number;
  started_at: string | number | null;
  finished_at: string | number | null;
  last_synced_at: string | number | null;
};

type AuditPageRow = {
  route: string;
  viewport_key: "desktop" | "mobile";
  status: PageResult["status"];
  result_json: PageResult;
};

type AuditIssueRow = {
  issue_json: Issue;
};

type AuditArtifactRow = {
  kind: string;
  url: string;
  meta_json: Artifact["meta"];
};

const THROTTLE_MS = 2000;

let schemaReady: Promise<void> | null = null;

function nowMs(): number {
  return Date.now();
}

function asMs(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "string" ? Number(value) : Number(value);
  return Number.isFinite(n) ? n : null;
}

function toIso(value: unknown): string | null {
  const ms = asMs(value);
  if (ms === null) return null;
  return new Date(ms).toISOString();
}

function requireUuid(raw: string): string {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      raw,
    )
  ) {
    throw new Error("Invalid audit id");
  }
  return raw;
}

function throwDbError(error: { message?: string } | null): never {
  throw new Error(error?.message ?? "Database request failed");
}

export async function ensureSchema(): Promise<void> {
  if (schemaReady) return schemaReady;

  schemaReady = (async () => {
    const db = getDbClient();
    const { error } = await db
      .from("audit_runs")
      .select("id", { head: true, count: "exact" })
      .limit(1);

    if (error) {
      if (
        /relation .* does not exist|Could not find the table/i.test(
          error.message,
        )
      ) {
        throw new Error(
          "Supabase tables are missing. Run the SQL in qa-web/supabase/migrations/20260228_audit_tables.sql first.",
        );
      }
      throwDbError(error);
    }
  })();

  return schemaReady;
}

export async function createAuditRun(
  input: AuditRequest,
): Promise<{ auditId: string; status: RunStatus }> {
  await ensureSchema();
  const db = getDbClient();
  const auditId = crypto.randomUUID();
  const ts = nowMs();

  const { error } = await db.from("audit_runs").insert({
    id: auditId,
    base_url: input.baseUrl,
    input_json: input,
    status: "queued",
    created_at: ts,
    updated_at: ts,
    started_at: ts,
  });

  if (error) throwDbError(error);

  return { auditId, status: "queued" };
}

export async function updateRunOnStart(args: {
  auditId: string;
  externalRunId: string;
  status: RunStatus;
}): Promise<void> {
  await ensureSchema();
  const db = getDbClient();
  const ts = nowMs();
  const auditId = requireUuid(args.auditId);

  const { error } = await db
    .from("audit_runs")
    .update({
      external_run_id: args.externalRunId,
      status: args.status,
      updated_at: ts,
      last_synced_at: ts,
      error: null,
    })
    .eq("id", auditId);

  if (error) throwDbError(error);
}

export async function markRunFailed(
  auditId: string,
  message: string,
): Promise<void> {
  await ensureSchema();
  const db = getDbClient();
  const ts = nowMs();

  const { error } = await db
    .from("audit_runs")
    .update({
      status: "failed",
      error: message,
      updated_at: ts,
      finished_at: ts,
      last_synced_at: ts,
    })
    .eq("id", requireUuid(auditId));

  if (error) throwDbError(error);
}

export async function cancelRun(auditId: string): Promise<void> {
  await ensureSchema();
  const db = getDbClient();
  const ts = nowMs();
  const id = requireUuid(auditId);

  const row = await getRunRow(id);
  if (!row) return;

  const { error } = await db
    .from("audit_runs")
    .update({
      status: "canceled",
      updated_at: ts,
      finished_at: row.finished_at ?? ts,
      last_synced_at: ts,
    })
    .eq("id", id);

  if (error) throwDbError(error);
}

export async function getRunRow(auditId: string): Promise<AuditRunRow | null> {
  await ensureSchema();
  const db = getDbClient();

  const { data, error } = await db
    .from("audit_runs")
    .select(
      "id, base_url, input_json, status, external_run_id, summary_json, progress_json, error, created_at, updated_at, started_at, finished_at, last_synced_at",
    )
    .eq("id", requireUuid(auditId))
    .maybeSingle<AuditRunRow>();

  if (error) throwDbError(error);

  return data ?? null;
}

export async function updateRunWithCloudSnapshot(args: {
  auditId: string;
  status: RunStatus;
  summary: AuditSummary;
  progress: AuditProgress;
  pageResults: PageResult[];
  issues: Issue[];
  artifacts: Artifact[];
  error?: string | null;
}): Promise<void> {
  await ensureSchema();
  const db = getDbClient();
  const ts = nowMs();
  const finishedAt = ["completed", "failed", "canceled"].includes(args.status)
    ? ts
    : null;

  const id = requireUuid(args.auditId);

  const currentRow = await getRunRow(id);

  const { error: updateError } = await db
    .from("audit_runs")
    .update({
      status: args.status,
      summary_json: args.summary,
      progress_json: args.progress,
      error: args.error ?? null,
      updated_at: ts,
      last_synced_at: ts,
      finished_at: currentRow?.finished_at ?? finishedAt,
    })
    .eq("id", id);

  if (updateError) throwDbError(updateError);

  const [
    { error: pageDeleteError },
    { error: issueDeleteError },
    { error: artifactDeleteError },
  ] = await Promise.all([
    db.from("audit_page_results").delete().eq("audit_id", id),
    db.from("audit_issues").delete().eq("audit_id", id),
    db.from("audit_artifacts").delete().eq("audit_id", id),
  ]);

  if (pageDeleteError) throwDbError(pageDeleteError);
  if (issueDeleteError) throwDbError(issueDeleteError);
  if (artifactDeleteError) throwDbError(artifactDeleteError);

  if (args.pageResults.length) {
    const { error } = await db.from("audit_page_results").insert(
      args.pageResults.map((item) => ({
        audit_id: id,
        route: item.route,
        viewport_key: item.viewportKey,
        status: item.status,
        result_json: item,
        created_at: ts,
        updated_at: ts,
      })),
    );
    if (error) throwDbError(error);
  }

  if (args.issues.length) {
    const { error } = await db.from("audit_issues").insert(
      args.issues.map((item) => ({
        audit_id: id,
        severity: item.severity,
        category: item.category,
        title: item.title,
        issue_json: item,
        created_at: ts,
      })),
    );
    if (error) throwDbError(error);
  }

  if (args.artifacts.length) {
    const { error } = await db.from("audit_artifacts").insert(
      args.artifacts.map((item) => ({
        audit_id: id,
        kind: item.kind,
        url: item.url,
        meta_json: item.meta,
        created_at: ts,
      })),
    );
    if (error) throwDbError(error);
  }
}

export function shouldSyncRun(row: AuditRunRow): boolean {
  if (["completed", "failed", "canceled"].includes(row.status)) return false;
  if (!row.external_run_id) return false;
  const lastSyncedAt = asMs(row.last_synced_at);
  if (lastSyncedAt === null) return true;
  return nowMs() - lastSyncedAt >= THROTTLE_MS;
}

export async function getAuditStatusResponse(
  auditId: string,
): Promise<AuditStatusResponse | null> {
  await ensureSchema();
  const db = getDbClient();
  const id = requireUuid(auditId);
  const row = await getRunRow(id);
  if (!row) return null;

  const [pagesResult, issuesResult, artifactsResult] = await Promise.all([
    db
      .from("audit_page_results")
      .select("route, viewport_key, status, result_json")
      .eq("audit_id", id)
      .order("route", { ascending: true })
      .order("viewport_key", { ascending: true }),
    db
      .from("audit_issues")
      .select("issue_json")
      .eq("audit_id", id)
      .order("id", { ascending: true }),
    db
      .from("audit_artifacts")
      .select("kind, url, meta_json")
      .eq("audit_id", id)
      .order("id", { ascending: true }),
  ]);

  if (pagesResult.error) throwDbError(pagesResult.error);
  if (issuesResult.error) throwDbError(issuesResult.error);
  if (artifactsResult.error) throwDbError(artifactsResult.error);

  const pages = (pagesResult.data ?? []) as AuditPageRow[];
  const issues = (issuesResult.data ?? []) as AuditIssueRow[];
  const artifacts = (artifactsResult.data ?? []) as AuditArtifactRow[];

  const summary = row.summary_json ?? emptyAuditSummary(row.base_url);
  const progress: AuditProgress = row.progress_json ?? {
    phase: row.status,
    completedChecks: 0,
    totalChecks: 0,
    lastSyncedAt: toIso(row.last_synced_at),
  };

  return {
    auditId: row.id,
    status: row.status,
    input: row.input_json,
    progress,
    summary,
    pageResults: pages.map((e) => e.result_json),
    issues: issues.map((e) => e.issue_json),
    artifacts: {
      links: artifacts.map((e) => ({
        kind: e.kind,
        url: e.url,
        meta: e.meta_json ?? {},
      })),
    },
    updatedAt: toIso(row.updated_at) ?? new Date().toISOString(),
    startedAt: toIso(row.started_at),
    finishedAt: toIso(row.finished_at),
    error: row.error,
  };
}

export async function listAuditStatusResponses(args: {
  status?: RunStatus;
  cursor?: number;
  limit: number;
  baseUrl?: string;
  dateFrom?: number;
  dateTo?: number;
}): Promise<{ items: AuditListItem[]; nextCursor: number | null }> {
  await ensureSchema();
  const db = getDbClient();

  let query = db
    .from("audit_runs")
    .select(
      "id, base_url, input_json, status, external_run_id, summary_json, progress_json, error, created_at, updated_at, started_at, finished_at, last_synced_at",
    )
    .order("created_at", { ascending: false })
    .limit(args.limit + 1);

  if (args.status) {
    query = query.eq("status", args.status);
  }

  if (args.baseUrl) {
    query = query.ilike("base_url", `%${args.baseUrl}%`);
  }

  if (args.dateFrom) {
    query = query.gte("created_at", args.dateFrom);
  }

  if (args.dateTo) {
    query = query.lte("created_at", args.dateTo);
  }

  if (args.cursor) {
    query = query.lt("created_at", args.cursor);
  }

  const { data, error } = await query;
  if (error) throwDbError(error);

  const rows = (data ?? []) as AuditRunRow[];
  const hasNext = rows.length > args.limit;
  const slice = hasNext ? rows.slice(0, args.limit) : rows;

  const items: AuditListItem[] = slice.map((row) => ({
    auditId: row.id,
    baseUrl: row.base_url,
    status: row.status,
    summary: row.summary_json ?? emptyAuditSummary(row.base_url),
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIso(row.updated_at) ?? new Date().toISOString(),
    finishedAt: toIso(row.finished_at),
    input: row.input_json,
  }));

  const nextCursor = hasNext
    ? asMs(slice[slice.length - 1]?.created_at ?? null)
    : null;

  return { items, nextCursor };
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export type ProjectRow = {
  id: string;
  name: string;
  source_type: string;
  github_repo: string | null;
  website_url: string | null;
  base_url: string;
  config_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export async function upsertProject(project: {
  id: string;
  name: string;
  sourceType: string;
  githubRepo?: string;
  websiteUrl?: string;
  baseUrl: string;
  configJson?: Record<string, unknown>;
}): Promise<void> {
  const db = getDbClient();
  const { error } = await db.from("projects").upsert(
    {
      id: project.id,
      name: project.name,
      source_type: project.sourceType,
      github_repo: project.githubRepo ?? null,
      website_url: project.websiteUrl ?? null,
      base_url: project.baseUrl,
      config_json: project.configJson ?? {},
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) throwDbError(error);
}

export async function listProjects(): Promise<ProjectRow[]> {
  const db = getDbClient();
  const { data, error } = await db
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throwDbError(error);
  return (data ?? []) as ProjectRow[];
}

export async function getProjectRow(id: string): Promise<ProjectRow | null> {
  const db = getDbClient();
  const { data, error } = await db
    .from("projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throwDbError(error);
  return (data ?? null) as ProjectRow | null;
}

export async function patchProjectRow(
  id: string,
  patch: { githubRepo?: string; websiteUrl?: string; name?: string },
): Promise<void> {
  const db = getDbClient();
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.githubRepo !== undefined) update.github_repo = patch.githubRepo;
  if (patch.websiteUrl !== undefined) update.website_url = patch.websiteUrl;
  if (patch.name !== undefined) update.name = patch.name;
  const { error } = await db.from("projects").update(update).eq("id", id);
  if (error) throwDbError(error);
}

export async function deleteProjectRow(id: string): Promise<void> {
  const db = getDbClient();
  const { error } = await db.from("projects").delete().eq("id", id);
  if (error) throwDbError(error);
}

// ---------------------------------------------------------------------------
// Project Runs + Issues
// ---------------------------------------------------------------------------

export type RunIssueRow = {
  run_id: string;
  project_id: string;
  issue_id: string;
  source: string;
  title: string;
  priority: string;
  category: string;
  description: string | null;
};

export type ProjectRunRow = {
  id: string;
  project_id: string;
  count_p0: number;
  count_p1: number;
  count_p2: number;
  count_total: number;
  created_at: string;
  issues?: RunIssueRow[];
};

export async function insertProjectRun(run: {
  id: string;
  projectId: string;
  createdAt: string;
  counts: { p0: number; p1: number; p2: number; total: number };
  issues: Array<{
    id: string;
    source: string;
    title: string;
    priority: string;
    category: string;
    description?: string;
  }>;
}): Promise<void> {
  const db = getDbClient();

  const { error: runError } = await db.from("project_runs").insert({
    id: run.id,
    project_id: run.projectId,
    count_p0: run.counts.p0,
    count_p1: run.counts.p1,
    count_p2: run.counts.p2,
    count_total: run.counts.total,
    created_at: run.createdAt,
  });
  if (runError) throwDbError(runError);

  if (run.issues.length > 0) {
    const { error: issuesError } = await db.from("run_issues").insert(
      run.issues.map((i) => ({
        run_id: run.id,
        project_id: run.projectId,
        issue_id: i.id,
        source: i.source,
        title: i.title,
        priority: i.priority,
        category: i.category,
        description: i.description ?? null,
      })),
    );
    if (issuesError) throwDbError(issuesError);
  }
}

export async function listProjectRuns(
  projectId: string,
): Promise<ProjectRunRow[]> {
  const db = getDbClient();

  const { data: runs, error: runsError } = await db
    .from("project_runs")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (runsError) throwDbError(runsError);
  if (!runs || runs.length === 0) return [];

  const runIds = (runs as ProjectRunRow[]).map((r) => r.id);
  const { data: issues, error: issuesError } = await db
    .from("run_issues")
    .select("*")
    .in("run_id", runIds);
  if (issuesError) throwDbError(issuesError);

  const issuesByRun = new Map<string, RunIssueRow[]>();
  for (const issue of (issues ?? []) as RunIssueRow[]) {
    const list = issuesByRun.get(issue.run_id) ?? [];
    list.push(issue);
    issuesByRun.set(issue.run_id, list);
  }

  return (runs as ProjectRunRow[]).map((r) => ({
    ...r,
    issues: issuesByRun.get(r.id) ?? [],
  }));
}
