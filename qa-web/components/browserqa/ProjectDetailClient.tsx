"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  Github,
  Globe,
  Play,
  Plus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DetailLoadingState } from "@/components/browserqa/LoadingStates";
import {
  getProjectById,
} from "@/lib/browserqa/project-store";
import { loadRuns, type RunRecord } from "@/lib/browserqa/run-store";
import { type RunMetadata } from "@/lib/browserqa/project-analysis";

// ------------------------------------------------------------------
// Priority helpers
// ------------------------------------------------------------------

type Priority = "P0" | "P1" | "P2";

const priorityColors: Record<Priority, string> = {
  P0: "border-red-500/40 bg-red-500/10 text-red-300",
  P1: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  P2: "border-blue-500/40 bg-blue-500/10 text-blue-300",
};

// ------------------------------------------------------------------
// Component
// ------------------------------------------------------------------

type Props = { projectId: string };

export function ProjectDetailClient({ projectId }: Props) {
  const router = useRouter();
  const project = useMemo(() => getProjectById(projectId), [projectId]);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load runs from Supabase; fall back to localStorage
    fetch(`/api/projects/${projectId}/runs`)
      .then(async (res) => {
        if (!res.ok) throw new Error("api error");
        const body = (await res.json()) as {
          runs: Array<{
            id: string;
            project_id: string;
            count_p0: number;
            count_p1: number;
            count_p2: number;
            count_total: number;
            meta_json?: Record<string, unknown>;
            created_at: string;
            issues?: Array<{
              issue_id: string;
              source: string;
              title: string;
              priority: string;
              category: string;
              description: string | null;
            }>;
          }>;
        };
        setRuns(
          body.runs.map((r) => ({
            id: r.id,
            projectId: r.project_id,
            createdAt: r.created_at,
            counts: {
              p0: r.count_p0,
              p1: r.count_p1,
              p2: r.count_p2,
              total: r.count_total,
            },
            meta: (r.meta_json as RunMetadata | undefined) ?? undefined,
            issues: (r.issues ?? []).map((i) => ({
              id: i.issue_id,
              source: i.source as "github" | "browser",
              title: i.title,
              priority: i.priority as "P0" | "P1" | "P2",
              category: i.category,
              description: i.description ?? undefined,
            })),
          })),
        );
      })
      .catch(() => {
        // Supabase unavailable — use localStorage cache
        setRuns(loadRuns(projectId));
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) return <DetailLoadingState label="Loading project..." />;

  if (!project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-slate-400">Project not found.</p>
        <Button
          variant="ghost"
          onClick={() => router.push("/projects")}
          className="text-slate-400 hover:text-slate-100"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Projects
        </Button>
      </div>
    );
  }

  const latest = runs[0] ?? null;

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/projects")}
          className="-ml-2 mb-1 w-fit text-slate-400 hover:text-slate-100"
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          All Projects
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">
              {project.name}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              {project.githubRepo ? (
                <a
                  href={project.githubRepo}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-blue-400"
                >
                  <Github className="h-3.5 w-3.5" />
                  {project.githubRepo.replace("https://github.com/", "")}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : null}
              {project.websiteUrl ? (
                <a
                  href={project.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-blue-400"
                >
                  <Globe className="h-3.5 w-3.5" />
                  {project.websiteUrl}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : null}
            </div>
          </div>

          <Button
            onClick={() => router.push(`/projects/${projectId}/run`)}
            size="lg"
            className="bg-emerald-500 text-slate-950 hover:bg-emerald-400 shadow-lg shadow-emerald-500/20"
          >
            <Plus className="mr-2 h-5 w-5" />
            New Scan
          </Button>
        </div>
      </div>

      {/* Stats row (latest run) */}
      {latest ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Latest Scan"
            value={new Date(latest.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
            icon={<Clock className="h-4 w-4 text-slate-400" />}
          />
          <StatCard
            label="Total Issues"
            value={String(latest.counts.total)}
            icon={<AlertTriangle className="h-4 w-4 text-slate-400" />}
          />
          <StatCard
            label="Critical (P0)"
            value={String(latest.counts.p0)}
            className={
              latest.counts.p0 > 0 ? "border-red-500/30 bg-red-500/5" : ""
            }
          />
          <StatCard
            label="High (P1)"
            value={String(latest.counts.p1)}
            className={
              latest.counts.p1 > 0 ? "border-amber-500/30 bg-amber-500/5" : ""
            }
          />
        </div>
      ) : null}

      {/* Run history */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
          Scan History
        </h2>

        {runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-slate-700 py-16 text-slate-500">
            <Play className="h-12 w-12 text-slate-700" />
            <p className="text-base font-semibold text-slate-300">
              No scans yet
            </p>
            <p className="text-sm">
              Click <span className="text-emerald-400">New Scan</span> to
              analyse this project.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {runs.map((run) => (
              <RunCard key={run.id} run={run} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Sub-components
// ------------------------------------------------------------------

function StatCard({
  label,
  value,
  icon,
  className = "",
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-slate-800 bg-slate-900/60 p-4 ${className}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{label}</p>
        {icon}
      </div>
      <p className="mt-1 text-2xl font-bold text-slate-100">{value}</p>
    </div>
  );
}

function RunCard({ run }: { run: RunRecord }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="border-slate-800 bg-slate-900/60">
      <CardContent className="p-0">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-between rounded-xl px-5 py-4 text-left transition-colors hover:bg-slate-800/40"
        >
          <div className="flex items-center gap-4">
            {expanded ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
            )}
            <div>
              <p className="text-sm font-medium text-slate-100">
                {new Date(run.createdAt).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
              <p className="text-xs text-slate-500">
                {run.counts.total} issue{run.counts.total !== 1 ? "s" : ""}
              </p>
              {run.meta?.scope === "analysis-only" ? (
                <p className="text-[11px] text-blue-300">
                  Analyzed pages only ({run.meta.selectedRoutePaths.length})
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(["P0", "P1", "P2"] as const).map((p) => {
              const count = run.counts[p.toLowerCase() as "p0" | "p1" | "p2"];
              if (count === 0) return null;
              return (
                <span
                  key={p}
                  className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${priorityColors[p]}`}
                >
                  {count} {p}
                </span>
              );
            })}
          </div>
        </button>

        {expanded && run.issues.length > 0 ? (
          <div className="space-y-2 border-t border-slate-800 px-5 py-3">
            {run.issues.map((issue) => (
              <div
                key={issue.id}
                className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3"
              >
                <span
                  className={`mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${priorityColors[issue.priority]}`}
                >
                  {issue.priority}
                </span>
                <div>
                  <p className="text-sm text-slate-200">{issue.title}</p>
                  {issue.description ? (
                    <p className="mt-0.5 text-xs text-slate-500">
                      {issue.description}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs capitalize text-slate-600">
                    {issue.category} · {issue.source}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
