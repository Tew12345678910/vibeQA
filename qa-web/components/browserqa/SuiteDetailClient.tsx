"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ExternalLink,
  FileText,
  Folder,
  History,
  Play,
  RefreshCw,
  Settings,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchAudit, fetchAudits, startAudit } from "@/lib/browserqa/api";
import { formatDateTime, toPassRate } from "@/lib/browserqa/format";
import { listItemDisplayStatus } from "@/lib/browserqa/status";
import {
  getSuiteById,
  parseVirtualSuiteId,
  updateSuiteTimestamp,
  type SuiteConfig,
} from "@/lib/browserqa/suite-store";
import { StatusBadge } from "@/components/browserqa/StatusBadge";
import { focusSchema, type AuditListItem, type AuditStatusResponse } from "@/lib/contracts";

type Props = {
  suiteId: string;
};

type TabType = "config" | "tests" | "runs" | "reports";

const defaultFocus = [...focusSchema.options];

function fallbackSuiteFromBaseUrl(baseUrl: string): SuiteConfig {
  const hostname = (() => {
    try {
      return new URL(baseUrl).hostname;
    } catch {
      return baseUrl;
    }
  })();

  return {
    id: `url_${encodeURIComponent(baseUrl)}`,
    name: hostname,
    projectPath: "—",
    baseUrl,
    routes: [],
    maxPages: 6,
    maxClicksPerPage: 6,
    focus: defaultFocus,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function SuiteDetailClient({ suiteId }: Props) {
  const router = useRouter();
  const [suite, setSuite] = useState<SuiteConfig | null>(null);
  const [audits, setAudits] = useState<AuditListItem[]>([]);
  const [latestDetail, setLatestDetail] = useState<AuditStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<TabType>("config");

  const load = useCallback(async () => {
    setRefreshing(true);
    setError("");

    try {
      const localSuite = getSuiteById(suiteId);
      const virtualBaseUrl = parseVirtualSuiteId(suiteId);
      const baseUrl = localSuite?.baseUrl ?? virtualBaseUrl;

      if (!baseUrl) {
        throw new Error("Suite not found");
      }

      const suiteConfig = localSuite ?? fallbackSuiteFromBaseUrl(baseUrl);
      setSuite(suiteConfig);

      const list = await fetchAudits({ baseUrl, limit: 50 });
      const sorted = [...list.items].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setAudits(sorted);

      if (sorted[0]) {
        const detail = await fetchAudit(sorted[0].auditId);
        setLatestDetail(detail);
      } else {
        setLatestDetail(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load suite");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [suiteId]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const passed = audits.filter(
      (audit) => audit.status === "completed" && audit.summary.failCount === 0,
    ).length;
    const failed = audits.filter(
      (audit) => audit.status === "failed" || audit.summary.failCount > 0,
    ).length;

    return {
      testCaseCount: latestDetail ? new Set(latestDetail.pageResults.map((result) => result.route)).size : 0,
      runCount: audits.length,
      passRate: toPassRate(passed, failed),
      lastRunStatus: audits[0] ? listItemDisplayStatus(audits[0]) : undefined,
    };
  }, [audits, latestDetail]);

  const discoveredTests = useMemo(() => {
    if (!latestDetail) return [];
    return [...new Set(latestDetail.pageResults.map((row) => row.route))].sort();
  }, [latestDetail]);

  const runSuite = async () => {
    if (!suite || running) return;

    setRunning(true);
    setError("");

    try {
      const started = await startAudit({
        baseUrl: suite.baseUrl,
        routes: suite.routes,
        maxPages: suite.maxPages,
        maxClicksPerPage: suite.maxClicksPerPage,
        focus: suite.focus,
      });

      if (!suite.id.startsWith("url_")) {
        updateSuiteTimestamp(suite.id);
      }

      router.push(`/runs/${started.auditId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run suite");
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-400">Loading suite...</p>;
  }

  if (!suite) {
    return <p className="text-sm text-red-300">Suite not found.</p>;
  }

  const tabs = [
    { key: "config", label: "Configuration", icon: Settings },
    { key: "tests", label: "Test Cases", icon: FileText },
    { key: "runs", label: "Runs", icon: History },
    { key: "reports", label: "Reports", icon: AlertCircle },
  ] as const;

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push("/suites")} className="text-slate-400 hover:bg-slate-800 hover:text-slate-100">
          <ArrowLeft className="h-5 w-5" />
        </Button>

        <div className="flex-1">
          <h1 className="text-3xl font-bold text-slate-100">{suite.name}</h1>
          <p className="mt-1 flex items-center gap-2 text-slate-400">
            <ExternalLink className="h-4 w-4" />
            {suite.baseUrl}
          </p>
        </div>

        <Button
          variant="secondary"
          onClick={() => void load()}
          disabled={refreshing}
          className="bg-slate-800 text-slate-100 hover:bg-slate-700"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>

        <Button
          onClick={() => void runSuite()}
          disabled={running}
          className="bg-emerald-500 text-slate-950 hover:bg-emerald-400"
        >
          <Play className="mr-2 h-4 w-4" />
          {running ? "Running..." : "Run Suite"}
        </Button>
      </section>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      <section className="grid grid-cols-1 gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-4 sm:grid-cols-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Tests</p>
          <p className="mt-1 text-xl font-semibold text-slate-100">{stats.testCaseCount}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Runs</p>
          <p className="mt-1 text-xl font-semibold text-slate-100">{stats.runCount}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Pass Rate</p>
          <p
            className={`mt-1 text-xl font-semibold ${
              stats.passRate >= 80
                ? "text-emerald-300"
                : stats.passRate >= 50
                  ? "text-amber-300"
                  : "text-red-300"
            }`}
          >
            {stats.passRate}%
          </p>
        </div>
        <div className="sm:text-right">
          <p className="text-xs uppercase tracking-wide text-slate-500">Last Status</p>
          <div className="mt-1 sm:inline-flex">
            {stats.lastRunStatus ? <StatusBadge status={stats.lastRunStatus} /> : <span className="text-sm text-slate-500">No runs yet</span>}
          </div>
        </div>
      </section>

      <section className="flex flex-wrap gap-1 border-b border-slate-800">
        {tabs.map((tab) => (
          <Button
            key={tab.key}
            variant="ghost"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-none border-b-2 px-4 py-3 ${
              activeTab === tab.key
                ? "border-blue-400 text-blue-300 hover:bg-transparent"
                : "border-transparent text-slate-400 hover:bg-transparent hover:text-slate-100"
            }`}
          >
            <tab.icon className="mr-2 h-4 w-4" />
            {tab.label}
          </Button>
        ))}
      </section>

      {activeTab === "config" ? (
        <Card className="border-slate-800 bg-slate-900/70">
          <CardHeader>
            <CardTitle className="text-slate-100">Suite Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="mb-2 text-sm text-slate-400">Project Path</p>
                <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-800/30 p-3 text-slate-100">
                  <Folder className="h-4 w-4 text-slate-500" />
                  <span>{suite.projectPath || "—"}</span>
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm text-slate-400">Base URL</p>
                <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-800/30 p-3 text-slate-100">
                  <ExternalLink className="h-4 w-4 text-slate-500" />
                  <span>{suite.baseUrl}</span>
                </div>
              </div>
            </div>

            {suite.guidelinePath ? (
              <div>
                <p className="mb-2 text-sm text-slate-400">Guideline Path</p>
                <div className="rounded-lg border border-slate-800 bg-slate-800/30 p-3 text-slate-100">
                  {suite.guidelinePath}
                </div>
              </div>
            ) : null}

            <div>
              <p className="mb-2 text-sm text-slate-400">Audit Settings</p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-slate-800 bg-slate-800/30 p-3">
                  <p className="text-xs text-slate-500">Max Pages</p>
                  <p className="text-slate-100">{suite.maxPages}</p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-800/30 p-3">
                  <p className="text-xs text-slate-500">Max Clicks Per Page</p>
                  <p className="text-slate-100">{suite.maxClicksPerPage}</p>
                </div>
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm text-slate-400">Focus Areas</p>
              <div className="flex flex-wrap gap-2">
                {suite.focus.map((entry) => (
                  <span
                    key={entry}
                    className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs capitalize text-slate-300"
                  >
                    {entry}
                  </span>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "tests" ? (
        <Card className="border-slate-800 bg-slate-900/70">
          <CardHeader>
            <CardTitle className="text-slate-100">Test Cases ({discoveredTests.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {discoveredTests.length === 0 ? (
              <p className="text-sm text-slate-500">No discovered test cases yet. Run this suite once to populate routes.</p>
            ) : (
              <div className="space-y-2">
                {discoveredTests.map((route) => (
                  <div key={route} className="rounded-lg border border-slate-800 bg-slate-800/30 px-3 py-2">
                    <p className="font-medium text-slate-100">Route {route}</p>
                    <p className="text-xs text-slate-500">Derived from latest run page results.</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "runs" ? (
        <Card className="border-slate-800 bg-slate-900/70">
          <CardHeader>
            <CardTitle className="text-slate-100">Runs ({audits.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {audits.length === 0 ? (
              <p className="text-sm text-slate-500">No runs yet for this suite.</p>
            ) : (
              <div className="space-y-2">
                {audits.map((audit) => (
                  <Link
                    key={audit.auditId}
                    href={`/runs/${audit.auditId}`}
                    className="flex items-center justify-between rounded-lg border border-slate-800 px-3 py-2.5 hover:border-slate-700 hover:bg-slate-800/30"
                  >
                    <div>
                      <p className="font-mono text-xs text-blue-300">{audit.auditId.slice(0, 8)}</p>
                      <p className="text-xs text-slate-500">{formatDateTime(audit.createdAt)}</p>
                    </div>
                    <StatusBadge status={listItemDisplayStatus(audit)} size="sm" />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "reports" ? (
        <Card className="border-slate-800 bg-slate-900/70">
          <CardHeader>
            <CardTitle className="text-slate-100">Reports</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {audits[0] ? (
              <>
                <p className="text-sm text-slate-400">
                  Latest run: <span className="font-mono text-slate-200">{audits[0].auditId}</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="secondary" className="bg-slate-800 text-slate-100 hover:bg-slate-700">
                    <a href={`/api/audits/${audits[0].auditId}/export?format=json`} target="_blank" rel="noreferrer">
                      Download JSON
                    </a>
                  </Button>
                  <Button asChild variant="secondary" className="bg-slate-800 text-slate-100 hover:bg-slate-700">
                    <a href={`/api/audits/${audits[0].auditId}/export?format=md`} target="_blank" rel="noreferrer">
                      Download Markdown
                    </a>
                  </Button>
                </div>
                <p className="text-sm text-slate-500">
                  {latestDetail ? `Issues in latest run: ${latestDetail.issues.length}` : "Open a run to inspect issues."}
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-500">Run the suite first to export a report.</p>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
