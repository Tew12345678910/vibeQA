"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Clock,
  ExternalLink,
  FolderKanban,
  Play,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchAudits } from "@/lib/browserqa/api";
import { formatDate } from "@/lib/browserqa/format";
import { buildProjectsFromAudits } from "@/lib/browserqa/project-utils";
import { deleteProject } from "@/lib/browserqa/project-store";
import { StatusBadge } from "@/components/browserqa/StatusBadge";
import { CardsLoadingState } from "@/components/browserqa/LoadingStates";
import type { AuditListItem } from "@/lib/contracts";

export function ProjectsPageClient() {
  const [audits, setAudits] = useState<AuditListItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchAudits({ limit: 50 });
      setAudits(response.items);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const projects = useMemo(() => buildProjectsFromAudits(audits), [audits]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return projects;
    return projects.filter(
      (project) =>
        project.name.toLowerCase().includes(keyword) ||
        project.baseUrl.toLowerCase().includes(keyword),
    );
  }, [search, projects]);

  const onDelete = (projectId: string) => {
    if (
      !window.confirm(
        "Delete this local project config? Existing audit runs will remain.",
      )
    ) {
      return;
    }
    deleteProject(projectId);
    void load();
  };

  if (loading) {
    return <CardsLoadingState titleWidth="w-44" />;
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Projects</h1>
          <p className="mt-2 text-slate-400">
            Manage and organize your QA test projects
          </p>
        </div>
        <Button
          asChild
          className="bg-blue-500 text-slate-950 hover:bg-blue-400"
        >
          <Link href="/projects/new">
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Link>
        </Button>
      </section>

      <section>
        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search projects..."
            className="border-slate-700 bg-slate-900/70 pl-10 text-slate-100"
          />
        </div>
      </section>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      {filtered.length === 0 ? (
        <Card className="border-slate-800 bg-slate-900/70">
          <CardContent className="p-12 text-center">
            <FolderKanban className="mx-auto h-10 w-10 text-slate-600" />
            <h3 className="mt-4 text-xl font-semibold text-slate-100">
              No projects found
            </h3>
            <p className="mt-1 text-slate-400">
              {search
                ? "Try a different keyword."
                : "Create your first project to get started."}
            </p>
            <Button
              asChild
              className="mt-6 bg-blue-500 text-slate-950 hover:bg-blue-400"
            >
              <Link href="/projects/new">
                <Plus className="mr-2 h-4 w-4" />
                Create Project
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((project) => (
            <Card key={project.id} className="border-slate-800 bg-slate-900/70">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-100">
                      {project.name}
                    </h3>
                    {project.detectedFramework ? (
                      <p className="mt-0.5 text-xs font-medium text-blue-400">
                        {project.detectedFramework}
                      </p>
                    ) : null}
                    <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span className="truncate">{project.baseUrl}</span>
                    </p>
                  </div>
                  {project.lastRunStatus ? (
                    <StatusBadge status={project.lastRunStatus} size="sm" />
                  ) : null}
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg border border-slate-800 bg-slate-800/30 p-2">
                    <p className="text-xl font-bold text-slate-100">
                      {project.testCaseCount}
                    </p>
                    <p className="text-xs text-slate-500">Tests</p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-800/30 p-2">
                    <p className="text-xl font-bold text-slate-100">
                      {project.runCount}
                    </p>
                    <p className="text-xs text-slate-500">Runs</p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-800/30 p-2">
                    <p
                      className={`text-xl font-bold ${
                        project.passRate >= 80
                          ? "text-emerald-300"
                          : project.passRate >= 50
                            ? "text-amber-300"
                            : "text-red-300"
                      }`}
                    >
                      {project.passRate}%
                    </p>
                    <p className="text-xs text-slate-500">Pass</p>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-slate-800 pt-3 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDate(project.updatedAt)}
                  </span>
                  {project.fromLocal ? (
                    <span>Local config</span>
                  ) : (
                    <span>Derived from runs</span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    asChild
                    variant="secondary"
                    className="flex-1 bg-slate-800 text-slate-100 hover:bg-slate-700"
                  >
                    <Link href={`/projects/${project.id}`}>View Details</Link>
                  </Button>
                  <Button
                    asChild
                    className="bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                  >
                    <Link href={`/projects/${project.id}`}>
                      <Play className="h-4 w-4" />
                    </Link>
                  </Button>
                  {project.fromLocal ? (
                    <Button
                      variant="outline"
                      onClick={() => onDelete(project.id)}
                      className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-red-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      )}
    </div>
  );
}
