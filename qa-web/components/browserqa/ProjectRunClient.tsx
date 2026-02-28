"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Code2,
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { DetailLoadingState } from "@/components/browserqa/LoadingStates";
import {
  fallbackRouteDescription,
  normalizeRoutePath,
  resolveRoutePurpose,
  type ProjectAnalysis,
  type ProjectRouteAnalysis,
  type RunMetadata,
  type RunScope,
} from "@/lib/browserqa/project-analysis";
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
  runId?: string | null;
  status?: string;
  commitSha?: string;
  indexedFiles?: number;
  counts?: { p0: number; p1: number; p2: number; total: number };
  endpointCount?: number;
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
  cards: Array<{
    id: string;
    source: string;
    title: string;
    priority: "P0" | "P1" | "P2";
    category: string;
    description?: string;
    card?: Record<string, unknown>;
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

type RunSnapshotResponse = {
  run: {
    id: string;
    projectId: string;
    createdAt: string;
    counts: { p0: number; p1: number; p2: number; total: number };
    meta?: Record<string, unknown>;
  };
  status: string;
  counts: { p0: number; p1: number; p2: number; total: number };
  issues: Array<{
    issue_id: string;
    source: string;
    title: string;
    priority: "P0" | "P1" | "P2";
    category: string;
    description?: string | null;
    card_json?: Record<string, unknown> | null;
    file_path?: string | null;
    endpoint?: string | null;
    confidence?: "high" | "medium" | "low" | null;
    state?: string | null;
  }>;
};

type RouteTreeNode = {
  key: string;
  segment: string;
  fullPath: string;
  description?: string;
  children: RouteTreeNode[];
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

const FRAMEWORK_ICONS: Record<string, { src: string; alt: string }> = {
  nextjs: { src: "/frameworks/nextjs.svg", alt: "Next.js" },
  react: { src: "/frameworks/react.svg", alt: "React" },
  vue: { src: "/frameworks/vue.svg", alt: "Vue.js" },
  angular: { src: "/frameworks/angular.svg", alt: "Angular" },
  svelte: { src: "/frameworks/svelte.svg", alt: "Svelte" },
  nuxt: { src: "/frameworks/nuxt.svg", alt: "Nuxt" },
  remix: { src: "/frameworks/remix.svg", alt: "Remix" },
  astro: { src: "/frameworks/astro.svg", alt: "Astro" },
  gatsby: { src: "/frameworks/gatsby.svg", alt: "Gatsby" },
  django: { src: "/frameworks/django.svg", alt: "Django" },
  flask: { src: "/frameworks/flask.svg", alt: "Flask" },
  laravel: { src: "/frameworks/laravel.svg", alt: "Laravel" },
  express: { src: "/frameworks/express.svg", alt: "Express" },
  nestjs: { src: "/frameworks/nestjs.svg", alt: "NestJS" },
  solid: { src: "/frameworks/solid.svg", alt: "SolidJS" },
  vite: { src: "/frameworks/vite.svg", alt: "Vite" },
};

function resolveFrameworkIcon(framework?: string) {
  if (!framework) return null;
  const value = framework.toLowerCase();

  if (value.includes("next")) return FRAMEWORK_ICONS.nextjs;
  if (value.includes("react")) return FRAMEWORK_ICONS.react;
  if (value.includes("vue")) return FRAMEWORK_ICONS.vue;
  if (value.includes("angular")) return FRAMEWORK_ICONS.angular;
  if (value.includes("svelte")) return FRAMEWORK_ICONS.svelte;
  if (value.includes("nuxt")) return FRAMEWORK_ICONS.nuxt;
  if (value.includes("remix")) return FRAMEWORK_ICONS.remix;
  if (value.includes("astro")) return FRAMEWORK_ICONS.astro;
  if (value.includes("gatsby")) return FRAMEWORK_ICONS.gatsby;
  if (value.includes("django")) return FRAMEWORK_ICONS.django;
  if (value.includes("flask")) return FRAMEWORK_ICONS.flask;
  if (value.includes("laravel")) return FRAMEWORK_ICONS.laravel;
  if (value.includes("express")) return FRAMEWORK_ICONS.express;
  if (value.includes("nestjs")) return FRAMEWORK_ICONS.nestjs;
  if (value.includes("solid")) return FRAMEWORK_ICONS.solid;
  if (value.includes("vite")) return FRAMEWORK_ICONS.vite;

  return null;
}

function sortRouteTree(nodes: RouteTreeNode[]): RouteTreeNode[] {
  return nodes
    .map((node) => ({
      ...node,
      children: sortRouteTree(node.children),
    }))
    .sort((a, b) => a.segment.localeCompare(b.segment));
}

function buildRouteTree(routes: ProjectRouteAnalysis[]): RouteTreeNode[] {
  const roots: RouteTreeNode[] = [];
  const nodeByPath = new Map<string, RouteTreeNode>();

  const ensureNode = (fullPath: string, segment: string): RouteTreeNode => {
    const existing = nodeByPath.get(fullPath);
    if (existing) return existing;

    const created: RouteTreeNode = {
      key: fullPath,
      segment,
      fullPath,
      children: [],
    };
    nodeByPath.set(fullPath, created);
    return created;
  };

  for (const route of routes) {
    const normalized = normalizeRoutePath(route.path);
    if (normalized === "/") {
      const rootNode = ensureNode("/", "/");
      rootNode.description = route.description;
      if (!roots.find((node) => node.key === rootNode.key)) {
        roots.push(rootNode);
      }
      continue;
    }

    const segments = normalized.replace(/^\/+/, "").split("/").filter(Boolean);
    let parentPath = "";
    let parentNode: RouteTreeNode | null = null;

    for (const segment of segments) {
      const nextPath = `${parentPath}/${segment}`;
      const node = ensureNode(nextPath, segment);
      if (!parentNode) {
        if (!roots.find((entry) => entry.key === node.key)) {
          roots.push(node);
        }
      } else if (!parentNode.children.find((entry) => entry.key === node.key)) {
        parentNode.children.push(node);
      }

      parentPath = nextPath;
      parentNode = node;
    }

    if (parentNode) {
      parentNode.description = route.description;
    }
  }

  return sortRouteTree(roots);
}

function RouteTreeView({
  nodes,
  depth = 0,
}: {
  nodes: RouteTreeNode[];
  depth?: number;
}) {
  return (
    <div className={depth > 0 ? "ml-3 border-l border-slate-800 pl-2" : ""}>
      {nodes.map((node) => (
        <div key={node.key} className="py-1">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-600" />
            <span className="font-mono text-[11px] text-emerald-300">
              {depth === 0 && node.fullPath === "/" ? "/" : node.segment}
            </span>
          </div>
          {node.description ? (
            <p className="ml-3 text-[11px] leading-snug text-slate-400">
              {node.description}
            </p>
          ) : null}
          {node.children.length > 0 ? (
            <RouteTreeView nodes={node.children} depth={depth + 1} />
          ) : null}
        </div>
      ))}
    </div>
  );
}

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
  const [scanMode, setScanMode] = useState<"both" | "codebase" | "url">("both");
  const [runScope, setRunScope] = useState<RunScope>("full");
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<string | null>(null);
  const analysisRequestRef = useRef<Promise<GithubScanResponse | null> | null>(
    null,
  );

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

  const replaceWithSnapshotIssues = useCallback(
    (snapshot: RunSnapshotResponse) => {
      const nextIssues: IssueCard[] = snapshot.issues.map((issue) => ({
        id: issue.issue_id,
        source: issue.source === "browser" ? "browser" : "github",
        title: issue.title,
        priority: issue.priority,
        category: issue.category,
        description:
          issue.description ??
          (issue.card_json?.problem &&
          typeof issue.card_json.problem === "object" &&
          typeof (issue.card_json.problem as { summary?: unknown }).summary ===
            "string"
            ? ((issue.card_json.problem as { summary: string }).summary ?? "")
            : undefined),
        cardJson: issue.card_json ?? undefined,
        filePath: issue.file_path ?? undefined,
        endpoint: issue.endpoint ?? undefined,
        confidence: issue.confidence ?? undefined,
        state: issue.state ?? undefined,
      }));

      setIssues(nextIssues);
    },
    [],
  );

  const toProjectAnalysis = useCallback(
    (payload: GithubScanResponse): ProjectAnalysis | undefined => {
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
          const routeAnalysis: ProjectRouteAnalysis = {
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
    },
    [],
  );

  const runProjectAnalysis = useCallback(
    async ({
      reason,
      signal,
    }: {
      reason: "manual" | "auto" | "run";
      signal?: AbortSignal;
    }): Promise<GithubScanResponse | null> => {
      if (!project?.githubRepo) return null;
      if (analysisRequestRef.current) {
        return analysisRequestRef.current;
      }

      const request = (async () => {
        if (reason !== "run") {
          setAnalysisStatus("Scanning framework and routes…");
        }
        setAnalysisBusy(true);

        const githubToken = sessionStorage
          .getItem("github_provider_token")
          ?.trim();
        const headers: Record<string, string> = {
          "content-type": "application/json",
        };
        if (githubToken) {
          headers["x-github-token"] = githubToken;
        }

        const res = await fetch("/api/pipeline/analysis/github", {
          method: "POST",
          headers,
          signal,
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
        const analysis = toProjectAnalysis(payload);
        if (analysis) {
          const updatedProject =
            patchProject(projectId, {
              analysis,
              detectedFramework: analysis.framework,
              routes: analysis.routes.map((route) => route.path),
            }) ?? null;
          if (updatedProject) {
            setProject(updatedProject);
          }
          void fetch(`/api/projects/${projectId}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              configJson: { analysis },
            }),
          }).catch(() => {});

          if (reason !== "run") {
            setAnalysisStatus(
              `Updated: ${analysis.framework}, ${analysis.routes.length} route${analysis.routes.length !== 1 ? "s" : ""}`,
            );
          }
        } else if (reason !== "run") {
          setAnalysisStatus("Analysis finished with no framework/routes data.");
        }

        return payload;
      })()
        .catch((err) => {
          if (reason !== "run") {
            setAnalysisStatus(
              err instanceof Error ? err.message : "Analysis failed",
            );
          }
          throw err;
        })
        .finally(() => {
          setAnalysisBusy(false);
          analysisRequestRef.current = null;
        });

      analysisRequestRef.current = request;
      return request;
    },
    [project, projectId, toProjectAnalysis],
  );

  useEffect(() => {
    if (!project?.githubRepo || project.analysis) return;
    void runProjectAnalysis({ reason: "auto" }).catch(() => {
      // best-effort auto analysis
    });
  }, [project?.analysis, project?.githubRepo, runProjectAnalysis]);

  const analysisFramework =
    project?.analysis?.framework ?? project?.detectedFramework;
  const frameworkIcon = useMemo(
    () => resolveFrameworkIcon(analysisFramework),
    [analysisFramework],
  );
  const analysisRoutes = project?.analysis?.routes ?? [];
  const routeAnalysis: ProjectRouteAnalysis[] =
    analysisRoutes.length > 0
      ? analysisRoutes
      : (project?.routes ?? []).map((path) => ({
          path: normalizeRoutePath(path),
          description: fallbackRouteDescription(path),
        }));
  const hasRouteAnalysis = analysisRoutes.length > 0;
  const effectiveRunScope: RunScope =
    runScope === "analysis-only" && hasRouteAnalysis ? "analysis-only" : "full";
  const routeTree = useMemo(
    () => buildRouteTree(routeAnalysis),
    [routeAnalysis],
  );

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
    let latestAnalysis = project.analysis;
    let githubPayload: GithubScanResponse | null = null;
    const runId = makeRunId();
    const createdAt = new Date().toISOString();

    const analyzedRoutePaths = (project.analysis?.routes ?? []).map((route) =>
      normalizeRoutePath(route.path),
    );
    const effectiveScope: RunScope =
      runScope === "analysis-only" && analyzedRoutePaths.length > 0
        ? "analysis-only"
        : "full";
    const selectedRoutePaths =
      effectiveScope === "analysis-only" ? analyzedRoutePaths : [];

    const fetchRunSnapshot = async (): Promise<RunSnapshotResponse | null> => {
      const response = await fetch(`/api/projects/${projectId}/runs/${runId}`, {
        cache: "no-store",
        signal: ctrl.signal,
      });
      if (!response.ok) {
        return null;
      }
      return (await response.json()) as RunSnapshotResponse;
    };

    try {
      const shouldCollectGithubIssues =
        !!project.githubRepo && scanMode !== "url";
      const hasBrowser = !!project.websiteUrl && scanMode !== "codebase";
      const analysisRefreshPromise = project.githubRepo
        ? runProjectAnalysis({
            reason: "run",
            signal: ctrl.signal,
          })
            .then((analysisPayload) =>
              analysisPayload ? toProjectAnalysis(analysisPayload) : undefined,
            )
            .catch((analysisError) => {
              if (
                analysisError instanceof Error &&
                analysisError.name === "AbortError"
              ) {
                return undefined;
              }
              setAnalysisStatus(
                analysisError instanceof Error
                  ? analysisError.message
                  : "Analysis update failed",
              );
              return undefined;
            })
        : Promise.resolve(undefined);

      if (shouldCollectGithubIssues) {
        setScanStatus("Running server/API RAG scan…");

        const githubToken = sessionStorage
          .getItem("github_provider_token")
          ?.trim();
        const headers: Record<string, string> = {
          "content-type": "application/json",
        };
        if (githubToken) {
          headers["x-github-token"] = githubToken;
        }

        let pollActive = true;
        const pollLoop = (async () => {
          while (pollActive && !ctrl.signal.aborted) {
            try {
              const snapshot = await fetchRunSnapshot();
              if (snapshot) {
                replaceWithSnapshotIssues(snapshot);
                const processed = Number(
                  snapshot.run.meta?.processed_chunks ?? 0,
                );
                const total = Number(snapshot.run.meta?.total_chunks ?? 0);
                setScanStatus(
                  total > 0
                    ? `Scanning repository… ${processed}/${total} chunks`
                    : "Scanning repository…",
                );
                if (
                  snapshot.status === "completed" ||
                  snapshot.status === "failed"
                ) {
                  break;
                }
              }
            } catch {
              // keep polling while scan request is still active
            }
            await new Promise((resolve) => setTimeout(resolve, 2500));
          }
        })();

        const res = await fetch("/api/pipeline/scans/github", {
          method: "POST",
          headers,
          signal: ctrl.signal,
          body: JSON.stringify({
            repoUrl: project.githubRepo,
            projectName: project.name,
            githubToken: githubToken || undefined,
            projectId,
            runId,
          }),
        });

        pollActive = false;
        await pollLoop;

        if (!res.ok) {
          const payload = (await res.json()) as { error?: string };
          throw new Error(payload.error ?? "GitHub scan failed");
        }

        const payload = (await res.json()) as GithubScanResponse;
        githubPayload = payload;
        const finalSnapshot = await fetchRunSnapshot();
        if (finalSnapshot) {
          replaceWithSnapshotIssues(finalSnapshot);
          const snapshotIssues: IssueCard[] = finalSnapshot.issues.map(
            (issue) => ({
              id: issue.issue_id,
              source:
                issue.source === "browser"
                  ? ("browser" as const)
                  : ("github" as const),
              title: issue.title,
              priority: issue.priority,
              category: issue.category,
              description: issue.description ?? undefined,
              cardJson: issue.card_json ?? undefined,
              filePath: issue.file_path ?? undefined,
              endpoint: issue.endpoint ?? undefined,
              confidence: issue.confidence ?? undefined,
              state: issue.state ?? undefined,
            }),
          );
          collected.push(...snapshotIssues);
        } else {
          const githubIssues: IssueCard[] = payload.cards.map((c) => ({
            id: c.id,
            source: "github" as const,
            title: c.title,
            priority: c.priority,
            category: c.category,
            description: c.description,
            cardJson: c.card,
          }));
          collected.push(...githubIssues);
          appendIssues(githubIssues);
        }
      }

      const refreshedAnalysis = await analysisRefreshPromise;
      if (refreshedAnalysis) {
        latestAnalysis = refreshedAnalysis;
      }

      if (hasBrowser) {
        setScanStatus(
          effectiveScope === "analysis-only" && selectedRoutePaths.length > 0
            ? "Running browser scan on analyzed routes…"
            : "Running browser scan…",
        );
        const res = await fetch("/api/pipeline/browser-scan", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: ctrl.signal,
          body: JSON.stringify({
            url: project.websiteUrl,
            projectName: project.name,
            routes: selectedRoutePaths,
            instruction:
              effectiveScope === "analysis-only" &&
              selectedRoutePaths.length > 0
                ? `QA scan for ${project.name}. Only test these routes: ${selectedRoutePaths.join(", ")}.`
                : `QA scan for ${project.name}: check usability, accessibility, and functionality at ${project.websiteUrl}`,
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

      setScanStatus("Saving run…");

      const dedupedIssues = Array.from(
        new Map(collected.map((issue) => [issue.id, issue])).values(),
      );
      const counts = {
        p0: dedupedIssues.filter((i) => i.priority === "P0").length,
        p1: dedupedIssues.filter((i) => i.priority === "P1").length,
        p2: dedupedIssues.filter((i) => i.priority === "P2").length,
        total: dedupedIssues.length,
      };
      const runMeta: RunMetadata = {
        scope: effectiveScope,
        selectedRoutePaths,
        projectAnalysis: latestAnalysis,
      };

      saveRun({
        id: runId,
        projectId,
        createdAt,
        issues: dedupedIssues,
        counts,
        meta: runMeta,
      });

      void fetch(`/api/projects/${projectId}/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: runId,
          createdAt,
          counts,
          analysis: latestAnalysis
            ? {
                framework: latestAnalysis.framework,
                router: latestAnalysis.router,
                routes: latestAnalysis.routes.map((route) => ({
                  path: route.path,
                  purpose: route.description,
                  criticality: route.criticality ?? null,
                })),
              }
            : undefined,
          metaJson: {
            ...runMeta,
            status: "completed",
          },
          issues: dedupedIssues.map((i) => ({
            id: i.id,
            source: i.source,
            title: i.title,
            priority: i.priority,
            category: i.category,
            description: i.description,
            cardJson: i.cardJson,
            filePath: i.filePath,
            endpoint: i.endpoint,
            confidence: i.confidence,
            state: i.state,
          })),
        }),
      }).catch(() => {});

      setScanStatus(
        githubPayload !== null && githubPayload.indexedFiles === 0
          ? "No server/API code found in this repository — nothing to audit"
          : dedupedIssues.length === 0
            ? "No issues found"
            : "Scan complete",
      );
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }, [
    appendIssues,
    project,
    projectId,
    replaceWithSnapshotIssues,
    runProjectAnalysis,
    runScope,
    scanning,
    scanMode,
    toProjectAnalysis,
  ]);

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
      <aside className="flex w-64 shrink-0 flex-col overflow-hidden border-r border-slate-800 bg-slate-950/60">
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-6 p-5">
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
                    <Button
                      size="sm"
                      onClick={saveRepo}
                      className="h-6 bg-emerald-600 px-2 text-xs hover:bg-emerald-500"
                    >
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
                      if (e.key === "Escape") {
                        setEditingUrl(false);
                        setUrlInput("");
                      }
                    }}
                    placeholder="https://yoursite.com"
                    className="h-7 border-slate-700 bg-slate-900 text-xs text-slate-100 placeholder:text-slate-600"
                  />
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      onClick={saveUrl}
                      className="h-6 flex-1 bg-emerald-600 px-2 text-xs hover:bg-emerald-500"
                    >
                      <Check className="mr-1 h-3 w-3" /> Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingUrl(false);
                        setUrlInput("");
                      }}
                      className="h-6 px-2 text-xs text-slate-400 hover:text-slate-100"
                    >
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
                    title="Edit URL"
                    type="button"
                    onClick={() => {
                      setUrlInput(project.websiteUrl ?? "");
                      setEditingUrl(true);
                    }}
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

            {/* Project analysis */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Project Analysis
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!project.githubRepo || analysisBusy || scanning}
                  onClick={() =>
                    void runProjectAnalysis({ reason: "manual" }).catch(
                      () => {},
                    )
                  }
                  className="h-6 px-2 text-[11px] text-slate-400 hover:text-slate-100"
                >
                  <RefreshCw
                    className={`mr-1 h-3 w-3 ${analysisBusy ? "animate-spin" : ""}`}
                  />
                  {analysisBusy ? "Scanning…" : "Scan"}
                </Button>
              </div>

              {analysisStatus ? (
                <p className="text-[11px] text-slate-500">{analysisStatus}</p>
              ) : project.analysis?.analyzedAt ? (
                <p className="text-[11px] text-slate-500">
                  Last updated{" "}
                  {new Date(project.analysis.analyzedAt).toLocaleString()}
                </p>
              ) : null}

              {analysisFramework ? (
                <div className="rounded-md border border-slate-800 bg-slate-900/60 px-2.5 py-2 text-xs text-blue-300">
                  <p className="flex items-center gap-1.5">
                    {frameworkIcon ? (
                      <Image
                        src={frameworkIcon.src}
                        alt={frameworkIcon.alt}
                        width={14}
                        height={14}
                      />
                    ) : (
                      <Code2 className="h-3.5 w-3.5" />
                    )}
                    <span>Framework: {analysisFramework}</span>
                  </p>
                  {project.analysis?.router &&
                  project.analysis.router !== "unknown" ? (
                    <p className="mt-1 text-[11px] text-slate-400">
                      Router: {project.analysis.router}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="rounded-md border border-dashed border-slate-700 px-2.5 py-2 text-xs text-slate-500">
                  Framework will be detected after GitHub analysis.
                </p>
              )}

              {routeTree.length > 0 ? (
                <div className="rounded-md border border-slate-800 bg-slate-900/60 p-2">
                  <RouteTreeView nodes={routeTree} />
                </div>
              ) : (
                <p className="text-[11px] leading-relaxed text-slate-500">
                  No route/page analysis is available yet.
                </p>
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
                      p === "P0"
                        ? p0.length
                        : p === "P1"
                          ? p1.length
                          : p2.length;
                    return (
                      <div
                        key={p}
                        className={`rounded-md border p-2 text-center text-xs ${priorityColors[p]}`}
                      >
                        <p className="text-base font-bold leading-none">
                          {count}
                        </p>
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
          </div>
        </ScrollArea>
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

          <div className="flex items-center gap-3">
            {/* Mode selector */}
            <div className="flex items-center rounded-md border border-slate-700 bg-slate-900 p-0.5 text-xs">
              {(
                [
                  {
                    value: "codebase",
                    label: "Codebase",
                    requires: "githubRepo",
                  },
                  { value: "url", label: "URL", requires: "websiteUrl" },
                  { value: "both", label: "Both", requires: null },
                ] as const
              ).map(({ value, label, requires }) => {
                const available =
                  requires === null
                    ? !!(project.githubRepo || project.websiteUrl)
                    : !!project[requires];
                const active = scanMode === value;
                return (
                  <button
                    key={value}
                    type="button"
                    disabled={!available || scanning}
                    title={
                      !available
                        ? `Add a ${requires === "githubRepo" ? "repository" : "website URL"} first`
                        : undefined
                    }
                    onClick={() => setScanMode(value)}
                    className={
                      `rounded px-2.5 py-1 font-medium transition-colors ` +
                      (active
                        ? "bg-emerald-500 text-slate-950"
                        : "text-slate-400 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40")
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Route scope selector */}
            <div className="flex items-center rounded-md border border-slate-700 bg-slate-900 p-0.5 text-xs">
              {(
                [
                  {
                    value: "full",
                    label: "All pages",
                    requiresAnalysis: false,
                  },
                  {
                    value: "analysis-only",
                    label: "Analyzed pages",
                    requiresAnalysis: true,
                  },
                ] as const
              ).map(({ value, label, requiresAnalysis }) => {
                const available = !requiresAnalysis || hasRouteAnalysis;
                const active = effectiveRunScope === value;
                return (
                  <button
                    key={value}
                    type="button"
                    disabled={!available || scanning}
                    title={
                      !available
                        ? "Route analysis required before using this scope"
                        : undefined
                    }
                    onClick={() => setRunScope(value)}
                    className={
                      `rounded px-2.5 py-1 font-medium transition-colors ` +
                      (active
                        ? "bg-blue-500 text-slate-950"
                        : "text-slate-400 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40")
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>

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
                {effectiveRunScope === "analysis-only"
                  ? "Re-run analyzed pages"
                  : "Re-scan"}
              </Button>
            ) : null}

            <Button
              onClick={() => void runScan()}
              disabled={
                scanning ||
                (scanMode === "codebase" && !project.githubRepo) ||
                (scanMode === "url" && !project.websiteUrl) ||
                (scanMode === "both" &&
                  !project.githubRepo &&
                  !project.websiteUrl)
              }
              size="lg"
              className="bg-emerald-500 text-slate-950 hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 disabled:opacity-60"
            >
              {scanning ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Play className="mr-2 h-5 w-5 fill-current" />
              )}
              {scanning
                ? "Scanning…"
                : effectiveRunScope === "analysis-only"
                  ? "Run Analyzed Pages"
                  : "Scan"}
            </Button>
          </div>
        </div>

        {error ? (
          <div className="mx-6 mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        ) : null}

        <ScrollArea className="flex-1">
          <div className="p-6">
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
                  Press the green <span className="text-emerald-400">Scan</span>{" "}
                  button to start.
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
        </ScrollArea>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Issue card
// ------------------------------------------------------------------

function IssueCardItem({ issue }: { issue: IssueCard }) {
  const evidencePath =
    issue.filePath ??
    (issue.cardJson?.problem &&
    typeof issue.cardJson.problem === "object" &&
    Array.isArray((issue.cardJson.problem as { evidence?: unknown[] }).evidence)
      ? (() => {
          const first = (issue.cardJson.problem as { evidence: unknown[] })
            .evidence[0] as
            | { path?: unknown; line_start?: unknown; line_end?: unknown }
            | undefined;
          if (!first || typeof first.path !== "string") return undefined;
          const lineStart = Number(first.line_start ?? 1);
          const lineEnd = Number(first.line_end ?? lineStart);
          return `${first.path}:${lineStart}-${lineEnd}`;
        })()
      : undefined);

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
        {evidencePath ? (
          <p className="font-mono text-[11px] text-slate-500">{evidencePath}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
