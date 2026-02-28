"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Clock,
  ExternalLink,
  FolderKanban,
  Play,
  Plus,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/browserqa/format";
import { CardsLoadingState } from "@/components/browserqa/LoadingStates";

// Shape of /api/projects response items (mirrors ProjectWithStats from the DB layer)
type ProjectSummary = {
  id: string;
  name: string;
  github_repo: string | null;
  website_url: string | null;
  base_url: string;
  created_at: string;
  updated_at: string;
  run_count: number;
  latest_run_id: string | null;
  latest_run_at: string | null;
  latest_count_p0: number;
  latest_count_p1: number;
  latest_count_p2: number;
  latest_count_total: number;
};

export function ProjectsPageClient() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/projects", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load projects");
      const body = (await res.json()) as { projects: ProjectSummary[] };
      setProjects(body.projects);
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

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return projects;
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(keyword) ||
        (p.github_repo ?? "").toLowerCase().includes(keyword) ||
        (p.website_url ?? "").toLowerCase().includes(keyword) ||
        p.base_url.toLowerCase().includes(keyword),
    );
  }, [search, projects]);

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
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-slate-100">
                      {project.name}
                    </h3>
                    {project.github_repo ? (
                      <p className="mt-0.5 text-xs font-medium text-blue-400 truncate">
                        {project.github_repo.replace("https://github.com/", "")}
                      </p>
                    ) : null}
                    <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">
                        {project.website_url ?? project.base_url}
                      </span>
                    </p>
                  </div>
                  {project.latest_count_p0 > 0 ? (
                    <span className="shrink-0 rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-xs font-semibold text-red-300">
                      {project.latest_count_p0} P0
                    </span>
                  ) : project.run_count > 0 ? (
                    <span className="shrink-0 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                      No P0s
                    </span>
                  ) : null}
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg border border-slate-800 bg-slate-800/30 p-2">
                    <p className="text-xl font-bold text-slate-100">
                      {project.run_count}
                    </p>
                    <p className="text-xs text-slate-500">Scans</p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-800/30 p-2">
                    <p className="text-xl font-bold text-slate-100">
                      {project.run_count > 0 ? project.latest_count_total : "—"}
                    </p>
                    <p className="text-xs text-slate-500">Issues</p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-800/30 p-2">
                    <p
                      className={`text-xl font-bold ${
                        project.run_count === 0
                          ? "text-slate-500"
                          : project.latest_count_p0 === 0
                            ? "text-emerald-300"
                            : "text-red-300"
                      }`}
                    >
                      {project.run_count > 0
                        ? `${project.latest_count_p0}/${project.latest_count_p1}`
                        : "—"}
                    </p>
                    <p className="text-xs text-slate-500">P0/P1</p>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-slate-800 pt-3 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {project.latest_run_at
                      ? `Last scan ${formatDate(project.latest_run_at)}`
                      : `Created ${formatDate(project.created_at)}`}
                  </span>
                  {project.run_count === 0 ? (
                    <span className="text-slate-600">No scans yet</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber-400/80">
                      <AlertTriangle className="h-3 w-3" />
                      {project.latest_count_total} finding
                      {project.latest_count_total !== 1 ? "s" : ""}
                    </span>
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
                    <Link href={`/projects/${project.id}/run`}>
                      <Play className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      )}
    </div>
  );
}
