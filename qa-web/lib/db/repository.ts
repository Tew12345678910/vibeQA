import { getDbClient } from "./client";

function throwDbError(error: { message?: string } | null): never {
  throw new Error(error?.message ?? "Database request failed");
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
  patch: {
    githubRepo?: string;
    websiteUrl?: string;
    name?: string;
    configJson?: Record<string, unknown>;
  },
): Promise<void> {
  const db = getDbClient();
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.githubRepo !== undefined) update.github_repo = patch.githubRepo;
  if (patch.websiteUrl !== undefined) update.website_url = patch.websiteUrl;
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.configJson !== undefined) update.config_json = patch.configJson;
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
  card_json?: Record<string, unknown> | null;
  file_path?: string | null;
  endpoint?: string | null;
  confidence?: string | null;
  state?: string | null;
};

export type ProjectRunRow = {
  id: string;
  project_id: string;
  count_p0: number;
  count_p1: number;
  count_p2: number;
  count_total: number;
  analysis_framework: string | null;
  analysis_router: string | null;
  analysis_routes_json: Array<Record<string, unknown>>;
  meta_json: Record<string, unknown>;
  created_at: string;
  issues?: RunIssueRow[];
};

export async function insertProjectRun(run: {
  id: string;
  projectId: string;
  createdAt: string;
  counts: { p0: number; p1: number; p2: number; total: number };
  analysis?: {
    framework?: string;
    router?: string;
    routes?: Array<Record<string, unknown>>;
  };
  metaJson?: Record<string, unknown>;
  issues: Array<{
    id: string;
    source: string;
    title: string;
    priority: string;
    category: string;
    description?: string;
    cardJson?: Record<string, unknown>;
    filePath?: string;
    endpoint?: string;
    confidence?: string;
    state?: string;
  }>;
}): Promise<void> {
  const db = getDbClient();

  const { error: runError } = await db.from("project_runs").upsert(
    {
      id: run.id,
      project_id: run.projectId,
      count_p0: run.counts.p0,
      count_p1: run.counts.p1,
      count_p2: run.counts.p2,
      count_total: run.counts.total,
      analysis_framework: run.analysis?.framework ?? null,
      analysis_router: run.analysis?.router ?? null,
      analysis_routes_json: run.analysis?.routes ?? [],
      meta_json: run.metaJson ?? {},
      created_at: run.createdAt,
    },
    { onConflict: "id" },
  );
  if (runError) throwDbError(runError);

  if (run.issues.length > 0) {
    const { error: issuesError } = await db.from("run_issues").upsert(
      run.issues.map((i) => ({
        run_id: run.id,
        project_id: run.projectId,
        issue_id: i.id,
        source: i.source,
        title: i.title,
        priority: i.priority,
        category: i.category,
        description: i.description ?? null,
        card_json: i.cardJson ?? null,
        file_path: i.filePath ?? null,
        endpoint: i.endpoint ?? null,
        confidence: i.confidence ?? null,
        state: i.state ?? "open",
      })),
      { onConflict: "run_id,issue_id" },
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

export async function getProjectRunById(
  projectId: string,
  runId: string,
): Promise<ProjectRunRow | null> {
  const db = getDbClient();

  const { data: run, error: runError } = await db
    .from("project_runs")
    .select("*")
    .eq("project_id", projectId)
    .eq("id", runId)
    .maybeSingle();
  if (runError) throwDbError(runError);
  if (!run) return null;

  const { data: issues, error: issuesError } = await db
    .from("run_issues")
    .select("*")
    .eq("project_id", projectId)
    .eq("run_id", runId)
    .order("id", { ascending: true });
  if (issuesError) throwDbError(issuesError);

  return {
    ...(run as ProjectRunRow),
    issues: (issues ?? []) as RunIssueRow[],
  };
}

export async function getProjectRunByRunId(
  runId: string,
): Promise<ProjectRunRow | null> {
  const db = getDbClient();

  const { data: run, error: runError } = await db
    .from("project_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle();
  if (runError) throwDbError(runError);
  if (!run) return null;

  const runRow = run as ProjectRunRow;
  const { data: issues, error: issuesError } = await db
    .from("run_issues")
    .select("*")
    .eq("project_id", runRow.project_id)
    .eq("run_id", runId)
    .order("id", { ascending: true });
  if (issuesError) throwDbError(issuesError);

  return {
    ...runRow,
    issues: (issues ?? []) as RunIssueRow[],
  };
}
