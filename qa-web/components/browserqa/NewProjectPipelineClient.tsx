"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Github, Link2 } from "lucide-react";

import type { GitHubRepoItem } from "@/app/api/github/repos/route";
import { GitHubRepoPicker } from "@/components/browserqa/GitHubRepoPicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  normalizeRoutePath,
  resolveRoutePurpose,
  type ProjectAnalysis,
} from "@/lib/browserqa/project-analysis";
import { createProject, patchProject } from "@/lib/browserqa/project-store";

type GithubAnalysisResponse = {
  scanId: string;
  endpointCount: number;
  project?: {
    framework?: string;
    router?: "app" | "pages" | "unknown";
  };
  routes?: string[];
  routeInsights?: Array<{
    path?: string;
    description?: string;
    criticality?: "high" | "medium" | "low";
  }>;
};

export function NewProjectPipelineClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [githubSource, setGithubSource] = useState<"picker" | "url">("picker");
  const [githubUrl, setGithubUrl] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepoItem | null>(null);
  const [repoRefreshTick, setRepoRefreshTick] = useState(0);
  const [projectName, setProjectName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState("Creating...");
  const [error, setError] = useState("");

  // Handle return from GitHub OAuth
  useEffect(() => {
    const connected = searchParams.get("github_connected");
    const ghError = searchParams.get("github_error");

    if (connected === "true") {
      setGithubSource("picker");
      setRepoRefreshTick((n) => n + 1);
      router.replace("/projects/new");
    } else if (ghError) {
      setError(`GitHub connection failed: ${decodeURIComponent(ghError)}`);
      router.replace("/projects/new");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function handleRepoSelect(repo: GitHubRepoItem) {
    setSelectedRepo(repo);
    if (!projectName.trim()) {
      setProjectName(repo.name);
    }
  }

  const resolvedGithubRepo =
    githubSource === "picker" ? selectedRepo?.htmlUrl : githubUrl.trim();

  const canSubmit =
    projectName.trim() !== "" &&
    (!!resolvedGithubRepo || websiteUrl.trim() !== "");

  async function analyzeGithubProject(args: {
    repoUrl: string;
    projectName: string;
  }): Promise<ProjectAnalysis | undefined> {
    const githubToken = sessionStorage.getItem("github_provider_token")?.trim();
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (githubToken) {
      headers["x-github-token"] = githubToken;
    }

    const response = await fetch("/api/pipeline/analysis/github", {
      method: "POST",
      headers,
      body: JSON.stringify({
        repoUrl: args.repoUrl,
        projectName: args.projectName,
        githubToken: githubToken || undefined,
      }),
    });

    if (!response.ok) return undefined;
    const payload = (await response.json()) as GithubAnalysisResponse;
    const framework = payload.project?.framework?.trim();
    if (!framework || !payload.scanId) return undefined;

    const routeInsightsRaw: Array<{
      path?: string;
      description?: string;
      criticality?: "high" | "medium" | "low";
    }> =
      payload.routeInsights && payload.routeInsights.length > 0
        ? payload.routeInsights
        : (payload.routes ?? []).map((path) => ({ path }));

    const routes = routeInsightsRaw
      .map((route) => {
        const rawPath = String(route.path ?? "").trim();
        if (!rawPath) return null;
        const path = normalizeRoutePath(rawPath);
        const routeAnalysis: {
          path: string;
          description: string;
          criticality?: "high" | "medium" | "low";
        } = {
          path,
          description: resolveRoutePurpose(path, route.description),
        };
        if (route.criticality) {
          routeAnalysis.criticality = route.criticality;
        }
        return routeAnalysis;
      })
      .filter((route): route is NonNullable<typeof route> => route !== null);

    return {
      source: "github-scan",
      scanId: payload.scanId,
      analyzedAt: new Date().toISOString(),
      framework,
      router: payload.project?.router ?? "unknown",
      endpointCount: payload.endpointCount ?? 0,
      routes,
    };
  }

  const handleCreate = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setBusyMessage("Creating project...");
    setError("");

    try {
      const project = createProject({
        name: projectName.trim(),
        sourceType: resolvedGithubRepo ? "github" : "local",
        projectPath: "",
        githubRepo: resolvedGithubRepo || undefined,
        websiteUrl: websiteUrl.trim() || undefined,
        baseUrl: websiteUrl.trim() || resolvedGithubRepo || "",
        focus: [
          "usability",
          "accessibility",
          "security",
          "content",
          "functional",
        ],
      });

      let finalProject = project;

      if (project.githubRepo) {
        try {
          setBusyMessage("Analyzing repository...");
          const analysis = await analyzeGithubProject({
            repoUrl: project.githubRepo,
            projectName: project.name,
          });

          if (analysis) {
            finalProject =
              patchProject(project.id, {
                analysis,
                detectedFramework: analysis.framework,
                routes: analysis.routes.map((route) => route.path),
              }) ?? finalProject;
          }
        } catch {
          // Analysis is best-effort; creation still succeeds.
        }
      }

      setBusyMessage("Finalizing...");
      // Persist to Supabase — awaited so the row exists before the scan starts.
      // Non-fatal: if this fails the project is still in localStorage and will be
      // upserted server-side on the first scan run.
      try {
        await fetch("/api/projects", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: finalProject.id,
            name: finalProject.name,
            sourceType: finalProject.sourceType,
            githubRepo: finalProject.githubRepo,
            websiteUrl: finalProject.websiteUrl,
            baseUrl: finalProject.baseUrl,
            configJson: finalProject.analysis
              ? { analysis: finalProject.analysis }
              : {},
          }),
        });
      } catch {
        // Supabase unavailable — project is saved locally and will sync on first scan.
      }

      router.push(`/projects/${finalProject.id}/run`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
      setBusyMessage("Creating...");
    } finally {
      setBusy(false);
    }
  };

  const CREATION_STEPS = [
    { label: "Creating project" },
    { label: "Analyzing repository" },
    { label: "Finalizing" },
  ];

  const currentStep = busyMessage.toLowerCase().includes("analyz")
    ? 1
    : busyMessage.toLowerCase().includes("final")
      ? 2
      : 0;

  return (
    <>
      {busy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-8 rounded-2xl border border-slate-700/60 bg-slate-900/95 px-12 py-10 shadow-2xl shadow-black/60">
            {/* Animated rings */}
            <div className="relative flex h-24 w-24 items-center justify-center">
              <span className="absolute h-24 w-24 animate-spin rounded-full border-[3px] border-transparent border-t-emerald-400 border-r-emerald-400/40 spin-slow" />
              <span className="absolute h-16 w-16 animate-spin rounded-full border-[3px] border-transparent border-b-blue-400 border-l-blue-400/40 spin-slower" />
              <span className="absolute h-8 w-8 animate-spin rounded-full border-2 border-transparent border-t-violet-400 border-r-violet-400/50 spin-fast" />
              <span className="h-3 w-3 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_12px_3px_rgba(52,211,153,0.6)]" />
            </div>

            {/* Step tracker */}
            <div className="flex flex-col gap-3 min-w-50">
              {CREATION_STEPS.map((step, i) => {
                const isDone = i < currentStep;
                const isActive = i === currentStep;
                return (
                  <div key={step.label} className="flex items-center gap-3">
                    <span
                      className={[
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-all duration-500",
                        isDone
                          ? "border-emerald-500 bg-emerald-500 text-slate-950"
                          : isActive
                            ? "border-emerald-400 bg-emerald-400/15 text-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.4)]"
                            : "border-slate-600 bg-slate-800 text-slate-500",
                      ].join(" ")}
                    >
                      {isDone ? (
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                      ) : (
                        <span
                          className={isActive ? "animate-ping absolute inline-flex h-2 w-2 rounded-full bg-emerald-400 opacity-75" : ""}
                        />
                      )}
                      {!isDone && <span className="relative">{i + 1}</span>}
                    </span>
                    <span
                      className={[
                        "text-sm font-medium transition-colors duration-300",
                        isDone
                          ? "text-emerald-400/70 line-through"
                          : isActive
                            ? "text-slate-100"
                            : "text-slate-500",
                      ].join(" ")}
                    >
                      {step.label}
                      {isActive && (
                        <span className="ml-1 inline-flex gap-0.75">
                          <span className="inline-block h-1 w-1 animate-bounce rounded-full bg-emerald-400 delay-0" />
                          <span className="inline-block h-1 w-1 animate-bounce rounded-full bg-emerald-400 delay-150" />
                          <span className="inline-block h-1 w-1 animate-bounce rounded-full bg-emerald-400 delay-300" />
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

    <div className="mx-auto flex w-full flex-col gap-6">
      <section>
        <h1 className="text-3xl font-bold text-slate-100">New Project</h1>
        <p className="mt-2 text-slate-400">
          Add a GitHub repository, a website URL, or both to create your
          project.
        </p>
      </section>

      <Card className="border-slate-800 bg-slate-900/70">
        <CardHeader>
          <CardTitle className="text-slate-100">Project Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6">
          {/* Project name */}
          <div className="grid gap-1.5">
            <Label htmlFor="projectName">
              Project Name <span className="text-red-400">*</span>
            </Label>
            <Input
              id="projectName"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="my-app"
              disabled={busy}
            />
          </div>

          {/* GitHub repo section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Github className="h-4 w-4 text-slate-400" />
              <Label className="text-slate-300">
                GitHub Repository (optional)
              </Label>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={githubSource === "picker" ? "default" : "secondary"}
                className={
                  githubSource === "picker"
                    ? "bg-blue-500 text-slate-950 hover:bg-blue-400"
                    : "bg-slate-800 text-slate-100 hover:bg-slate-700"
                }
                onClick={() => setGithubSource("picker")}
                disabled={busy}
              >
                My Repositories
              </Button>
              <Button
                type="button"
                size="sm"
                variant={githubSource === "url" ? "default" : "secondary"}
                className={
                  githubSource === "url"
                    ? "bg-blue-500 text-slate-950 hover:bg-blue-400"
                    : "bg-slate-800 text-slate-100 hover:bg-slate-700"
                }
                onClick={() => setGithubSource("url")}
                disabled={busy}
              >
                Paste URL
              </Button>
            </div>

            {githubSource === "picker" ? (
              <GitHubRepoPicker
                onSelect={handleRepoSelect}
                selectedFullName={selectedRepo?.fullName}
                triggerRefresh={repoRefreshTick}
              />
            ) : (
              <Input
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
                disabled={busy}
              />
            )}

            {resolvedGithubRepo ? (
              <p className="text-xs text-emerald-400">✓ {resolvedGithubRepo}</p>
            ) : null}
          </div>

          {/* Website URL */}
          <div className="grid gap-1.5">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-slate-400" />
              <Label htmlFor="websiteUrl" className="text-slate-300">
                Website URL (optional)
              </Label>
            </div>
            <Input
              id="websiteUrl"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://example.com"
              disabled={busy}
            />
          </div>

          {!resolvedGithubRepo && !websiteUrl.trim() ? (
            <p className="text-xs text-amber-400">
              Provide at least a GitHub repository or a website URL.
            </p>
          ) : null}

          {error ? <p className="text-sm text-red-300">{error}</p> : null}

          <Button
            type="button"
            onClick={handleCreate}
            disabled={busy || !canSubmit}
            className="bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
          >
            {busy ? busyMessage : "Create Project"}
          </Button>
        </CardContent>
      </Card>
    </div>
    </>
  );
}
