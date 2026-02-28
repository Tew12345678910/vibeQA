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
import { getSql } from "./client";

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

export async function ensureSchema(): Promise<void> {
  if (schemaReady) return schemaReady;

  schemaReady = (async () => {
    const sql = getSql();

    await sql`
      CREATE TABLE IF NOT EXISTS audit_runs (
        id text PRIMARY KEY,
        base_url text NOT NULL,
        input_json jsonb NOT NULL,
        status text NOT NULL,
        external_run_id text,
        summary_json jsonb,
        progress_json jsonb,
        error text,
        created_at bigint NOT NULL,
        updated_at bigint NOT NULL,
        started_at bigint,
        finished_at bigint,
        last_synced_at bigint
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS audit_page_results (
        id bigserial PRIMARY KEY,
        audit_id text NOT NULL REFERENCES audit_runs(id) ON DELETE CASCADE,
        route text NOT NULL,
        viewport_key text NOT NULL,
        status text NOT NULL,
        result_json jsonb NOT NULL,
        created_at bigint NOT NULL,
        updated_at bigint NOT NULL,
        UNIQUE(audit_id, route, viewport_key)
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS audit_issues (
        id bigserial PRIMARY KEY,
        audit_id text NOT NULL REFERENCES audit_runs(id) ON DELETE CASCADE,
        severity text NOT NULL,
        category text NOT NULL,
        title text NOT NULL,
        issue_json jsonb NOT NULL,
        created_at bigint NOT NULL
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS audit_artifacts (
        id bigserial PRIMARY KEY,
        audit_id text NOT NULL REFERENCES audit_runs(id) ON DELETE CASCADE,
        kind text NOT NULL,
        url text NOT NULL,
        meta_json jsonb NOT NULL,
        created_at bigint NOT NULL
      );
    `;

    await sql`CREATE INDEX IF NOT EXISTS audit_runs_status_created_idx ON audit_runs(status, created_at DESC);`;
    await sql`CREATE INDEX IF NOT EXISTS audit_runs_base_url_idx ON audit_runs(base_url);`;
    await sql`CREATE INDEX IF NOT EXISTS audit_page_results_audit_idx ON audit_page_results(audit_id);`;
    await sql`CREATE INDEX IF NOT EXISTS audit_issues_audit_idx ON audit_issues(audit_id);`;
    await sql`CREATE INDEX IF NOT EXISTS audit_artifacts_audit_idx ON audit_artifacts(audit_id);`;
  })();

  return schemaReady;
}

export async function createAuditRun(
  input: AuditRequest,
): Promise<{ auditId: string; status: RunStatus }> {
  await ensureSchema();
  const sql = getSql();
  const auditId = crypto.randomUUID();
  const ts = nowMs();

  await sql`
    INSERT INTO audit_runs (id, base_url, input_json, status, created_at, updated_at, started_at)
    VALUES (${auditId}, ${input.baseUrl}, ${JSON.stringify(input)}, ${"queued"}, ${ts}, ${ts}, ${ts})
  `;

  return { auditId, status: "queued" };
}

export async function updateRunOnStart(args: {
  auditId: string;
  externalRunId: string;
  status: RunStatus;
}): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  const ts = nowMs();
  const auditId = requireUuid(args.auditId);

  await sql`
    UPDATE audit_runs
    SET external_run_id = ${args.externalRunId},
        status = ${args.status},
        updated_at = ${ts},
        last_synced_at = ${ts},
        error = null
    WHERE id = ${auditId}
  `;
}

export async function markRunFailed(
  auditId: string,
  message: string,
): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  const ts = nowMs();

  await sql`
    UPDATE audit_runs
    SET status = ${"failed"},
        error = ${message},
        updated_at = ${ts},
        finished_at = ${ts},
        last_synced_at = ${ts}
    WHERE id = ${requireUuid(auditId)}
  `;
}

export async function cancelRun(auditId: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  const ts = nowMs();

  await sql`
    UPDATE audit_runs
    SET status = ${"canceled"},
        updated_at = ${ts},
        finished_at = CASE WHEN finished_at IS NULL THEN ${ts} ELSE finished_at END,
        last_synced_at = ${ts}
    WHERE id = ${requireUuid(auditId)}
  `;
}

export async function getRunRow(auditId: string): Promise<AuditRunRow | null> {
  await ensureSchema();
  const sql = getSql();

  const rows = (await sql`
    SELECT id, base_url, input_json, status, external_run_id, summary_json,
           progress_json, error, created_at, updated_at, started_at, finished_at, last_synced_at
    FROM audit_runs
    WHERE id = ${requireUuid(auditId)}
    LIMIT 1
  `) as AuditRunRow[];

  return rows[0] ?? null;
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
  const sql = getSql();
  const ts = nowMs();
  const finishedAt = ["completed", "failed", "canceled"].includes(args.status)
    ? ts
    : null;

  await sql`
    UPDATE audit_runs
    SET status = ${args.status},
        summary_json = ${JSON.stringify(args.summary)},
        progress_json = ${JSON.stringify(args.progress)},
        error = ${args.error ?? null},
        updated_at = ${ts},
        last_synced_at = ${ts},
        finished_at = COALESCE(finished_at, ${finishedAt})
    WHERE id = ${requireUuid(args.auditId)}
  `;

  await sql`DELETE FROM audit_page_results WHERE audit_id = ${args.auditId}`;
  await sql`DELETE FROM audit_issues WHERE audit_id = ${args.auditId}`;
  await sql`DELETE FROM audit_artifacts WHERE audit_id = ${args.auditId}`;

  for (const item of args.pageResults) {
    await sql`
      INSERT INTO audit_page_results (audit_id, route, viewport_key, status, result_json, created_at, updated_at)
      VALUES (${args.auditId}, ${item.route}, ${item.viewportKey}, ${item.status}, ${JSON.stringify(item)}, ${ts}, ${ts})
    `;
  }

  for (const item of args.issues) {
    await sql`
      INSERT INTO audit_issues (audit_id, severity, category, title, issue_json, created_at)
      VALUES (${args.auditId}, ${item.severity}, ${item.category}, ${item.title}, ${JSON.stringify(item)}, ${ts})
    `;
  }

  for (const item of args.artifacts) {
    await sql`
      INSERT INTO audit_artifacts (audit_id, kind, url, meta_json, created_at)
      VALUES (${args.auditId}, ${item.kind}, ${item.url}, ${JSON.stringify(item.meta)}, ${ts})
    `;
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
  const sql = getSql();
  const row = await getRunRow(auditId);
  if (!row) return null;

  const [pages, issues, artifacts] = (await Promise.all([
    sql`
      SELECT route, viewport_key, status, result_json FROM audit_page_results
      WHERE audit_id = ${auditId} ORDER BY route ASC, viewport_key ASC
    `,
    sql`
      SELECT issue_json FROM audit_issues WHERE audit_id = ${auditId} ORDER BY id ASC
    `,
    sql`
      SELECT kind, url, meta_json FROM audit_artifacts WHERE audit_id = ${auditId} ORDER BY id ASC
    `,
  ])) as [AuditPageRow[], AuditIssueRow[], AuditArtifactRow[]];

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
  const sql = getSql();

  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (args.status) {
    params.push(args.status);
    conditions.push(`status = $${params.length}`);
  }

  if (args.baseUrl) {
    params.push(`%${args.baseUrl.toLowerCase()}%`);
    conditions.push(`LOWER(base_url) LIKE $${params.length}`);
  }

  if (args.dateFrom) {
    params.push(args.dateFrom);
    conditions.push(`created_at >= $${params.length}`);
  }

  if (args.dateTo) {
    params.push(args.dateTo);
    conditions.push(`created_at <= $${params.length}`);
  }

  if (args.cursor) {
    params.push(args.cursor);
    conditions.push(`created_at < $${params.length}`);
  }

  params.push(args.limit + 1);

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";
  const rows = (await sql.query(
    `
    SELECT id, base_url, input_json, status, external_run_id, summary_json,
           progress_json, error, created_at, updated_at, started_at, finished_at, last_synced_at
    FROM audit_runs
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${params.length}
    `,
    params,
  )) as AuditRunRow[];

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
