"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Github } from "lucide-react";

import type { GitHubRepoItem } from "@/app/api/github/repos/route";
import { GitHubRepoPicker } from "@/components/browserqa/GitHubRepoPicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ScanResponse = {
  scanId: string;
  project: {
    name: string;
    framework: string;
    router: string;
  };
  routes: string[];
  endpointCount: number;
  summary: {
    score: number;
    p0: number;
    p1: number;
    p2: number;
  };
  cards: Array<{
    id: string;
    source: "local" | "nextjs-api";
    title: string;
    priority: "P0" | "P1" | "P2";
    category: string;
  }>;
};

export function NewProjectPipelineClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [sourceType, setSourceType] = useState<"github" | "github-repos">(
    "github-repos",
  );
  const [githubUrl, setGithubUrl] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepoItem | null>(null);
  const [repoRefreshTick, setRepoRefreshTick] = useState(0);
  const [projectName, setProjectName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");

  const [scan, setScan] = useState<ScanResponse | null>(null);
  const [busyScan, setBusyScan] = useState(false);
  const [busyConfirm, setBusyConfirm] = useState(false);
  const [error, setError] = useState("");

  // Handle return from GitHub OAuth
  useEffect(() => {
    const connected = searchParams.get("github_connected");
    const ghError = searchParams.get("github_error");

    if (connected === "true") {
      setSourceType("github-repos");
      setRepoRefreshTick((n) => n + 1); // trigger picker reload
      // Clean up URL
      router.replace("/projects/new");
    } else if (ghError) {
      setError(`GitHub connection failed: ${decodeURIComponent(ghError)}`);
      router.replace("/projects/new");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function handleRepoSelect(repo: GitHubRepoItem) {
    setSelectedRepo(repo);
    setGithubUrl(repo.htmlUrl);
    if (!projectName.trim()) {
      setProjectName(repo.name);
    }
  }

  const localCards = useMemo(() => scan?.cards ?? [], [scan]);

  const runScan = async () => {
    setBusyScan(true);
    setError("");

    try {
      // "github" or "github-repos" — both use repoUrl
      const url =
        sourceType === "github-repos" ? selectedRepo?.htmlUrl : githubUrl.trim();
      if (!url) {
        throw new Error(
          sourceType === "github-repos"
            ? "Please select a repository"
            : "Please provide a GitHub repository URL",
        );
      }

      const githubToken = sessionStorage.getItem("github_provider_token")?.trim();
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (githubToken) {
        headers["x-github-token"] = githubToken;
      }

      const response = await fetch("/api/pipeline/scans/github", {
        method: "POST",
        headers,
        body: JSON.stringify({
          repoUrl: url,
          projectName: projectName.trim() || undefined,
          githubToken: githubToken || undefined,
        }),
      });

      const payload = (await response.json()) as ScanResponse | { error?: string };
      if (!response.ok || !("scanId" in payload)) {
        throw new Error((payload as { error?: string }).error ?? "GitHub scan failed");
      }

      setScan(payload);
      if (!projectName.trim()) {
        setProjectName(payload.project.name);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setBusyScan(false);
    }
  };

  const confirmAndStartReview = async () => {
    if (!scan) {
      setError("Run a scan first");
      return;
    }
    if (!baseUrl.trim()) {
      setError("Public URL is required to start review");
      return;
    }

    setBusyConfirm(true);
    setError("");

    try {
      const response = await fetch("/api/pipeline/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scanId: scan.scanId,
          baseUrl: baseUrl.trim(),
        }),
      });

      const payload = (await response.json()) as {
        runId?: string;
        issuePageUrl?: string;
        error?: string;
      };
      if (!response.ok || !payload.runId || !payload.issuePageUrl) {
        throw new Error(payload.error ?? "Failed to start review");
      }

      router.push(payload.issuePageUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start review");
    } finally {
      setBusyConfirm(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-6">
      <section>
        <h1 className="text-3xl font-bold text-slate-100">
          New Project Pipeline
        </h1>
        <p className="mt-2 text-slate-400">
          Select or link a GitHub repository, run static + AI scan, then confirm
          public URL to open the issues result page immediately.
        </p>
      </section>

      <Card className="border-slate-800 bg-slate-900/70">
        <CardHeader>
          <CardTitle className="text-slate-100">1) Source Scan</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {/* Source type tabs */}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={sourceType === "github-repos" ? "default" : "secondary"}
              className={
                sourceType === "github-repos"
                  ? "bg-blue-500 text-slate-950 hover:bg-blue-400"
                  : "bg-slate-800 text-slate-100 hover:bg-slate-700"
              }
              onClick={() => setSourceType("github-repos")}
              disabled={busyScan}
            >
              <Github className="mr-1.5 h-4 w-4" />
              My Repositories
            </Button>
            <Button
              type="button"
              variant={sourceType === "github" ? "default" : "secondary"}
              className={
                sourceType === "github"
                  ? "bg-blue-500 text-slate-950 hover:bg-blue-400"
                  : "bg-slate-800 text-slate-100 hover:bg-slate-700"
              }
              onClick={() => setSourceType("github")}
              disabled={busyScan}
            >
              GitHub URL
            </Button>
          </div>

          {/* Project name (always shown) */}
          <div className="grid gap-1.5">
            <Label htmlFor="projectName">Project Name (optional)</Label>
            <Input
              id="projectName"
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder="my-app"
              disabled={busyScan}
            />
          </div>

          {/* Source-specific input */}
          {sourceType === "github-repos" && (
            <GitHubRepoPicker
              onSelect={handleRepoSelect}
              selectedFullName={selectedRepo?.fullName}
              triggerRefresh={repoRefreshTick}
            />
          )}

          {sourceType === "github" && (
            <div className="grid gap-1.5">
              <Label htmlFor="githubUrl">GitHub URL</Label>
              <Input
                id="githubUrl"
                value={githubUrl}
                onChange={(event) => setGithubUrl(event.target.value)}
                placeholder="https://github.com/owner/repo"
                disabled={busyScan}
              />
            </div>
          )}

          {/* Scan button */}
          <Button
            type="button"
            onClick={() => void runScan()}
            disabled={
              busyScan ||
              (sourceType === "github" ? !githubUrl.trim() : !selectedRepo)
            }
            className="bg-blue-500 text-slate-950 hover:bg-blue-400"
          >
            {busyScan ? "Scanning..." : "Run Scan"}
          </Button>
        </CardContent>
      </Card>

      {scan ? (
        <Card className="border-slate-800 bg-slate-900/70">
          <CardHeader>
            <CardTitle className="text-slate-100">Scan Result</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2 md:grid-cols-4">
              <div className="rounded-lg border border-slate-800 bg-slate-800/30 p-3">
                <p className="text-xs text-slate-400">Project</p>
                <p className="text-sm font-medium text-slate-100">
                  {scan.project.name}
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-800/30 p-3">
                <p className="text-xs text-slate-400">Framework</p>
                <p className="text-sm font-medium text-slate-100">
                  {scan.project.framework}
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-800/30 p-3">
                <p className="text-xs text-slate-400">Routes</p>
                <p className="text-sm font-medium text-slate-100">
                  {scan.routes.length}
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-800/30 p-3">
                <p className="text-xs text-slate-400">Score</p>
                <p className="text-sm font-medium text-slate-100">
                  {scan.summary.score}
                </p>
              </div>
            </div>

            <div>
              <p className="text-sm text-slate-300">
                Local findings ({localCards.length}) shown first in issues page.
              </p>
              <div className="mt-2 grid gap-2">
                {localCards.slice(0, 6).map((card) => (
                  <div
                    key={card.id}
                    className="rounded border border-slate-800 bg-slate-950/60 p-3"
                  >
                    <p className="text-xs text-slate-500">
                      {card.priority} • {card.category}
                    </p>
                    <p className="text-sm text-slate-100">{card.title}</p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-slate-800 bg-slate-900/70">
        <CardHeader>
          <CardTitle className="text-slate-100">
            2) Confirm Project and Start Review
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="baseUrl">Public URL (required)</Label>
            <Input
              id="baseUrl"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://example.com"
              disabled={busyConfirm}
            />
          </div>

          <Button
            type="button"
            onClick={() => void confirmAndStartReview()}
            disabled={busyConfirm || !scan || !baseUrl.trim()}
            className="bg-emerald-500 text-slate-950 hover:bg-emerald-400"
          >
            {busyConfirm ? "Starting..." : "Confirm Project and Open Issues"}
          </Button>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
    </div>
  );
}
