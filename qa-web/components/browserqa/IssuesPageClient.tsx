"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type ImproveCard = {
  id: string;
  source: "local" | "nextjs-api";
  title: string;
  priority: "P0" | "P1" | "P2";
  category: string;
  impact: {
    user: string;
    business: string;
    risk: string;
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
    estimated_effort: "S" | "M" | "L";
    confidence: "high" | "medium" | "low";
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
        const response = await fetch(`/api/issues?runId=${encodeURIComponent(runId)}`, {
          cache: "no-store",
        });

        const payload = (await response.json()) as IssuesResponse | { error?: string };
        if (!response.ok || !("report" in payload)) {
          throw new Error((payload as { error?: string }).error ?? "Failed to load issues");
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
            Start from <span className="font-medium">/projects/new</span>, then confirm the project to open this issue result page.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return <p className="text-sm text-slate-300">Loading issues...</p>;
  }

  if (error) {
    return <p className="text-sm text-red-300">{error}</p>;
  }

  if (!data) {
    return <p className="text-sm text-red-300">Issue report not found.</p>;
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Issue Result</h1>
          <p className="mt-1 text-sm text-slate-400">
            {data.report.id} • {data.report.project.name} ({data.report.project.framework})
          </p>
          <p className="text-xs text-slate-500">Generated: {new Date(data.report.generated_at).toLocaleString()}</p>
        </div>
        <Button
          type="button"
          variant="secondary"
          className="bg-slate-800 text-slate-100 hover:bg-slate-700"
          onClick={() => window.location.reload()}
        >
          Refresh
        </Button>
      </section>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="border-slate-800 bg-slate-900/70"><CardContent className="p-4"><p className="text-xs text-slate-400">Score</p><p className="text-xl font-semibold text-slate-100">{data.report.summary.score}</p></CardContent></Card>
        <Card className="border-slate-800 bg-slate-900/70"><CardContent className="p-4"><p className="text-xs text-slate-400">P0</p><p className="text-xl font-semibold text-red-300">{data.report.summary.p0}</p></CardContent></Card>
        <Card className="border-slate-800 bg-slate-900/70"><CardContent className="p-4"><p className="text-xs text-slate-400">P1</p><p className="text-xl font-semibold text-amber-300">{data.report.summary.p1}</p></CardContent></Card>
        <Card className="border-slate-800 bg-slate-900/70"><CardContent className="p-4"><p className="text-xs text-slate-400">P2</p><p className="text-xl font-semibold text-sky-300">{data.report.summary.p2}</p></CardContent></Card>
      </section>

      <Card className="border-slate-800 bg-slate-900/70">
        <CardHeader>
          <CardTitle className="text-slate-100">Pipeline Status</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-300">
            Local findings are shown first. Next.js API/browser review findings are appended after local findings.
          </p>
          <p className="mt-1 text-xs text-slate-500">Remote status: {data.remote.status}{data.remote.error ? ` • ${data.remote.error}` : ""}</p>
        </CardContent>
      </Card>

      <section className="space-y-3">
        {cards.map((card, index) => (
          <Card key={`${card.id}-${index}`} className="border-slate-800 bg-slate-900/70">
            <CardContent className="space-y-3 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs text-slate-300">{card.id}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${card.source === "local" ? "bg-blue-500/20 text-blue-300" : "bg-emerald-500/20 text-emerald-300"}`}>
                    {card.source === "local" ? "local" : "nextjs-api"}
                  </span>
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">{card.priority}</span>
                </div>
                <span className="text-xs text-slate-500">#{index + 1}</span>
              </div>

              <div>
                <h3 className="text-base font-semibold text-slate-100">{card.title}</h3>
                <p className="text-sm text-slate-400">{card.problem.summary}</p>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <p className="text-xs text-slate-500">User Impact</p>
                  <p className="text-sm text-slate-200">{card.impact.user}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Business Impact</p>
                  <p className="text-sm text-slate-200">{card.impact.business}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Risk</p>
                  <p className="text-sm text-slate-200">{card.impact.risk}</p>
                </div>
              </div>

              {card.problem.evidence.length ? (
                <div>
                  <p className="text-xs text-slate-500">Evidence</p>
                  <div className="mt-1 grid gap-2">
                    {card.problem.evidence.slice(0, 2).map((evidence, i) => (
                      <div key={`${card.id}-e-${i}`} className="rounded border border-slate-800 bg-slate-950/70 p-2">
                        <p className="text-xs text-slate-500">{evidence.path}:{evidence.line_start}-{evidence.line_end}</p>
                        <pre className="overflow-x-auto text-xs text-slate-300">{evidence.snippet}</pre>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
