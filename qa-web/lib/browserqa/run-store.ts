// Lightweight in-browser run history store.
// Each "run" is the result of pressing Scan on /projects/[id]/run.

import { normalizeProjectAnalysis, type RunMetadata } from "./project-analysis";

const RUNS_KEY_PREFIX = "bqa_runs_";

export type StoredIssue = {
  id: string;
  source: "github" | "browser";
  title: string;
  priority: "P0" | "P1" | "P2";
  category: string;
  description?: string;
  cardJson?: Record<string, unknown>;
  filePath?: string;
  endpoint?: string;
  confidence?: "high" | "medium" | "low";
  state?: string;
};

export type RunRecord = {
  id: string;
  projectId: string;
  createdAt: string;
  issues: StoredIssue[];
  counts: { p0: number; p1: number; p2: number; total: number };
  meta?: RunMetadata;
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
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (entry): entry is Record<string, unknown> =>
          typeof entry === "object" && entry !== null,
      )
      .map((entry) => {
        const metaRaw =
          entry.meta && typeof entry.meta === "object"
            ? (entry.meta as Record<string, unknown>)
            : null;

        const selectedRoutePaths = Array.isArray(metaRaw?.selectedRoutePaths)
          ? metaRaw.selectedRoutePaths
              .map((value) => String(value).trim())
              .filter(Boolean)
          : [];

        return {
          id: String(entry.id ?? ""),
          projectId: String(entry.projectId ?? ""),
          createdAt: String(entry.createdAt ?? new Date().toISOString()),
          issues: Array.isArray(entry.issues)
            ? (entry.issues as StoredIssue[])
            : [],
          counts:
            entry.counts && typeof entry.counts === "object"
              ? (entry.counts as RunRecord["counts"])
              : { p0: 0, p1: 0, p2: 0, total: 0 },
          meta: metaRaw
            ? {
                scope:
                  metaRaw.scope === "analysis-only"
                    ? "analysis-only"
                    : "full",
                selectedRoutePaths,
                projectAnalysis: normalizeProjectAnalysis(
                  metaRaw.projectAnalysis,
                ),
              }
            : undefined,
        } satisfies RunRecord;
      })
      .filter((run) => run.id && run.projectId);
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
