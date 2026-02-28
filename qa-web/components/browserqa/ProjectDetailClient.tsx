"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  Filter,
  Folder,
  History,
  Play,
  RefreshCw,
  Search,
  Settings,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchAudit, fetchAudits, startAudit } from "@/lib/browserqa/api";
import { formatDateTime, toPassRate } from "@/lib/browserqa/format";
import {
  listItemDisplayStatus,
  type DisplayRunStatus,
} from "@/lib/browserqa/status";
import {
  getProjectById,
  parseVirtualProjectId,
  updateProjectTimestamp,
  type ProjectConfig,
} from "@/lib/browserqa/project-store";
import { StatusBadge } from "@/components/browserqa/StatusBadge";
import { DetailLoadingState } from "@/components/browserqa/LoadingStates";
import {
  focusSchema,
  type AuditListItem,
  type AuditStatusResponse,
  type Issue,
} from "@/lib/contracts";

type Props = {
  projectId: string;
};

type TabType = "config" | "tests" | "runs" | "issues" | "reports";

type IssueRow = {
  id: string;
  auditId: string;
  issue: Issue;
  runDate: string;
};

type RunWithIssues = {
  audit: AuditListItem;
  issues: IssueRow[];
};

const statusOptions: Array<DisplayRunStatus | "all"> = [
  "all",
  "passed",
  "failed",
  "running",
  "pending",
  "canceled",
];

const severityFilters = ["all", "high", "medium", "low"] as const;

const defaultFocus = [...focusSchema.options];

function fallbackProjectFromBaseUrl(baseUrl: string): ProjectConfig {
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
    sourceType: "local" as const,
    projectPath: "",
    baseUrl,
    routes: [],
    maxPages: 6,
    maxClicksPerPage: 6,
    focus: defaultFocus,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function ProjectDetailClient({ projectId }: Props) {
  const router = useRouter();
  const [project, setProject] = useState<ProjectConfig | null>(null);
  const [audits, setAudits] = useState<AuditListItem[]>([]);
  const [latestDetail, setLatestDetail] = useState<AuditStatusResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<TabType>("runs");

  // runs tab filter state
  const [runsSearch, setRunsSearch] = useState("");
  const [runsStatusFilter, setRunsStatusFilter] = useState<
    DisplayRunStatus | "all"
  >("all");

  // issues tab state
  const [issueGroups, setIssueGroups] = useState<RunWithIssues[]>([]);
  const [issuesLoaded, setIssuesLoaded] = useState(false);
  const [issuesLoading, setIssuesLoading] = useState(false);
  const [issuesError, setIssuesError] = useState("");
  const [issuesSearch, setIssuesSearch] = useState("");
  const [issuesSeverityFilter, setIssuesSeverityFilter] =
    useState<(typeof severityFilters)[number]>("all");
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setRefreshing(true);
    setError("");

    try {
      const localProject = getProjectById(projectId);
      const virtualBaseUrl = parseVirtualProjectId(projectId);
      const baseUrl = localProject?.baseUrl ?? virtualBaseUrl;

      if (!baseUrl) {
        throw new Error("Project not found");
      }

      const projectConfig = localProject ?? fallbackProjectFromBaseUrl(baseUrl);
      setProject(projectConfig);

      const list = await fetchAudits({ baseUrl, limit: 50 });
      const sorted = [...list.items].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setAudits(sorted);

      if (sorted[0]) {
        const detail = await fetchAudit(sorted[0].auditId);
        setLatestDetail(detail);
      } else {
        setLatestDetail(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load project");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadIssues = useCallback(async () => {
    if (!project || issuesLoaded) return;
    setIssuesLoading(true);
    setIssuesError("");
    try {
      const details = await Promise.all(
        audits.map(async (item) => {
          try {
            const detail = await fetchAudit(item.auditId);
            return { item, auditIssues: detail.issues };
          } catch {
            return { item, auditIssues: [] as Issue[] };
          }
        }),
      );
      const groups: RunWithIssues[] = details.map(({ item, auditIssues }) => ({
        audit: item,
        issues: auditIssues.map((issue, index) => ({
          id: `${item.auditId}-${index}`,
          auditId: item.auditId,
          issue,
          runDate: item.createdAt,
        })),
      }));
      setIssueGroups(groups);
      // expand all runs that have issues by default
      setExpandedRuns(
        new Set(
          groups.filter((g) => g.issues.length > 0).map((g) => g.audit.auditId),
        ),
      );
      setIssuesLoaded(true);
    } catch (err) {
      setIssuesError(
        err instanceof Error ? err.message : "Failed to load issues",
      );
    } finally {
      setIssuesLoading(false);
    }
  }, [project, audits, issuesLoaded]);

  const toggleRunExpand = (auditId: string) => {
    setExpandedRuns((prev) => {
      const next = new Set(prev);
      if (next.has(auditId)) {
        next.delete(auditId);
      } else {
        next.add(auditId);
      }
      return next;
    });
  };

  useEffect(() => {
    if (activeTab === "issues" && !issuesLoaded && !issuesLoading) {
      void loadIssues();
    }
  }, [activeTab, issuesLoaded, issuesLoading, loadIssues]);

  const stats = useMemo(() => {
    const passed = audits.filter(
      (audit) => audit.status === "completed" && audit.summary.failCount === 0,
    ).length;
    const failed = audits.filter(
      (audit) => audit.status === "failed" || audit.summary.failCount > 0,
    ).length;

    return {
      testCaseCount: latestDetail
        ? new Set(latestDetail.pageResults.map((result) => result.route)).size
        : 0,
      runCount: audits.length,
      passRate: toPassRate(passed, failed),
      lastRunStatus: audits[0] ? listItemDisplayStatus(audits[0]) : undefined,
    };
  }, [audits, latestDetail]);

  const discoveredTests = useMemo(() => {
    if (!latestDetail) return [];
    return [
      ...new Set(latestDetail.pageResults.map((row) => row.route)),
    ].sort();
  }, [latestDetail]);

  const filteredRuns = useMemo(() => {
    const query = runsSearch.trim().toLowerCase();
    return audits.filter((run) => {
      const runStatus = listItemDisplayStatus(run);
      const matchesStatus =
        runsStatusFilter === "all" || runStatus === runsStatusFilter;
      const matchesSearch = !query || run.auditId.toLowerCase().includes(query);
      return matchesStatus && matchesSearch;
    });
  }, [audits, runsSearch, runsStatusFilter]);

  const statusCounts = useMemo(() => {
    const counts: Record<(typeof statusOptions)[number], number> = {
      all: audits.length,
      passed: 0,
      failed: 0,
      running: 0,
      pending: 0,
      canceled: 0,
    };
    for (const run of audits) {
      counts[listItemDisplayStatus(run)] += 1;
    }
    return counts;
  }, [audits]);

  const filteredGroups = useMemo(() => {
    const keyword = issuesSearch.trim().toLowerCase();
    return issueGroups
      .map((group) => ({
        ...group,
        issues: group.issues.filter((entry) => {
          const severityMatch =
            issuesSeverityFilter === "all" ||
            entry.issue.severity === issuesSeverityFilter;
          const searchMatch =
            !keyword ||
            entry.issue.title.toLowerCase().includes(keyword) ||
            entry.issue.symptom.toLowerCase().includes(keyword);
          return severityMatch && searchMatch;
        }),
      }))
      .filter((group) => group.issues.length > 0);
  }, [issueGroups, issuesSearch, issuesSeverityFilter]);

  const totalIssueCount = useMemo(
    () => issueGroups.reduce((acc, g) => acc + g.issues.length, 0),
    [issueGroups],
  );

  const issueCounts = useMemo(() => {
    const allIssues = issueGroups.flatMap((g) => g.issues);
    return {
      all: allIssues.length,
      high: allIssues.filter((e) => e.issue.severity === "high").length,
      medium: allIssues.filter((e) => e.issue.severity === "medium").length,
      low: allIssues.filter((e) => e.issue.severity === "low").length,
    };
  }, [issueGroups]);

  const runProject = async () => {
    if (!project || running) return;

    setRunning(true);
    setError("");

    try {
      const started = await startAudit({
        baseUrl: project.baseUrl,
        routes: project.routes,
        maxPages: project.maxPages,
        maxClicksPerPage: project.maxClicksPerPage,
        focus: project.focus,
      });

      if (!project.id.startsWith("url_")) {
        updateProjectTimestamp(project.id);
      }

      router.push(`/runs/${started.auditId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run project");
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return <DetailLoadingState label="Loading project..." />;
  }

  if (!project) {
    return <p className="text-sm text-red-300">Project not found.</p>;
  }

  const tabs = [
    { key: "config", label: "Configuration", icon: Settings },
    { key: "tests", label: "Test Cases", icon: FileText },
    { key: "runs", label: `Runs (${audits.length})`, icon: History },
    {
      key: "issues",
      label: `Issues (${totalIssueCount})`,
      icon: AlertTriangle,
    },
    { key: "reports", label: "Reports", icon: AlertCircle },
  ] as const;

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/projects")}
          className="text-slate-400 hover:bg-slate-800 hover:text-slate-100"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>

        <div className="flex-1">
          <h1 className="text-3xl font-bold text-slate-100">{project.name}</h1>
          <p className="mt-1 flex items-center gap-2 text-slate-400">
            <ExternalLink className="h-4 w-4" />
            {project.baseUrl}
          </p>
        </div>

        <Button
          variant="secondary"
          onClick={() => void load()}
          disabled={refreshing}
          className="bg-slate-800 text-slate-100 hover:bg-slate-700"
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>

        <Button
          onClick={() => void runProject()}
          disabled={running}
          className="bg-emerald-500 text-slate-950 hover:bg-emerald-400"
        >
          <Play className="mr-2 h-4 w-4" />
          {running ? "Running..." : "Run Project"}
        </Button>
      </section>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      <section className="grid grid-cols-1 gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-4 sm:grid-cols-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Tests
          </p>
          <p className="mt-1 text-xl font-semibold text-slate-100">
            {stats.testCaseCount}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Runs</p>
          <p className="mt-1 text-xl font-semibold text-slate-100">
            {stats.runCount}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Pass Rate
          </p>
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
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Last Status
          </p>
          <div className="mt-1 sm:inline-flex">
            {stats.lastRunStatus ? (
              <StatusBadge status={stats.lastRunStatus} />
            ) : (
              <span className="text-sm text-slate-500">No runs yet</span>
            )}
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
            <CardTitle className="text-slate-100">
              Project Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="mb-2 text-sm text-slate-400">Project Source</p>
                <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-800/30 p-3 text-slate-100">
                  {project.sourceType === "github" ? (
                    <>
                      <ExternalLink className="h-4 w-4 shrink-0 text-slate-500" />
                      <a
                        href={project.githubRepo}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-blue-400 hover:underline"
                      >
                        {project.githubRepo || "—"}
                      </a>
                    </>
                  ) : (
                    <>
                      <Folder className="h-4 w-4 shrink-0 text-slate-500" />
                      <span className="truncate">
                        {project.projectPath || "—"}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm text-slate-400">Base URL</p>
                <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-800/30 p-3 text-slate-100">
                  <ExternalLink className="h-4 w-4 text-slate-500" />
                  <span>{project.baseUrl}</span>
                </div>
              </div>
            </div>

            {project.guidelinePath ? (
              <div>
                <p className="mb-2 text-sm text-slate-400">Guideline Path</p>
                <div className="rounded-lg border border-slate-800 bg-slate-800/30 p-3 text-slate-100">
                  {project.guidelinePath}
                </div>
              </div>
            ) : null}

            <div>
              <p className="mb-2 text-sm text-slate-400">Focus Areas</p>
              <div className="flex flex-wrap gap-2">
                {project.focus.map((entry) => (
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
            <CardTitle className="text-slate-100">
              Test Cases ({discoveredTests.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {discoveredTests.length === 0 ? (
              <p className="text-sm text-slate-500">
                No discovered test cases yet. Run this project once to populate
                routes.
              </p>
            ) : (
              <div className="space-y-2">
                {discoveredTests.map((route) => (
                  <div
                    key={route}
                    className="rounded-lg border border-slate-800 bg-slate-800/30 px-3 py-2"
                  >
                    <p className="font-medium text-slate-100">Route {route}</p>
                    <p className="text-xs text-slate-500">
                      Derived from latest run page results.
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "runs" ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input
                placeholder="Search by run ID..."
                value={runsSearch}
                onChange={(e) => setRunsSearch(e.target.value)}
                className="border-slate-700 bg-slate-900/70 pl-10 text-slate-100"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-400" />
              <select
                title="filter"
                value={runsStatusFilter}
                onChange={(e) =>
                  setRunsStatusFilter(e.target.value as typeof runsStatusFilter)
                }
                className="h-10 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 outline-none"
              >
                {statusOptions.map((s) => (
                  <option key={s} value={s}>
                    {s[0].toUpperCase() + s.slice(1)} ({statusCounts[s]})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {filteredRuns.length === 0 ? (
            <Card className="border-slate-800 bg-slate-900/70">
              <CardContent className="p-12 text-center">
                <Play className="mx-auto h-10 w-10 text-slate-600" />
                <h3 className="mt-4 text-xl font-semibold text-slate-100">
                  No runs found
                </h3>
                <p className="mt-1 text-slate-400">
                  {runsSearch || runsStatusFilter !== "all"
                    ? "Try adjusting your filters."
                    : "Run the project to see results here."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="overflow-hidden border-slate-800 bg-slate-900/70">
              <CardContent className="p-0">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="p-4">Run</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Results</th>
                      <th className="p-4">Date</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRuns.map((run) => (
                      <tr
                        key={run.auditId}
                        className="border-b border-slate-800/70 hover:bg-slate-800/20"
                      >
                        <td className="p-4 font-mono text-xs text-blue-300">
                          {run.auditId.slice(0, 8)}
                        </td>
                        <td className="p-4">
                          <StatusBadge status={listItemDisplayStatus(run)} />
                        </td>
                        <td className="p-4 text-sm">
                          <span className="text-emerald-300">
                            {run.summary.passCount} pass
                          </span>
                          <span className="mx-2 text-slate-600">/</span>
                          <span className="text-red-300">
                            {run.summary.failCount} fail
                          </span>
                        </td>
                        <td className="p-4 text-xs text-slate-400">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDateTime(run.createdAt)}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <Link
                            href={`/runs/${run.auditId}`}
                            className="inline-flex items-center gap-1 text-sm text-blue-300 hover:text-blue-200"
                          >
                            View <ArrowRight className="h-4 w-4" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </div>
      ) : null}

      {activeTab === "issues" ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input
                placeholder="Search issues..."
                value={issuesSearch}
                onChange={(e) => setIssuesSearch(e.target.value)}
                className="border-slate-700 bg-slate-900/70 pl-10 text-slate-100"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-400" />
              <select
                title="filter"
                value={issuesSeverityFilter}
                onChange={(e) =>
                  setIssuesSeverityFilter(
                    e.target.value as typeof issuesSeverityFilter,
                  )
                }
                className="h-10 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 outline-none"
              >
                {severityFilters.map((sev) => (
                  <option key={sev} value={sev}>
                    {sev[0].toUpperCase() + sev.slice(1)} ({issueCounts[sev]})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {issuesError ? (
            <p className="text-sm text-red-300">{issuesError}</p>
          ) : null}

          {issuesLoading ? (
            <p className="text-sm text-slate-400">Loading issues...</p>
          ) : filteredGroups.length === 0 ? (
            <Card className="border-slate-800 bg-slate-900/70">
              <CardContent className="p-12 text-center">
                <AlertTriangle className="mx-auto h-10 w-10 text-slate-600" />
                <h3 className="mt-4 text-xl font-semibold text-slate-100">
                  No issues found
                </h3>
                <p className="mt-1 text-slate-400">
                  {issuesSearch || issuesSeverityFilter !== "all"
                    ? "Try adjusting your filters."
                    : "No issues detected yet. Run the project first."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredGroups.map((group) => {
                const isExpanded = expandedRuns.has(group.audit.auditId);
                return (
                  <div
                    key={group.audit.auditId}
                    className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70"
                  >
                    {/* Run header */}
                    <button
                      type="button"
                      onClick={() => toggleRunExpand(group.audit.auditId)}
                      className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-800/40"
                    >
                      <div className="flex items-center gap-3">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm text-blue-300">
                              {group.audit.auditId.slice(0, 8)}
                            </span>
                            <StatusBadge
                              status={listItemDisplayStatus(group.audit)}
                              size="sm"
                            />
                          </div>
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                            <Clock className="h-3 w-3" />
                            {formatDateTime(group.audit.createdAt)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-400">
                          {group.issues.length} issue
                          {group.issues.length !== 1 ? "s" : ""}
                        </span>
                        <Link
                          href={`/runs/${group.audit.auditId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-xs text-blue-300 hover:text-blue-200"
                        >
                          View Run <ArrowRight className="h-3 w-3" />
                        </Link>
                      </div>
                    </button>

                    {/* Issues list */}
                    {isExpanded ? (
                      <div className="divide-y divide-slate-800/60 border-t border-slate-800">
                        {group.issues.map((entry) => (
                          <div key={entry.id} className="space-y-3 px-4 py-4">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium uppercase ${
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
                                <span className="text-xs capitalize text-slate-500">
                                  {entry.issue.category}
                                </span>
                              </div>
                            </div>
                            <div>
                              <p className="font-semibold text-slate-100">
                                {entry.issue.title}
                              </p>
                              <p className="mt-0.5 text-sm text-slate-400">
                                {entry.issue.symptom}
                              </p>
                            </div>
                            <div className="grid gap-3 md:grid-cols-3">
                              <div>
                                <p className="text-xs text-slate-500">
                                  Expected
                                </p>
                                <p className="text-sm text-slate-200">
                                  {entry.issue.expected}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-slate-500">Actual</p>
                                <p className="text-sm text-red-300">
                                  {entry.issue.actual}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-slate-500">
                                  Fix Approach
                                </p>
                                <p className="text-sm text-emerald-300">
                                  {entry.issue.recommendedFixApproach}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
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
                  Latest run:{" "}
                  <span className="font-mono text-slate-200">
                    {audits[0].auditId}
                  </span>
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    asChild
                    variant="secondary"
                    className="bg-slate-800 text-slate-100 hover:bg-slate-700"
                  >
                    <a
                      href={`/api/audits/${audits[0].auditId}/export?format=json`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Download JSON
                    </a>
                  </Button>
                  <Button
                    asChild
                    variant="secondary"
                    className="bg-slate-800 text-slate-100 hover:bg-slate-700"
                  >
                    <a
                      href={`/api/audits/${audits[0].auditId}/export?format=md`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Download Markdown
                    </a>
                  </Button>
                </div>
                <p className="text-sm text-slate-500">
                  {latestDetail
                    ? `Issues in latest run: ${latestDetail.issues.length}`
                    : "Open a run to inspect issues."}
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-500">
                Run the project first to export a report.
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
