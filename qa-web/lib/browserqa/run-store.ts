// Lightweight in-browser run history store.
// Each "run" is the result of pressing Scan on /projects/[id]/run.

const RUNS_KEY_PREFIX = "bqa_runs_";

export type StoredIssue = {
  id: string;
  source: "github" | "browser";
  title: string;
  priority: "P0" | "P1" | "P2";
  category: string;
  description?: string;
};

export type RunRecord = {
  id: string;
  projectId: string;
  createdAt: string;
  issues: StoredIssue[];
  counts: { p0: number; p1: number; p2: number; total: number };
};

function runsKey(projectId: string) {
  return `${RUNS_KEY_PREFIX}${projectId}`;
}

export function loadRuns(projectId: string): RunRecord[] {
  try {
    if (typeof window === "undefined") return [];
    const raw = localStorage.getItem(runsKey(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as RunRecord[]) : [];
  } catch {
    return [];
  }
}

export function saveRun(run: RunRecord): void {
  if (typeof window === "undefined") return;
  const runs = loadRuns(run.projectId);
  // Insert newest first; cap at 50 runs
  const updated = [run, ...runs.filter((r) => r.id !== run.id)].slice(0, 50);
  localStorage.setItem(runsKey(run.projectId), JSON.stringify(updated));
}

export function makeRunId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
