"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Clock, Filter, Shield, Search } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchAudit, fetchAudits } from "@/lib/browserqa/api";
import { formatDate } from "@/lib/browserqa/format";
import { buildSuitesFromAudits } from "@/lib/browserqa/suite-utils";
import type { Issue } from "@/lib/contracts";

type IssueRow = {
  id: string;
  auditId: string;
  issue: Issue;
  baseUrl: string;
  suiteName: string;
  runDate: string;
};

const levelFilters = ["all", "alarming", "error", "security"] as const;

export function IssuesPageClient() {
  const [issues, setIssues] = useState<IssueRow[]>([]);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<(typeof levelFilters)[number]>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const list = await fetchAudits({ limit: 30 });
        if (!active) return;

        const details = await Promise.all(
          list.items.map(async (item) => {
            try {
              const detail = await fetchAudit(item.auditId);
              return { item, issues: detail.issues };
            } catch {
              return { item, issues: [] as Issue[] };
            }
          }),
        );

        if (!active) return;

        const suites = buildSuitesFromAudits(list.items);
        const flattened: IssueRow[] = [];

        details.forEach(({ item, issues: auditIssues }) => {
          const suite = suites.find((entry) => entry.baseUrl === item.baseUrl);

          auditIssues.forEach((issue, index) => {
            flattened.push({
              id: `${item.auditId}-${index}`,
              auditId: item.auditId,
              issue,
              baseUrl: item.baseUrl,
              suiteName: suite?.name ?? item.baseUrl,
              runDate: item.createdAt,
            });
          });
        });

        setIssues(flattened);

        // #region agent log
        if (typeof window !== "undefined") {
          fetch("http://127.0.0.1:7243/ingest/ec867638-7ea4-46f0-a075-9f86eb0391a7", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: `log_${Date.now()}_issues_loaded`,
              timestamp: Date.now(),
              location: "components/browserqa/IssuesPageClient.tsx:useEffect",
              message: "IssuesPageClient loaded issues",
              data: { issueCount: flattened.length },
              runId: "initial",
              hypothesisId: "H2",
            }),
          }).catch(() => {});
        }
        // #endregion
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load issues");
      } finally {
        if (!active) return;
        setLoading(false);
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return issues.filter((entry) => {
      const { issue } = entry;

      const levelMatch =
        levelFilter === "all"
          ? true
          : levelFilter === "alarming"
            ? issue.severity === "high"
            : levelFilter === "error"
              ? issue.severity !== "high" && issue.category !== "security"
              : issue.category === "security";
      const searchMatch =
        !keyword ||
        entry.issue.title.toLowerCase().includes(keyword) ||
        entry.issue.symptom.toLowerCase().includes(keyword) ||
        entry.suiteName.toLowerCase().includes(keyword);

      return levelMatch && searchMatch;
    });
  }, [issues, search, levelFilter]);

  const counts = useMemo(() => {
    const alarming = issues.filter(
      (entry) => entry.issue.severity === "high",
    ).length;
    const security = issues.filter(
      (entry) => entry.issue.category === "security",
    ).length;
    const error = issues.length - alarming - security;

    return {
      all: issues.length,
      alarming,
      error,
      security,
    };
  }, [issues]);

  if (loading) {
    return <p className="text-sm text-slate-400">Loading issues...</p>;
  }

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-3xl font-bold text-slate-100">Issues & Security</h1>
        <p className="mt-2 text-slate-400">
          View and track all detected issues across your test runs, grouped by impact and security level.
        </p>
      </section>

      <section className="flex flex-col gap-3 md:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search issues..."
            className="border-slate-700 bg-slate-900/70 pl-10 text-slate-100"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400" />
          <select
            value={levelFilter}
            onChange={(event) =>
              setLevelFilter(event.target.value as (typeof levelFilters)[number])
            }
            className="h-10 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 outline-none"
          >
            <option value="all">All ({counts.all})</option>
            <option value="alarming">Alarming ({counts.alarming})</option>
            <option value="error">Errors ({counts.error})</option>
            <option value="security">Security ({counts.security})</option>
          </select>
        </div>
      </section>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      {filtered.length === 0 ? (
        <Card className="border-slate-800 bg-slate-900/70">
          <CardContent className="p-12 text-center">
            <AlertTriangle className="mx-auto h-10 w-10 text-slate-600" />
            <h3 className="mt-4 text-xl font-semibold text-slate-100">No issues found</h3>
            <p className="mt-1 text-slate-400">
              {search || levelFilter !== "all"
                ? "Try adjusting your filters."
                : "No issues have been detected in recent runs."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <section className="space-y-3">
          {filtered.map((entry) => (
            <Card key={entry.id} className="border-slate-800 bg-slate-900/70">
              <CardContent className="space-y-4 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium uppercase ${
                        entry.issue.severity === "high"
                          ? "border-red-500/40 bg-red-500/15 text-red-300"
                          : entry.issue.severity === "medium"
                            ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
                            : "border-blue-500/40 bg-blue-500/15 text-blue-300"
                      }`}
                    >
                      <AlertTriangle className="h-3 w-3" />
                      {entry.issue.severity}
                    </span>
                    <span className="text-sm text-slate-500">{entry.suiteName}</span>
                  </div>

                  <Link
                    href={`/runs/${entry.auditId}`}
                    className="inline-flex items-center gap-1 text-sm text-blue-300 hover:text-blue-200"
                  >
                    View Run <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-slate-100">{entry.issue.title}</h3>
                  <p className="mt-1 text-sm text-slate-400">{entry.issue.symptom}</p>
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  <div>
                    <p className="text-xs text-slate-500">Expected</p>
                    <p className="text-sm text-slate-200">{entry.issue.expected}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Actual</p>
                    <p className="text-sm text-red-300">{entry.issue.actual}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Run Date</p>
                    <p className="inline-flex items-center gap-1 text-sm text-slate-300">
                      <Clock className="h-3 w-3" />
                      {formatDate(entry.runDate)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Fix Approach</p>
                    <p className="text-sm text-emerald-300">{entry.issue.recommendedFixApproach}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      )}
    </div>
  );
}
