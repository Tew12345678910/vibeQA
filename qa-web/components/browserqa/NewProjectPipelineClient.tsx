"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Github, Link2 } from "lucide-react";

import type { GitHubRepoItem } from "@/app/api/github/repos/route";
import { GitHubRepoPicker } from "@/components/browserqa/GitHubRepoPicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createProject } from "@/lib/browserqa/project-store";

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

  const handleCreate = () => {
    if (!canSubmit) return;
    setBusy(true);
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

      // Persist to Supabase (best-effort — does not block navigation)
      void fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: project.id,
          name: project.name,
          sourceType: project.sourceType,
          githubRepo: project.githubRepo,
          websiteUrl: project.websiteUrl,
          baseUrl: project.baseUrl,
        }),
      }).catch(() => {
        // Supabase unavailable; project is still saved locally
      });

      router.push(`/projects/${project.id}/run`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
      setBusy(false);
    }
  };

  return (
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
            {busy ? "Creating..." : "Create Project"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
