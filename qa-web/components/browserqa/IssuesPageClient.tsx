"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

// ---------------------------------------------------------------------------
// Types — aligned with the full ImproveCard schema
// ---------------------------------------------------------------------------

type CardPriority = "P0" | "P1" | "P2";
type CardSource = "local" | "nextjs-api";
type EstimatedEffort = "XS" | "S" | "M" | "L";
type Confidence = "high" | "medium" | "low";

type ImproveCard = {
  id: string;
  source: CardSource;
  title: string;
  priority: CardPriority;
  category: string;
  standard_refs: Array<{ name: string; type: "internal" }>;
  impact: {
    user: string;
    business: string;
    risk: string;
  };
  scope: {
    surfaces: Array<{
      kind: "endpoint" | "route";
      path: string;
      method?: string;
    }>;
    files: Array<{ path: string; line_start: number; line_end: number }>;
  };
  problem: {
    summary: string;
    evidence: Array<{
      type: "code" | "browser";
      path: string;
      line_start: number;
      line_end: number;
      snippet: string;
    }>;
  };
  recommendation: {
    summary: string;
    implementation_steps: string[];
    acceptance_criteria: string[];
    estimated_effort: EstimatedEffort;
    confidence: Confidence;
  };
  education: {
    why_it_matters: string;
    rule_of_thumb: string;
  };
  telemetry?: {
    retrieval?: {
      rule_hits: Array<{ control_id: string; score: number }>;
      code_hits: Array<{
        path: string;
        line_start: number;
        line_end: number;
        score: number;
      }>;
    };
  };
  status: {
    state: "open";
    owner: "backend" | "frontend" | "fullstack";
    created_at: string;
    updated_at: string;
  };
};

type IssuesResponse = {
  report: {
    id: string;
    project: {
      name: string;
      framework: "nextjs";
    };
    generated_at: string;
    summary: {
      score: number;
      p0: number;
      p1: number;
      p2: number;
    };
  };
  cards: ImproveCard[];
  remote: {
    status: "queued" | "running" | "completed" | "failed" | "disabled";
    error: string | null;
  };
};

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

const PRIORITY_STYLES: Record<CardPriority, string> = {
  P0: "border-red-500/40 bg-red-500/10 text-red-300",
  P1: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  P2: "border-sky-500/40 bg-sky-500/10 text-sky-300",
};

const PRIORITY_BAR: Record<CardPriority, string> = {
  P0: "bg-red-500",
  P1: "bg-amber-500",
  P2: "bg-sky-500",
};

const EFFORT_STYLES: Record<EstimatedEffort, string> = {
  XS: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  S: "border-teal-500/40 bg-teal-500/10 text-teal-300",
  M: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  L: "border-red-500/40 bg-red-500/10 text-red-300",
};

const CONFIDENCE_STYLES: Record<Confidence, string> = {
  high: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  low: "border-red-500/40 bg-red-500/10 text-red-300",
};

const OWNER_STYLES: Record<"backend" | "frontend" | "fullstack", string> = {
  backend: "border-violet-500/40 bg-violet-500/10 text-violet-300",
  frontend: "border-pink-500/40 bg-pink-500/10 text-pink-300",
  fullstack: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Pill({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${className ?? "border-slate-700 bg-slate-800 text-slate-300"}`}
    >
      {label}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
      {children}
    </p>
  );
}

function CodeBlock({
  path,
  lineStart,
  lineEnd,
  snippet,
}: {
  path: string;
  lineStart: number;
  lineEnd: number;
  snippet: string;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-slate-700/60 bg-slate-950">
      <div className="flex items-center gap-2 border-b border-slate-700/60 bg-slate-900/60 px-3 py-1.5">
        <span className="font-mono text-xs text-slate-400">{path}</span>
        <span className="ml-auto text-[11px] text-slate-500">
          L{lineStart}–{lineEnd}
        </span>
      </div>
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed text-slate-300">
        {snippet}
      </pre>
    </div>
  );
}

function IssueCard({ card, index }: { card: ImproveCard; index: number }) {
  const [telemetryOpen, setTelemetryOpen] = useState(false);

  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/80 shadow-lg">
      {/* Priority accent bar */}
      <div
        className={`absolute left-0 top-0 h-full w-1 ${PRIORITY_BAR[card.priority]}`}
      />

      <div className="space-y-5 py-5 pl-4 pr-5">
        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Pill
              label={card.id}
              className="border-slate-600 bg-slate-800 font-mono text-slate-200"
            />
            <Pill
              label={card.priority}
              className={PRIORITY_STYLES[card.priority]}
            />
            <Pill
              label={card.source === "local" ? "local" : "nextjs-api"}
              className={
                card.source === "local"
                  ? "border-blue-500/40 bg-blue-500/10 text-blue-300"
                  : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              }
            />
            <Pill
              label={card.category}
              className="border-slate-700 bg-slate-800/70 text-slate-300"
            />
            {card.standard_refs?.map((ref, i) => (
              <Pill
                key={i}
                label={ref.name}
                className="border-indigo-500/40 bg-indigo-500/10 text-indigo-300"
              />
            ))}
          </div>
          <span className="select-none text-xs text-slate-600">
            #{index + 1}
          </span>
        </div>

        {/* ── Title + Problem summary ──────────────────────────────────── */}
        <div>
          <h3 className="text-base font-semibold leading-snug text-slate-50">
            {card.title}
          </h3>
          <p className="mt-1 text-sm text-slate-400">{card.problem.summary}</p>
        </div>

        {/* ── Impact ──────────────────────────────────────────────────── */}
        <div>
          <SectionLabel>Impact</SectionLabel>
          <div className="grid gap-3 md:grid-cols-3">
            {(
              [
                { label: "User", value: card.impact.user },
                { label: "Business", value: card.impact.business },
                { label: "Risk", value: card.impact.risk },
              ] as const
            ).map(({ label, value }) => (
              <div
                key={label}
                className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2"
              >
                <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                  {label}
                </p>
                <p className="mt-0.5 text-sm text-slate-200">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Scope ───────────────────────────────────────────────────── */}
        {(card.scope?.surfaces?.length > 0 ||
          card.scope?.files?.length > 0) && (
          <div>
            <SectionLabel>Scope</SectionLabel>
            <div className="space-y-2">
              {card.scope.surfaces?.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {card.scope.surfaces.map((surface, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-slate-800/60 px-2 py-1 font-mono text-xs text-slate-300"
                    >
                      {surface.method && (
                        <span className="font-bold text-teal-400">
                          {surface.method}
                        </span>
                      )}
                      {surface.path}
                      <span className="text-slate-600">({surface.kind})</span>
                    </span>
                  ))}
                </div>
              )}
              {card.scope.files?.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {card.scope.files.map((file, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center rounded border border-slate-700/60 bg-slate-900/60 px-2 py-1 font-mono text-[11px] text-slate-400"
                    >
                      {file.path}
                      <span className="ml-1.5 text-slate-600">
                        L{file.line_start}–{file.line_end}
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Evidence ────────────────────────────────────────────────── */}
        {card.problem.evidence.length > 0 && (
          <div>
            <SectionLabel>Evidence</SectionLabel>
            <div className="space-y-2">
              {card.problem.evidence.slice(0, 3).map((ev, i) => (
                <CodeBlock
                  key={`${card.id}-ev-${i}`}
                  path={ev.path}
                  lineStart={ev.line_start}
                  lineEnd={ev.line_end}
                  snippet={ev.snippet}
                />
              ))}
            </div>
          </div>
        )}

        <Separator className="border-slate-800" />

        {/* ── Recommendation ──────────────────────────────────────────── */}
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <SectionLabel>Recommendation</SectionLabel>
            <div className="mb-1.5 ml-auto flex gap-2">
              <Pill
                label={`Effort: ${card.recommendation.estimated_effort}`}
                className={EFFORT_STYLES[card.recommendation.estimated_effort]}
              />
              <Pill
                label={`Confidence: ${card.recommendation.confidence}`}
                className={CONFIDENCE_STYLES[card.recommendation.confidence]}
              />
            </div>
          </div>

          <p className="mb-3 text-sm text-slate-200">
            {card.recommendation.summary}
          </p>

          {card.recommendation.implementation_steps.length > 0 && (
            <div className="mb-3">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Implementation Steps
              </p>
              <ol className="list-none space-y-1.5">
                {card.recommendation.implementation_steps.map((step, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2.5 text-sm text-slate-300"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-slate-400">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {card.recommendation.acceptance_criteria.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Acceptance Criteria
              </p>
              <ul className="list-none space-y-1">
                {card.recommendation.acceptance_criteria.map((criterion, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-slate-300"
                  >
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />
                    {criterion}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <Separator className="border-slate-800" />

        {/* ── Education ───────────────────────────────────────────────── */}
        {(card.education?.why_it_matters || card.education?.rule_of_thumb) && (
          <div className="space-y-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-amber-500/80">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-3.5 w-3.5"
                aria-hidden="true"
              >
                <path d="M12 2a7 7 0 0 1 5.12 11.75A4.001 4.001 0 0 1 14 17.93V19a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-1.07a4.001 4.001 0 0 1-3.12-4.18A7 7 0 0 1 12 2zm1 18h-2v1h2v-1z" />
              </svg>
              Educational Context
            </p>
            {card.education.why_it_matters && (
              <div>
                <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-500/60">
                  Why It Matters
                </p>
                <p className="text-sm text-slate-300">
                  {card.education.why_it_matters}
                </p>
              </div>
            )}
            {card.education.rule_of_thumb && (
              <div className="flex items-start gap-2 rounded border border-amber-500/20 bg-amber-500/10 px-3 py-2">
                <span className="mt-0.5 select-none text-base leading-none">
                  📐
                </span>
                <p className="text-sm italic text-amber-200">
                  {card.education.rule_of_thumb}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Footer: Status + Telemetry toggle ───────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {card.status && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <Pill
                label={card.status.owner}
                className={OWNER_STYLES[card.status.owner]}
              />
              <Pill
                label="open"
                className="border-slate-700 bg-slate-800/60 text-slate-400"
              />
              <span>
                Created {new Date(card.status.created_at).toLocaleDateString()}
              </span>
            </div>
          )}
          {card.telemetry?.retrieval && (
            <button
              type="button"
              onClick={() => setTelemetryOpen((v) => !v)}
              className="text-[11px] text-slate-600 transition-colors hover:text-slate-400"
            >
              {telemetryOpen ? "▲ Hide telemetry" : "▼ Show telemetry"}
            </button>
          )}
        </div>

        {/* ── Telemetry (collapsible) ──────────────────────────────────── */}
        {telemetryOpen && card.telemetry?.retrieval && (
          <div className="space-y-3 rounded-lg border border-slate-700/50 bg-slate-950/60 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600">
              Retrieval Telemetry
            </p>
            {card.telemetry.retrieval.rule_hits.length > 0 && (
              <div>
                <p className="mb-1 text-[10px] text-slate-600">Rule Hits</p>
                <div className="space-y-1">
                  {card.telemetry.retrieval.rule_hits.map((hit, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 font-mono text-xs text-slate-500"
                    >
                      <span className="text-slate-400">{hit.control_id}</span>
                      <span className="ml-auto rounded border border-indigo-500/30 bg-indigo-500/10 px-1.5 py-0.5 text-indigo-300">
                        {(hit.score * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {card.telemetry.retrieval.code_hits.length > 0 && (
              <div>
                <p className="mb-1 text-[10px] text-slate-600">Code Hits</p>
                <div className="space-y-1">
                  {card.telemetry.retrieval.code_hits.map((hit, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 font-mono text-xs text-slate-500"
                    >
                      <span className="max-w-50 truncate text-slate-400">
                        {hit.path}
                      </span>
                      <span className="text-slate-600">
                        L{hit.line_start}–{hit.line_end}
                      </span>
                      <span className="ml-auto rounded border border-teal-500/30 bg-teal-500/10 px-1.5 py-0.5 text-teal-300">
                        {(hit.score * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function IssuesPageClient() {
  const searchParams = useSearchParams();
  const runId = searchParams.get("runId")?.trim() ?? "";

  const [data, setData] = useState<IssuesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!runId) {
      setLoading(false);
      return;
    }

    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const response = await fetch(
          `/api/issues?runId=${encodeURIComponent(runId)}`,
          {
            cache: "no-store",
          },
        );

        const payload = (await response.json()) as
          | IssuesResponse
          | { error?: string };
        if (!response.ok || !("report" in payload)) {
          throw new Error(
            (payload as { error?: string }).error ?? "Failed to load issues",
          );
        }

        if (!active) return;
        setData(payload);
        setError("");
        setLoading(false);

        if (["queued", "running"].includes(payload.remote.status)) {
          timer = setTimeout(() => {
            void tick();
          }, 4000);
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load issues");
        setLoading(false);
      }
    };

    void tick();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [runId]);

  const cards = useMemo(() => data?.cards ?? [], [data]);

  if (!runId) {
    return (
      <Card className="border-slate-800 bg-slate-900/70">
        <CardHeader>
          <CardTitle className="text-slate-100">Issues</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-300">
            Start from <span className="font-medium">/projects/new</span>, then
            confirm the project to open this issue result page.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-xl border border-slate-800 bg-slate-900/70"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-red-300">{error}</p>;
  }

  if (!data) {
    return <p className="text-sm text-red-300">Issue report not found.</p>;
  }

  const remoteStatusColor: Record<string, string> = {
    completed: "text-emerald-400",
    running: "text-amber-400",
    queued: "text-sky-400",
    failed: "text-red-400",
    disabled: "text-slate-500",
  };

  return (
    <div className="space-y-6">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Issue Report</h1>
          <p className="mt-1 text-sm text-slate-400">
            <span className="font-mono text-slate-300">{data.report.id}</span>
            {" · "}
            {data.report.project.name}{" "}
            <span className="text-slate-500">
              ({data.report.project.framework})
            </span>
          </p>
          <p className="text-xs text-slate-600">
            Generated: {new Date(data.report.generated_at).toLocaleString()}
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="bg-slate-800 text-slate-100 hover:bg-slate-700"
          onClick={() => window.location.reload()}
        >
          Refresh
        </Button>
      </section>

      {/* ── Summary stats ───────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="border-slate-800 bg-slate-900/70">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Score</p>
            <p className="text-2xl font-bold text-slate-100">
              {data.report.summary.score}
            </p>
          </CardContent>
        </Card>
        <Card className="border-red-500/20 bg-red-500/5">
          <CardContent className="p-4">
            <p className="text-xs text-red-400/70">P0 Critical</p>
            <p className="text-2xl font-bold text-red-300">
              {data.report.summary.p0}
            </p>
          </CardContent>
        </Card>
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="p-4">
            <p className="text-xs text-amber-400/70">P1 High</p>
            <p className="text-2xl font-bold text-amber-300">
              {data.report.summary.p1}
            </p>
          </CardContent>
        </Card>
        <Card className="border-sky-500/20 bg-sky-500/5">
          <CardContent className="p-4">
            <p className="text-xs text-sky-400/70">P2 Medium</p>
            <p className="text-2xl font-bold text-sky-300">
              {data.report.summary.p2}
            </p>
          </CardContent>
        </Card>
      </section>

      {/* ── Pipeline / remote status ─────────────────────────────────────── */}
      <Card className="border-slate-800 bg-slate-900/70">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-300">
              Local findings shown first. Browser-review findings appended
              after.
            </p>
            <span
              className={`text-xs font-medium ${remoteStatusColor[data.remote.status] ?? "text-slate-400"}`}
            >
              Remote: {data.remote.status}
              {data.remote.error ? ` · ${data.remote.error}` : ""}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ── Issue cards ─────────────────────────────────────────────────── */}
      {cards.length === 0 ? (
        <p className="text-sm text-slate-400">No issues found.</p>
      ) : (
        <section className="space-y-4">
          {cards.map((card, index) => (
            <IssueCard key={`${card.id}-${index}`} card={card} index={index} />
          ))}
        </section>
      )}
    </div>
  );
}
