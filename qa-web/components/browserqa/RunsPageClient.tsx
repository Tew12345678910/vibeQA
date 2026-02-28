"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Clock, Filter, Play, Search } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchAudits } from "@/lib/browserqa/api";
import { formatDateTime } from "@/lib/browserqa/format";
import { buildProjectsFromAudits } from "@/lib/browserqa/project-utils";
import {
  listItemDisplayStatus,
  type DisplayRunStatus,
} from "@/lib/browserqa/status";
import { StatusBadge } from "@/components/browserqa/StatusBadge";
import { TableLoadingState } from "@/components/browserqa/LoadingStates";
import type { AuditListItem } from "@/lib/contracts";

const statusOptions: Array<DisplayRunStatus | "all"> = [
  "all",
  "passed",
  "failed",
  "running",
  "pending",
  "canceled",
];

export function RunsPageClient() {
  const [audits, setAudits] = useState<AuditListItem[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<(typeof statusOptions)[number]>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const response = await fetchAudits({ limit: 50 });
        if (!active) return;
        setAudits(response.items);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load runs");
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

  const projects = useMemo(() => buildProjectsFromAudits(audits), [audits]);

  const filteredRuns = useMemo(() => {
    const query = search.trim().toLowerCase();

    return audits.filter((run) => {
      const runStatus = listItemDisplayStatus(run);
      const projectName =
        projects.find((p) => p.baseUrl === run.baseUrl)?.name ?? run.baseUrl;

      const matchesStatus =
        statusFilter === "all" || runStatus === statusFilter;
      const matchesSearch =
        !query ||
        run.auditId.toLowerCase().includes(query) ||
        run.baseUrl.toLowerCase().includes(query) ||
        projectName.toLowerCase().includes(query);

      return matchesStatus && matchesSearch;
    });
  }, [audits, search, statusFilter, projects]);

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

  if (loading) {
    return <TableLoadingState titleWidth="w-36" rows={8} />;
  }

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-3xl font-bold text-slate-100">Test Runs</h1>
        <p className="mt-2 text-slate-400">
          View and manage all test execution runs
        </p>
      </section>

      <section className="flex flex-col gap-3 md:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            placeholder="Search runs..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="border-slate-700 bg-slate-900/70 pl-10 text-slate-100"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400" />
          <select
            title="filter"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value as (typeof statusOptions)[number],
              )
            }
            className="h-10 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 outline-none"
          >
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status[0].toUpperCase() + status.slice(1)} (
                {statusCounts[status]})
              </option>
            ))}
          </select>
        </div>
      </section>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      {filteredRuns.length === 0 ? (
        <Card className="border-slate-800 bg-slate-900/70">
          <CardContent className="p-12 text-center">
            <Play className="mx-auto h-10 w-10 text-slate-600" />
            <h3 className="mt-4 text-xl font-semibold text-slate-100">
              No runs found
            </h3>
            <p className="mt-1 text-slate-400">
              {search || statusFilter !== "all"
                ? "Try adjusting your filters."
                : "Run a project to see results here."}
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
                  <th className="p-4">Project</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Results</th>
                  <th className="p-4">Date</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRuns.map((run) => {
                  const project = projects.find(
                    (entry) => entry.baseUrl === run.baseUrl,
                  );
                  return (
                    <tr
                      key={run.auditId}
                      className="border-b border-slate-800/70 hover:bg-slate-800/20"
                    >
                      <td className="p-4 font-mono text-xs text-blue-300">
                        {run.auditId.slice(0, 8)}
                      </td>
                      <td className="p-4 text-sm text-slate-100">
                        {project?.name ?? run.baseUrl}
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
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
