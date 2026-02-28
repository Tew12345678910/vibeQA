"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  FolderKanban,
  Play,
  Plus,
  XCircle,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchAudits } from "@/lib/browserqa/api";
import { formatRelative, toPassRate } from "@/lib/browserqa/format";
import { buildSuitesFromAudits } from "@/lib/browserqa/suite-utils";
import { listItemDisplayStatus } from "@/lib/browserqa/status";
import { StatusBadge } from "@/components/browserqa/StatusBadge";
import { StatsCard } from "@/components/browserqa/StatsCard";
import type { AuditListItem } from "@/lib/contracts";

export function DashboardClient() {
  const [audits, setAudits] = useState<AuditListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const run = async () => {
      try {
        const response = await fetchAudits({ limit: 50 });
        if (!active) return;
        setAudits(response.items);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      } finally {
        if (!active) return;
        setLoading(false);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, []);

  const suites = useMemo(() => buildSuitesFromAudits(audits), [audits]);

  const stats = useMemo(() => {
    const passed = audits.filter(
      (audit) => audit.status === "completed" && audit.summary.failCount === 0,
    ).length;
    const failed = audits.filter(
      (audit) => audit.status === "failed" || audit.summary.failCount > 0,
    ).length;
    const totalTestCases = audits.reduce(
      (sum, audit) => sum + audit.summary.pagesAudited,
      0,
    );

    return {
      totalSuites: suites.length,
      totalRuns: audits.length,
      totalTestCases,
      passRate: toPassRate(passed, failed),
      recentRuns: audits.slice(0, 5),
      recentSuites: suites.slice(0, 5),
    };
  }, [audits, suites]);

  if (loading) {
    return <p className="text-sm text-slate-400">Loading dashboard...</p>;
  }

  if (error) {
    return <p className="text-sm text-red-300">{error}</p>;
  }

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-bold text-slate-100">Dashboard</h1>
        <p className="mt-2 text-slate-400">
          Monitor your QA testing progress and results
        </p>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatsCard title="Total Suites" value={stats.totalSuites} icon={FolderKanban} tone="blue" />
        <StatsCard title="Total Runs" value={stats.totalRuns} icon={Play} tone="slate" />
        <StatsCard title="Test Cases" value={stats.totalTestCases} icon={CheckCircle2} tone="green" />
        <StatsCard
          title="Pass Rate"
          value={`${stats.passRate}%`}
          icon={XCircle}
          tone={stats.passRate >= 80 ? "green" : stats.passRate >= 50 ? "yellow" : "red"}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Link
          href="/suites/new"
          className="rounded-xl border border-slate-800 bg-slate-900/70 p-6 transition-colors hover:border-blue-500/50"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-100">Create New Suite</h3>
              <p className="mt-1 text-sm text-slate-400">Set up a new test suite for your project</p>
            </div>
            <div className="rounded-xl border border-blue-500/30 bg-blue-500/15 p-3 text-blue-300">
              <Plus className="h-5 w-5" />
            </div>
          </div>
        </Link>

        <Link
          href="/suites"
          className="rounded-xl border border-slate-800 bg-slate-900/70 p-6 transition-colors hover:border-emerald-500/50"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-100">Run All Suites</h3>
              <p className="mt-1 text-sm text-slate-400">Review suites and trigger new audit runs</p>
            </div>
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/15 p-3 text-emerald-300">
              <Play className="h-5 w-5" />
            </div>
          </div>
        </Link>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="border-slate-800 bg-slate-900/70">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg text-slate-100">Recent Runs</CardTitle>
            <Link href="/runs" className="inline-flex items-center gap-1 text-sm text-blue-300 hover:text-blue-200">
              View all <ArrowRight className="h-4 w-4" />
            </Link>
          </CardHeader>
          <CardContent>
            {stats.recentRuns.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">No runs yet</p>
            ) : (
              <div className="space-y-2">
                {stats.recentRuns.map((run) => {
                  const suite = suites.find((entry) => entry.baseUrl === run.baseUrl);
                  return (
                    <Link
                      key={run.auditId}
                      href={`/runs/${run.auditId}`}
                      className="flex items-center justify-between rounded-lg border border-slate-800/70 px-3 py-2.5 hover:border-slate-700 hover:bg-slate-800/30"
                    >
                      <div>
                        <p className="font-medium text-slate-100">{suite?.name ?? run.baseUrl}</p>
                        <p className="text-xs text-slate-500">{formatRelative(run.createdAt)}</p>
                      </div>
                      <StatusBadge status={listItemDisplayStatus(run)} size="sm" />
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/70">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg text-slate-100">Suites</CardTitle>
            <Link href="/suites" className="inline-flex items-center gap-1 text-sm text-blue-300 hover:text-blue-200">
              View all <ArrowRight className="h-4 w-4" />
            </Link>
          </CardHeader>
          <CardContent>
            {stats.recentSuites.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">No suites yet. Create your first suite.</p>
            ) : (
              <div className="space-y-2">
                {stats.recentSuites.map((suite) => (
                  <Link
                    key={suite.id}
                    href={`/suites/${suite.id}`}
                    className="flex items-center justify-between rounded-lg border border-slate-800/70 px-3 py-2.5 hover:border-slate-700 hover:bg-slate-800/30"
                  >
                    <div>
                      <p className="font-medium text-slate-100">{suite.name}</p>
                      <p className="text-xs text-slate-500">{suite.baseUrl}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-500" />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
