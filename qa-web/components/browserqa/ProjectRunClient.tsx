"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  Code2,
  ExternalLink,
  FileCode,
  Github,
  Globe,
  Link2,
  Lock,
  Loader2,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { DetailLoadingState } from "@/components/browserqa/LoadingStates";
import { getAuthHeaders } from "@/lib/supabase/browser";
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
  type SiteAuthType,
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

type Props = { projectId: string; initialRunId?: string };

export function ProjectRunClient({ projectId, initialRunId }: Props) {
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

  // Auth / credentials for browser agent
  const [siteAuthType, setSiteAuthType] = useState<SiteAuthType>("none");
  const [siteUsername, setSiteUsername] = useState("");
  const [sitePassword, setSitePassword] = useState("");
  const [credsSaved, setCredsSaved] = useState(false);

  /** Fire-and-forget PATCH to /api/projects/:id with the user's auth token. */
  const patchProjectApi = useCallback(
    (data: Record<string, unknown>) => {
      void getAuthHeaders().then((authHeaders) =>
        fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json", ...authHeaders },
          body: JSON.stringify(data),
        }).catch(() => {}),
      );
    },
    [projectId],
  );

  const saveRepo = () => {
    const val = repoInput.trim();
    if (!val) return;
    const url = val.startsWith("http") ? val : `https://github.com/${val}`;
    const updated = patchProject(projectId, { githubRepo: url });
    if (updated) setProject(updated);
    setRepoInput("");
    patchProjectApi({ githubRepo: url });
  };

  const saveUrl = () => {
    const val = urlInput.trim();
    if (!val) return;
    const updated = patchProject(projectId, { websiteUrl: val });
    if (updated) setProject(updated);
    setEditingUrl(false);
    setUrlInput("");
    patchProjectApi({ websiteUrl: val });
  };

  const saveCredentials = (
    authType: SiteAuthType,
    username: string,
    password: string,
  ) => {
    const updated = patchProject(projectId, {
      siteAuthType: authType,
      siteUsername: username.trim() || undefined,
      sitePassword: password || undefined,
    });
    if (updated) setProject(updated);
    // Sync local state so Skip resets the UI immediately
    setSiteAuthType(authType);
    setSiteUsername(authType === "credentials" ? username : "");
    setSitePassword(authType === "credentials" ? password : "");
    // Only send non-sensitive fields to the server API
    patchProjectApi({
      siteAuthType: authType,
      siteUsername: authType === "credentials" ? username.trim() || undefined : undefined,
    });
    setCredsSaved(true);
    setTimeout(() => setCredsSaved(false), 2000);
  };

  // Sync auth state whenever the project is loaded/updated
  useEffect(() => {
    const loaded = getProjectById(projectId);
    if (loaded) {
      setSiteAuthType(loaded.siteAuthType ?? "none");
      setSiteUsername(loaded.siteUsername ?? "");
      setSitePassword(loaded.sitePassword ?? "");
    }
  }, [projectId]);

  useEffect(() => {
    setProject(getProjectById(projectId));
    if (initialRunId) {
      fetch(`/api/projects/${projectId}/runs/${initialRunId}`, {
        cache: "no-store",
      })
        .then(async (res) => {
          if (!res.ok) return;
          const snapshot = (await res.json()) as RunSnapshotResponse;
          replaceWithSnapshotIssues(snapshot);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
    // replaceWithSnapshotIssues is stable (useCallback with no deps)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, initialRunId]);

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
          patchProjectApi({ configJson: { analysis } });

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
            await new Promise((resolve) => setTimeout(resolve, 1500));
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
            siteAuthType: project.siteAuthType ?? "none",
            siteUsername:
              project.siteAuthType === "credentials"
                ? (project.siteUsername ?? undefined)
                : undefined,
            sitePassword:
              project.siteAuthType === "credentials"
                ? (project.sitePassword ?? undefined)
                : undefined,
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

  // Group issues by file path, sorted P0-first then alphabetically
  const issuesByFile = useMemo(() => {
    const map = new Map<string, IssueCard[]>();
    for (const issue of issues) {
      const file = getIssueFile(issue);
      const arr = map.get(file) ?? [];
      arr.push(issue);
      map.set(file, arr);
    }
    const priorityOrder: Record<IssueCard["priority"], number> = {
      P0: 0,
      P1: 1,
      P2: 2,
    };
    for (const arr of map.values()) {
      arr.sort(
        (a, b) =>
          (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3),
      );
    }
    return [...map.entries()].sort(([pathA, issuesA], [pathB, issuesB]) => {
      const topA = Math.min(
        ...issuesA.map((i) => priorityOrder[i.priority] ?? 3),
      );
      const topB = Math.min(
        ...issuesB.map((i) => priorityOrder[i.priority] ?? 3),
      );
      if (topA !== topB) return topA - topB;
      return pathA.localeCompare(pathB);
    });
  }, [issues]);

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

            {/* Login / Auth for browser agent */}
            {project.websiteUrl ? (
              <div className="space-y-1.5">
                <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <Lock className="h-3.5 w-3.5" />
                  Login / Auth
                </p>

                {/* Auth type selector */}
                <div className="flex flex-col gap-1">
                  {(
                    [
                      { value: "none", label: "No login required" },
                      { value: "credentials", label: "Username & password" },
                      { value: "social", label: "Social / SSO login" },
                    ] as const
                  ).map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setSiteAuthType(value);
                        setCredsSaved(false);
                      }}
                      className={
                        `flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors ` +
                        (siteAuthType === value
                          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                          : "border-slate-700 bg-slate-900/60 text-slate-400 hover:border-slate-600 hover:text-slate-200")
                      }
                    >
                      <span
                        className={`h-2 w-2 rounded-full border ${siteAuthType === value ? "border-emerald-400 bg-emerald-400" : "border-slate-600"}`}
                      />
                      {label}
                    </button>
                  ))}
                </div>

                {/* Social login warning */}
                {siteAuthType === "social" ? (
                  <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-[11px] leading-relaxed text-amber-300">
                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      The browser agent <strong>cannot log in</strong> via
                      social or SSO providers (Google, GitHub, etc.). Protected
                      pages will not be tested.
                    </span>
                  </div>
                ) : null}

                {/* Username / password fields */}
                {siteAuthType === "credentials" ? (
                  <div className="space-y-1.5">
                    <Input
                      value={siteUsername}
                      onChange={(e) => {
                        setSiteUsername(e.target.value);
                        setCredsSaved(false);
                      }}
                      placeholder="Username or email"
                      autoComplete="off"
                      className="h-7 border-slate-700 bg-slate-900 text-xs text-slate-100 placeholder:text-slate-600"
                    />
                    <Input
                      type="password"
                      value={sitePassword}
                      onChange={(e) => {
                        setSitePassword(e.target.value);
                        setCredsSaved(false);
                      }}
                      placeholder="Password"
                      autoComplete="new-password"
                      className="h-7 border-slate-700 bg-slate-900 text-xs text-slate-100 placeholder:text-slate-600"
                    />
                    <p className="text-[10px] leading-relaxed text-slate-600">
                      Saved locally in your browser only.
                    </p>
                  </div>
                ) : null}

                {/* Save / skip row */}
                {siteAuthType !== "none" ? (
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      onClick={() =>
                        saveCredentials(siteAuthType, siteUsername, sitePassword)
                      }
                      className="h-6 flex-1 bg-emerald-600 px-2 text-xs hover:bg-emerald-500"
                    >
                      {credsSaved ? (
                        <>
                          <Check className="mr-1 h-3 w-3" /> Saved
                        </>
                      ) : (
                        <>
                          <Check className="mr-1 h-3 w-3" /> Save
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        saveCredentials("none", "", "")
                      }
                      className="h-6 px-2 text-[11px] text-slate-400 hover:text-slate-100"
                      title="Clear and continue without credentials"
                    >
                      Skip
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}

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
              <div className="space-y-6">
                {issuesByFile.map(([file, fileIssues]) => (
                  <FileIssueGroup
                    key={file || "__nofile"}
                    file={file}
                    issues={fileIssues}
                  />
                ))}
                {scanning && <IssueCardSkeleton />}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Issue file helpers
// ------------------------------------------------------------------

function getIssueFile(issue: IssueCard): string {
  if (issue.filePath) return issue.filePath;
  if (issue.cardJson?.problem && typeof issue.cardJson.problem === "object") {
    const evidence = (issue.cardJson.problem as { evidence?: unknown[] })
      .evidence;
    if (Array.isArray(evidence) && evidence.length > 0) {
      const first = evidence[0] as { path?: unknown };
      if (typeof first.path === "string" && first.path) return first.path;
    }
  }
  return "";
}

function FileIssueGroup({
  file,
  issues,
}: {
  file: string;
  issues: IssueCard[];
}) {
  const p0Count = issues.filter((i) => i.priority === "P0").length;
  const p1Count = issues.filter((i) => i.priority === "P1").length;

  return (
    <div>
      {/* File path header */}
      <div className="mb-2.5 flex items-center gap-2 rounded-md border border-slate-800 bg-slate-900/50 px-3 py-2">
        <FileCode className="h-3.5 w-3.5 shrink-0 text-slate-500" />
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-300">
          {file || "No file association"}
        </span>
        <span className="shrink-0 text-[11px] text-slate-500">
          {issues.length} issue{issues.length !== 1 ? "s" : ""}
        </span>
        {p0Count > 0 ? (
          <span className="shrink-0 rounded-full border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-300">
            {p0Count} P0
          </span>
        ) : p1Count > 0 ? (
          <span className="shrink-0 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
            {p1Count} P1
          </span>
        ) : null}
      </div>
      {/* Issue cards for this file */}
      <div className="space-y-3 pl-2">
        {issues.map((issue) => (
          <IssueCardItem key={issue.id} issue={issue} />
        ))}
      </div>
    </div>
  );
}

function IssueCardSkeleton() {
  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2 rounded-md border border-slate-800 bg-slate-900/50 px-3 py-2">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-emerald-400" />
        <Skeleton className="h-3 w-48 bg-slate-800" />
        <span className="shrink-0 text-[11px] text-slate-500">analyzing…</span>
      </div>
      <div className="space-y-3 pl-2">
        <Card className="border border-slate-700/40 bg-slate-900/40">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-20 rounded-full bg-slate-800" />
              <Skeleton className="h-5 w-16 rounded-full bg-slate-800" />
            </div>
            <Skeleton className="h-4 w-3/4 bg-slate-800" />
            <Skeleton className="h-3 w-1/3 bg-slate-800" />
            <Skeleton className="h-12 w-full bg-slate-800" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Issue card
// ------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Typed helpers for cardJson (the full ImproveCard schema)
// ---------------------------------------------------------------------------

type CardEvidence = {
  type?: "code" | "browser";
  path: string;
  line_start: number;
  line_end: number;
  snippet: string;
};

type CardScope = {
  surfaces?: Array<{ kind: string; path: string; method?: string }>;
  files?: Array<{ path: string; line_start: number; line_end: number }>;
};

type CardRecommendation = {
  summary: string;
  implementation_steps: string[];
  acceptance_criteria: string[];
  estimated_effort: "XS" | "S" | "M" | "L";
  confidence: "high" | "medium" | "low";
};

type CardEducation = {
  why_it_matters: string;
  rule_of_thumb: string;
};

type CardStatus = {
  state: string;
  owner: "backend" | "frontend" | "fullstack";
  created_at: string;
  updated_at: string;
};

type CardTelemetry = {
  retrieval?: {
    rule_hits: Array<{ control_id: string; score: number }>;
    code_hits: Array<{ path: string; line_start: number; line_end: number; score: number }>;
  };
};

type FullCard = {
  id?: string;
  standard_refs?: Array<{ name: string; type: string }>;
  impact?: { user: string; business: string; risk: string };
  scope?: CardScope;
  problem?: { summary?: string; evidence?: CardEvidence[] };
  recommendation?: CardRecommendation;
  education?: CardEducation;
  status?: CardStatus;
  telemetry?: CardTelemetry;
};

function safeCard(cardJson: Record<string, unknown> | undefined): FullCard {
  return (cardJson ?? {}) as FullCard;
}

const EFFORT_STYLES: Record<string, string> = {
  XS: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  S: "border-teal-500/40 bg-teal-500/10 text-teal-300",
  M: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  L: "border-red-500/40 bg-red-500/10 text-red-300",
};

const CONFIDENCE_STYLES: Record<string, string> = {
  high: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  low: "border-red-500/40 bg-red-500/10 text-red-300",
};

const OWNER_STYLES: Record<string, string> = {
  backend: "border-violet-500/40 bg-violet-500/10 text-violet-300",
  frontend: "border-pink-500/40 bg-pink-500/10 text-pink-300",
  fullstack: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
};

const PRIORITY_BAR: Record<string, string> = {
  P0: "bg-red-500",
  P1: "bg-amber-500",
  P2: "bg-sky-500",
};

function IssuePill({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${
        className ?? "border-slate-700 bg-slate-800 text-slate-300"
      }`}
    >
      {label}
    </span>
  );
}

function IssueSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
      {children}
    </p>
  );
}

function IssueCodeBlock({
  path,
  lineStart,
  lineEnd,
  snippet,
}: {
  path: string;
  lineStart: number;
  lineEnd: number;
  snippet: string;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-slate-700/60 bg-slate-950">
      <div className="flex items-center gap-2 border-b border-slate-700/60 bg-slate-900/60 px-3 py-1.5">
        <span className="font-mono text-xs text-slate-400">{path}</span>
        <span className="ml-auto text-[11px] text-slate-500">
          L{lineStart}–{lineEnd}
        </span>
      </div>
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed text-slate-300">{snippet}</pre>
    </div>
  );
}

function IssueCardItem({ issue }: { issue: IssueCard }) {
  const [expanded, setExpanded] = useState(false);
  const [telemetryOpen, setTelemetryOpen] = useState(false);
  const card = safeCard(issue.cardJson);

  return (
    <div
      className={`relative overflow-hidden rounded-lg border bg-slate-900/80 break-inside-avoid transition-shadow ${
        expanded ? "shadow-lg" : "shadow-sm"
      } ${
        issue.priority === "P0"
          ? "border-red-500/30"
          : issue.priority === "P1"
            ? "border-amber-500/30"
            : "border-blue-500/30"
      }`}
    >
      {/* Priority accent bar */}
      <div className={`absolute left-0 top-0 h-full w-1 ${PRIORITY_BAR[issue.priority]}`} />

      {/* ── Always-visible header ─────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left pl-4 pr-4 py-2.5 hover:bg-white/2 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase ${priorityColors[issue.priority]}`}
              >
                <AlertTriangle className="h-3 w-3" />
                {priorityLabel[issue.priority]}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
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
              {issue.category && (
                <IssuePill
                  label={issue.category}
                  className="border-slate-700 bg-slate-800/70 text-slate-300"
                />
              )}
              {card.standard_refs?.map((ref, i) => (
                <IssuePill
                  key={i}
                  label={ref.name}
                  className="border-indigo-500/40 bg-indigo-500/10 text-indigo-300"
                />
              ))}
            </div>
            <p className="text-sm font-semibold leading-snug text-slate-100">{issue.title}</p>
            {!expanded && (issue.description ?? card.problem?.summary) && (
              <p className="truncate text-xs text-slate-500">
                {issue.description ?? card.problem?.summary}
              </p>
            )}
          </div>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 ${
              expanded ? "rotate-180" : ""
            }`}
          />
        </div>
      </button>

      {/* ── Expanded body ─────────────────────────────────────────── */}
      {expanded && (
        <div className="space-y-4 border-t border-slate-800/60 pb-4 pl-4 pr-5 pt-3">

        {/* ── Description / summary ───────────────────────────────── */}
        {(issue.description ?? card.problem?.summary) && (
          <p className="text-sm text-slate-400">
            {issue.description ?? card.problem?.summary}
          </p>
        )}

        {/* ── Impact ──────────────────────────────────────────────── */}
        {card.impact && (
          <div>
            <IssueSectionLabel>Impact</IssueSectionLabel>
            <div className="grid gap-2 md:grid-cols-3">
              {([
                { label: "User", value: card.impact.user },
                { label: "Business", value: card.impact.business },
                { label: "Risk", value: card.impact.risk },
              ] as const).map(({ label, value }) => (
                <div
                  key={label}
                  className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2"
                >
                  <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                    {label}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-200">{value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Scope ───────────────────────────────────────────────── */}
        {(card.scope?.surfaces?.length || card.scope?.files?.length) ? (
          <div>
            <IssueSectionLabel>Scope</IssueSectionLabel>
            <div className="space-y-2">
              {card.scope?.surfaces && card.scope.surfaces.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {card.scope.surfaces.map((surface, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-slate-800/60 px-2 py-1 font-mono text-xs text-slate-300"
                    >
                      {surface.method && (
                        <span className="font-bold text-teal-400">{surface.method}</span>
                      )}
                      {surface.path}
                      <span className="text-slate-600">({surface.kind})</span>
                    </span>
                  ))}
                </div>
              )}
              {card.scope?.files && card.scope.files.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {card.scope.files.map((file, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center rounded border border-slate-700/60 bg-slate-900/60 px-2 py-1 font-mono text-[11px] text-slate-400"
                    >
                      {file.path}
                      <span className="ml-1.5 text-slate-600">
                        L{file.line_start}–{file.line_end}
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* ── Evidence ────────────────────────────────────────────── */}
        {card.problem?.evidence && card.problem.evidence.length > 0 && (
          <div>
            <IssueSectionLabel>Evidence</IssueSectionLabel>
            <div className="space-y-2">
              {card.problem.evidence.slice(0, 3).map((ev, i) => (
                <IssueCodeBlock
                  key={i}
                  path={ev.path}
                  lineStart={ev.line_start}
                  lineEnd={ev.line_end}
                  snippet={ev.snippet}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Recommendation ──────────────────────────────────────── */}
        {card.recommendation && (
          <>
            <Separator className="border-slate-800" />
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <IssueSectionLabel>Recommendation</IssueSectionLabel>
                <div className="mb-1.5 ml-auto flex gap-2">
                  <IssuePill
                    label={`Effort: ${card.recommendation.estimated_effort}`}
                    className={EFFORT_STYLES[card.recommendation.estimated_effort]}
                  />
                  <IssuePill
                    label={`Confidence: ${card.recommendation.confidence}`}
                    className={CONFIDENCE_STYLES[card.recommendation.confidence]}
                  />
                </div>
              </div>
              <p className="mb-3 text-sm text-slate-200">{card.recommendation.summary}</p>

              {card.recommendation.implementation_steps?.length > 0 && (
                <div className="mb-3">
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Implementation Steps
                  </p>
                  <ol className="list-none space-y-1.5">
                    {card.recommendation.implementation_steps.map((step, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm text-slate-300">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-slate-400">
                          {i + 1}
                        </span>
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {card.recommendation.acceptance_criteria?.length > 0 && (
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Acceptance Criteria
                  </p>
                  <ul className="list-none space-y-1">
                    {card.recommendation.acceptance_criteria.map((criterion, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />
                        {criterion}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Education ───────────────────────────────────────────── */}
        {(card.education?.why_it_matters ?? card.education?.rule_of_thumb) && (
          <>
            <Separator className="border-slate-800" />
            <div className="space-y-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-amber-500/80">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="h-3.5 w-3.5"
                  aria-hidden="true"
                >
                  <path d="M12 2a7 7 0 0 1 5.12 11.75A4.001 4.001 0 0 1 14 17.93V19a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-1.07a4.001 4.001 0 0 1-3.12-4.18A7 7 0 0 1 12 2zm1 18h-2v1h2v-1z" />
                </svg>
                Educational Context
              </p>
              {card.education.why_it_matters && (
                <div>
                  <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-500/60">
                    Why It Matters
                  </p>
                  <p className="text-sm text-slate-300">{card.education.why_it_matters}</p>
                </div>
              )}
              {card.education.rule_of_thumb && (
                <div className="flex items-start gap-2 rounded border border-amber-500/20 bg-amber-500/10 px-3 py-2">
                  <span className="mt-0.5 select-none text-base leading-none">📐</span>
                  <p className="text-sm italic text-amber-200">{card.education.rule_of_thumb}</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Status + Telemetry ──────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {card.status && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <IssuePill
                label={card.status.owner}
                className={OWNER_STYLES[card.status.owner]}
              />
              <IssuePill label="open" className="border-slate-700 bg-slate-800/60 text-slate-400" />
              <span>Created {new Date(card.status.created_at).toLocaleDateString()}</span>
            </div>
          )}
          {card.telemetry?.retrieval && (
            <button
              type="button"
              onClick={() => setTelemetryOpen((v) => !v)}
              className="text-[11px] text-slate-600 transition-colors hover:text-slate-400"
            >
              {telemetryOpen ? "▲ Hide telemetry" : "▼ Show telemetry"}
            </button>
          )}
        </div>

        {telemetryOpen && card.telemetry?.retrieval && (
          <div className="space-y-3 rounded-lg border border-slate-700/50 bg-slate-950/60 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600">
              Retrieval Telemetry
            </p>
            {card.telemetry.retrieval.rule_hits.length > 0 && (
              <div>
                <p className="mb-1 text-[10px] text-slate-600">Rule Hits</p>
                <div className="space-y-1">
                  {card.telemetry.retrieval.rule_hits.map((hit, i) => (
                    <div key={i} className="flex items-center gap-2 font-mono text-xs text-slate-500">
                      <span className="text-slate-400">{hit.control_id}</span>
                      <span className="ml-auto rounded border border-indigo-500/30 bg-indigo-500/10 px-1.5 py-0.5 text-indigo-300">
                        {(hit.score * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {card.telemetry.retrieval.code_hits.length > 0 && (
              <div>
                <p className="mb-1 text-[10px] text-slate-600">Code Hits</p>
                <div className="space-y-1">
                  {card.telemetry.retrieval.code_hits.map((hit, i) => (
                    <div key={i} className="flex items-center gap-2 font-mono text-xs text-slate-500">
                      <span className="max-w-50 truncate text-slate-400">{hit.path}</span>
                      <span className="text-slate-600">L{hit.line_start}–{hit.line_end}</span>
                      <span className="ml-auto rounded border border-teal-500/30 bg-teal-500/10 px-1.5 py-0.5 text-teal-300">
                        {(hit.score * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        </div>
      )}
    </div>
  );
}
