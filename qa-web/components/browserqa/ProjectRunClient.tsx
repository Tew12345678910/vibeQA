"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ExternalLink,
  Github,
  Globe,
  Link2,
  Loader2,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DetailLoadingState } from "@/components/browserqa/LoadingStates";
import {
  getProjectById,
  patchProject,
  type ProjectConfig,
} from "@/lib/browserqa/project-store";
import {
  makeRunId,
  saveRun,
  type StoredIssue,
} from "@/lib/browserqa/run-store";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

type IssueCard = StoredIssue;

type GithubScanResponse = {
  scanId: string;
  cards: Array<{
    id: string;
    source: string;
    title: string;
    priority: "P0" | "P1" | "P2";
    category: string;
  }>;
};

type BrowserScanResponse = {
  issues: Array<{
    id: string;
    title: string;
    priority: "P0" | "P1" | "P2";
    category: string;
    description: string;
  }>;
};

// ------------------------------------------------------------------
// Priority helpers
// ------------------------------------------------------------------

const priorityLabel: Record<IssueCard["priority"], string> = {
  P0: "Critical",
  P1: "High",
  P2: "Medium",
};

const priorityColors: Record<IssueCard["priority"], string> = {
  P0: "border-red-500/40 bg-red-500/10 text-red-300",
  P1: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  P2: "border-blue-500/40 bg-blue-500/10 text-blue-300",
};

// ------------------------------------------------------------------
// per-session issue scratch-pad (not stored across sessions — runs are
// persisted via run-store once scan completes)
// ------------------------------------------------------------------

type Props = { projectId: string };

export function ProjectRunClient({ projectId }: Props) {
  const router = useRouter();
  const [project, setProject] = useState<ProjectConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [issues, setIssues] = useState<IssueCard[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const [editingUrl, setEditingUrl] = useState(false);
  const [repoInput, setRepoInput] = useState("");
  const [urlInput, setUrlInput] = useState("");

  const saveRepo = () => {
    const val = repoInput.trim();
    if (!val) return;
    const url = val.startsWith("http") ? val : `https://github.com/${val}`;
    const updated = patchProject(projectId, { githubRepo: url });
    if (updated) setProject(updated);
    setRepoInput("");
    void fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ githubRepo: url }),
    }).catch(() => {});
  };

  const saveUrl = () => {
    const val = urlInput.trim();
    if (!val) return;
    const updated = patchProject(projectId, { websiteUrl: val });
    if (updated) setProject(updated);
    setEditingUrl(false);
    setUrlInput("");
    void fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ websiteUrl: val }),
    }).catch(() => {});
  };

  useEffect(() => {
    setProject(getProjectById(projectId));
    setLoading(false);
  }, [projectId]);

  const clearIssues = () => setIssues([]);

  const appendIssues = useCallback((next: IssueCard[]) => {
    setIssues((prev) => [
      ...prev,
      ...next.filter((n) => !prev.find((p) => p.id === n.id)),
    ]);
  }, []);

  // ------------------------------------------------------------------
  // Scan logic
  // ------------------------------------------------------------------

  const runScan = useCallback(async () => {
    if (!project || scanning) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setIssues([]);
    setScanning(true);
    setError("");
    setScanStatus(null);

    const collected: IssueCard[] = [];

    try {
      const hasGithub = !!project.githubRepo;
      const hasBrowser = !!project.websiteUrl;

      // ── GitHub scan → Next.js API ─────────────────────────────
      if (hasGithub) {
        setScanStatus("Scanning GitHub repository…");
        const githubToken = sessionStorage
          .getItem("github_provider_token")
          ?.trim();
        const headers: Record<string, string> = {
          "content-type": "application/json",
        };
        if (githubToken) headers["x-github-token"] = githubToken;

        const res = await fetch("/api/pipeline/scans/github", {
          method: "POST",
          headers,
          signal: ctrl.signal,
          body: JSON.stringify({
            repoUrl: project.githubRepo,
            projectName: project.name,
            githubToken: githubToken || undefined,
          }),
        });

        if (!res.ok) {
          const payload = (await res.json()) as { error?: string };
          throw new Error(payload.error ?? "GitHub scan failed");
        }

        const payload = (await res.json()) as GithubScanResponse;
        const githubIssues: IssueCard[] = payload.cards.map((c) => ({
          id: `gh-${c.id}`,
          source: "github" as const,
          title: c.title,
          priority: c.priority,
          category: c.category,
        }));
        collected.push(...githubIssues);
        appendIssues(githubIssues);
      }

      // ── Browser-use scan (mock for now) ───────────────────────
      if (hasBrowser) {
        setScanStatus("Running browser scan…");
        const res = await fetch("/api/pipeline/browser-scan", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: ctrl.signal,
          body: JSON.stringify({
            url: project.websiteUrl,
            projectName: project.name,
            instruction: `QA scan for ${project.name}: check usability, accessibility, and functionality at ${project.websiteUrl}`,
          }),
        });

        if (!res.ok) {
          const payload = (await res.json()) as { error?: string };
          throw new Error(payload.error ?? "Browser scan failed");
        }

        const payload = (await res.json()) as BrowserScanResponse;
        const browserIssues: IssueCard[] = payload.issues.map((i) => ({
          id: `br-${i.id}`,
          source: "browser" as const,
          title: i.title,
          priority: i.priority,
          category: i.category,
          description: i.description,
        }));
        collected.push(...browserIssues);
        appendIssues(browserIssues);
      }

      // ── Persist run record ────────────────────────────────────
      if (collected.length > 0) {
        setScanStatus("Saving run…");
        const runId = makeRunId();
        const createdAt = new Date().toISOString();
        const counts = {
          p0: collected.filter((i) => i.priority === "P0").length,
          p1: collected.filter((i) => i.priority === "P1").length,
          p2: collected.filter((i) => i.priority === "P2").length,
          total: collected.length,
        };

        // Save to localStorage
        saveRun({ id: runId, projectId, createdAt, issues: collected, counts });

        // Sync to Supabase (best-effort)
        void fetch(`/api/projects/${projectId}/runs`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: runId,
            createdAt,
            counts,
            issues: collected.map((i) => ({
              id: i.id,
              source: i.source,
              title: i.title,
              priority: i.priority,
              category: i.category,
              description: i.description,
            })),
          }),
        }).catch(() => {});
      }

      setScanStatus(
        collected.length === 0 ? "No issues found" : "Scan complete",
      );
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }, [project, scanning, appendIssues, projectId]);

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  if (loading) return <DetailLoadingState label="Loading project…" />;

  if (!project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-slate-400">Project not found.</p>
        <Button
          variant="ghost"
          onClick={() => router.push("/projects")}
          className="text-slate-400 hover:text-slate-100"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Projects
        </Button>
      </div>
    );
  }

  const p0 = issues.filter((i) => i.priority === "P0");
  const p1 = issues.filter((i) => i.priority === "P1");
  const p2 = issues.filter((i) => i.priority === "P2");

  return (
    <div className="flex h-full min-h-0 overflow-hidden -m-6">
      {/* ── Project Sidebar ─────────────────────────────── */}
      <aside className="flex w-64 shrink-0 flex-col gap-6 overflow-y-auto border-r border-slate-800 bg-slate-950/60 p-5">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/projects/${projectId}`)}
            className="mb-4 -ml-2 text-slate-400 hover:text-slate-100"
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            {project.name}
          </Button>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Current Scan
          </p>
        </div>

        {/* GitHub repo */}
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
            <Github className="h-3.5 w-3.5" />
            Repository
          </p>
          {project.githubRepo ? (
            <a
              href={project.githubRepo}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 break-all rounded-md border border-slate-800 bg-slate-900/60 p-2.5 text-xs text-blue-400 hover:text-blue-300 hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              {project.githubRepo.replace("https://github.com/", "")}
            </a>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Input
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveRepo();
                  if (e.key === "Escape") setRepoInput("");
                }}
                placeholder="owner/repo or GitHub URL"
                className="h-7 border-slate-700 bg-slate-900 text-xs text-slate-100 placeholder:text-slate-600"
              />
              {repoInput.trim() ? (
                <Button size="sm" onClick={saveRepo} className="h-6 bg-emerald-600 px-2 text-xs hover:bg-emerald-500">
                  <Check className="mr-1 h-3 w-3" /> Save
                </Button>
              ) : null}
            </div>
          )}
        </div>

        {/* Website URL */}
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
            <Globe className="h-3.5 w-3.5" />
            Website
          </p>
          {editingUrl ? (
            <div className="flex flex-col gap-1.5">
              <Input
                autoFocus
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveUrl();
                  if (e.key === "Escape") { setEditingUrl(false); setUrlInput(""); }
                }}
                placeholder="https://yoursite.com"
                className="h-7 border-slate-700 bg-slate-900 text-xs text-slate-100 placeholder:text-slate-600"
              />
              <div className="flex gap-1">
                <Button size="sm" onClick={saveUrl} className="h-6 flex-1 bg-emerald-600 px-2 text-xs hover:bg-emerald-500">
                  <Check className="mr-1 h-3 w-3" /> Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditingUrl(false); setUrlInput(""); }} className="h-6 px-2 text-xs text-slate-400 hover:text-slate-100">
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ) : project.websiteUrl ? (
            <div className="group flex items-start gap-1.5">
              <a
                href={project.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-w-0 flex-1 items-center gap-1.5 break-all rounded-md border border-slate-800 bg-slate-900/60 p-2.5 text-xs text-blue-400 hover:text-blue-300 hover:underline"
              >
                <Link2 className="h-3.5 w-3.5 shrink-0" />
                {project.websiteUrl}
              </a>
              <button
                type="button"
                onClick={() => { setUrlInput(project.websiteUrl ?? ""); setEditingUrl(true); }}
                className="mt-2 shrink-0 text-slate-600 opacity-0 transition-opacity hover:text-slate-300 group-hover:opacity-100"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditingUrl(true)}
              className="flex w-full items-center gap-1.5 rounded-md border border-dashed border-slate-700 p-2.5 text-xs text-slate-500 transition-colors hover:border-slate-500 hover:text-slate-300"
            >
              <Plus className="h-3.5 w-3.5" />
              Add website URL
            </button>
          )}
        </div>

        {/* This scan summary */}
        {issues.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              This Scan
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {(["P0", "P1", "P2"] as const).map((p) => {
                const count =
                  p === "P0" ? p0.length : p === "P1" ? p1.length : p2.length;
                return (
                  <div
                    key={p}
                    className={`rounded-md border p-2 text-center text-xs ${priorityColors[p]}`}
                  >
                    <p className="text-base font-bold leading-none">{count}</p>
                    <p className="mt-0.5 opacity-80">{p}</p>
                  </div>
                );
              })}
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={clearIssues}
              className="w-full text-slate-500 hover:text-red-300"
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Clear
            </Button>
          </div>
        ) : null}
      </aside>

      {/* ── Main Content ─────────────────────────────────── */}
      <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
        {/* Top bar */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950/40 px-6 py-3">
          <div>
            <h1 className="text-xl font-bold text-slate-100">{project.name}</h1>
            {scanStatus ? (
              <p className="text-xs text-slate-400">{scanStatus}</p>
            ) : (
              <p className="text-xs text-slate-500">
                {issues.length > 0
                  ? `${issues.length} issue${issues.length !== 1 ? "s" : ""} found`
                  : "Ready to scan"}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {issues.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void runScan()}
                disabled={scanning}
                className="text-slate-400 hover:text-slate-100"
              >
                <RefreshCw
                  className={`mr-1.5 h-4 w-4 ${scanning ? "animate-spin" : ""}`}
                />
                Re-scan
              </Button>
            ) : null}

            <Button
              onClick={() => void runScan()}
              disabled={scanning}
              size="lg"
              className="bg-emerald-500 text-slate-950 hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 disabled:opacity-60"
            >
              {scanning ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Play className="mr-2 h-5 w-5 fill-current" />
              )}
              {scanning ? "Scanning…" : "Scan"}
            </Button>
          </div>
        </div>

        {error ? (
          <div className="mx-6 mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto p-6">
          {scanning && issues.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 py-20 text-slate-400">
              <Loader2 className="h-10 w-10 animate-spin text-emerald-400" />
              <p className="text-sm">{scanStatus ?? "Running scan…"}</p>
            </div>
          ) : issues.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 py-20 text-slate-500">
              <Play className="h-12 w-12 text-slate-700" />
              <p className="text-lg font-semibold text-slate-300">
                No issues yet
              </p>
              <p className="text-sm">
                Press the green{" "}
                <span className="text-emerald-400">Scan</span> button to start.
              </p>
            </div>
          ) : (
            <div className="columns-1 gap-4 sm:columns-2 xl:columns-3">
              {issues.map((issue) => (
                <IssueCardItem key={issue.id} issue={issue} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Issue card
// ------------------------------------------------------------------

function IssueCardItem({ issue }: { issue: IssueCard }) {
  return (
    <Card
      className={`mb-4 break-inside-avoid border bg-slate-900/70 ${
        issue.priority === "P0"
          ? "border-red-500/30"
          : issue.priority === "P1"
            ? "border-amber-500/30"
            : "border-blue-500/30"
      }`}
    >
      <CardContent className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold uppercase ${priorityColors[issue.priority]}`}
          >
            <AlertTriangle className="h-3 w-3" />
            {priorityLabel[issue.priority]}
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
              issue.source === "github"
                ? "border-purple-500/30 bg-purple-500/10 text-purple-300"
                : "border-cyan-500/30 bg-cyan-500/10 text-cyan-300"
            }`}
          >
            {issue.source === "github" ? (
              <Github className="h-3 w-3" />
            ) : (
              <Globe className="h-3 w-3" />
            )}
            {issue.source === "github" ? "GitHub" : "Browser"}
          </span>
        </div>
        <p className="font-medium leading-snug text-slate-100">{issue.title}</p>
        <p className="text-xs capitalize text-slate-500">{issue.category}</p>
        {issue.description ? (
          <p className="text-sm leading-relaxed text-slate-400">
            {issue.description}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
