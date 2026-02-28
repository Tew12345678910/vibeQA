import "server-only";

import crypto from "node:crypto";
import path from "node:path";

import { z } from "zod";

import {
  normalizeRoutePath,
  resolveRoutePurpose,
  type ProjectRouter,
  type RouteCriticality,
} from "@/lib/browserqa/project-analysis";
import {
  BINARY_EXTENSIONS,
  MAX_FILE_BYTES,
  MAX_SCAN_FILES,
  SKIP_DIRECTORIES,
  TEXT_EXTENSIONS,
} from "@/lib/project-auditor/constants";
import { scanProjectFromFiles } from "@/lib/project-auditor/scanner";

type ParsedRepoUrl = {
  owner: string;
  repo: string;
  branch: string | null;
};

type GitTreeEntry = {
  path: string;
  type: "blob" | "tree" | "commit";
  sha: string;
  size?: number;
};

type GitTreePayload = {
  tree: GitTreeEntry[];
  truncated?: boolean;
};

type GitBlobPayload = {
  content?: string;
  encoding?: string;
  size?: number;
  truncated?: boolean;
};

type RouteInsight = {
  path: string;
  description: string;
  criticality: RouteCriticality;
};

type AiRouteInsight = {
  path: string;
  description: string;
  criticality?: RouteCriticality;
};

export type GithubRouteAnalysis = {
  scanId: string;
  project: {
    name: string;
    framework: string;
    router: ProjectRouter;
  };
  routes: string[];
  routeInsights: RouteInsight[];
  endpointCount: number;
};

function dateIdSegment(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function nextAnalysisScanId(): string {
  return `ANL-${dateIdSegment()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
}

function toPublicProjectName(input?: string, fallback = "my-app"): string {
  const value = (input ?? "").trim();
  return value ? value.slice(0, 120) : fallback;
}

function parseGithubRepoUrl(repoUrl: string): ParsedRepoUrl {
  const parsed = new URL(repoUrl);
  if (parsed.protocol !== "https:") {
    throw new Error("GitHub URL must use https");
  }
  if (
    parsed.hostname !== "github.com" &&
    parsed.hostname !== "www.github.com"
  ) {
    throw new Error("Only github.com repository URLs are supported");
  }

  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length < 2) {
    throw new Error("Invalid GitHub repository URL");
  }

  let branch: string | null = null;
  if ((segments[2] === "tree" || segments[2] === "blob") && segments[3]) {
    branch = decodeURIComponent(segments[3]);
  }

  return {
    owner: segments[0]!,
    repo: segments[1]!.replace(/\.git$/i, ""),
    branch,
  };
}

function githubHeaders(githubToken?: string): Record<string, string> {
  return githubToken
    ? {
        Authorization: `token ${githubToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "QA-Route-Analyzer/1.0",
      }
    : {
        Accept: "application/vnd.github+json",
        "User-Agent": "QA-Route-Analyzer/1.0",
      };
}

function shouldSkipByDirectory(filePath: string): boolean {
  const segments = filePath.split("/");
  return segments.some((segment) => SKIP_DIRECTORIES.has(segment));
}

function isBinaryByExtension(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext.length > 0 && BINARY_EXTENSIONS.has(ext);
}

function isTextCandidate(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  if (!ext) {
    const base = path.basename(filePath).toLowerCase();
    return ["dockerfile", "makefile", "readme", "license", ".env"].includes(
      base,
    );
  }
  return TEXT_EXTENSIONS.has(ext);
}

function selectCandidateBlobs(tree: GitTreeEntry[]): GitTreeEntry[] {
  return tree
    .filter((entry) => entry.type === "blob")
    .filter((entry) => !shouldSkipByDirectory(entry.path))
    .filter((entry) => !isBinaryByExtension(entry.path))
    .filter((entry) => isTextCandidate(entry.path))
    .sort((a, b) => a.path.localeCompare(b.path))
    .slice(0, MAX_SCAN_FILES);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const runner = async () => {
    while (true) {
      const current = cursor;
      cursor += 1;
      if (current >= items.length) return;
      results[current] = await worker(items[current] as T);
    }
  };

  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    () => runner(),
  );
  await Promise.all(workers);
  return results;
}

async function fetchRepoMetadata(args: {
  owner: string;
  repo: string;
  githubToken?: string;
}): Promise<{ defaultBranch: string | null }> {
  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(args.owner)}/${encodeURIComponent(args.repo)}`,
    {
      headers: githubHeaders(args.githubToken),
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Failed to load repository metadata (${response.status}): ${detail}`,
    );
  }

  const payload = (await response.json()) as { default_branch?: string };
  return {
    defaultBranch: payload.default_branch ?? null,
  };
}

async function fetchRepoTreeByRef(args: {
  owner: string;
  repo: string;
  ref: string;
  githubToken?: string;
}): Promise<GitTreeEntry[] | null> {
  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(args.owner)}/${encodeURIComponent(args.repo)}/git/trees/${encodeURIComponent(args.ref)}?recursive=1`,
    {
      headers: githubHeaders(args.githubToken),
      signal: AbortSignal.timeout(20_000),
    },
  );

  if (response.status === 404 || response.status === 409) {
    return null;
  }

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Failed to load repository tree for ref '${args.ref}' (${response.status}): ${detail}`,
    );
  }

  const payload = (await response.json()) as GitTreePayload;
  if (!Array.isArray(payload.tree)) return null;
  return payload.tree;
}

async function fetchBlobContent(args: {
  owner: string;
  repo: string;
  sha: string;
  githubToken?: string;
}): Promise<string | null> {
  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(args.owner)}/${encodeURIComponent(args.repo)}/git/blobs/${encodeURIComponent(args.sha)}`,
    {
      headers: githubHeaders(args.githubToken),
      signal: AbortSignal.timeout(20_000),
    },
  );

  if (!response.ok) return null;
  const payload = (await response.json()) as GitBlobPayload;
  if (payload.truncated) return null;
  if (typeof payload.size === "number" && payload.size > MAX_FILE_BYTES)
    return null;

  if (payload.encoding === "base64" && typeof payload.content === "string") {
    return Buffer.from(payload.content.replace(/\n/g, ""), "base64").toString(
      "utf8",
    );
  }

  if (typeof payload.content === "string") {
    return payload.content;
  }

  return null;
}

async function loadGithubSourceFiles(args: {
  repoUrl: string;
  githubToken?: string;
}): Promise<Array<{ path: string; content: string }>> {
  const parsed = parseGithubRepoUrl(args.repoUrl);
  const metadata = await fetchRepoMetadata({
    owner: parsed.owner,
    repo: parsed.repo,
    githubToken: args.githubToken,
  });

  const refCandidates = new Set<string>();
  if (parsed.branch) refCandidates.add(parsed.branch);
  if (metadata.defaultBranch) refCandidates.add(metadata.defaultBranch);
  refCandidates.add("main");
  refCandidates.add("master");

  let tree: GitTreeEntry[] | null = null;
  for (const ref of refCandidates) {
    tree = await fetchRepoTreeByRef({
      owner: parsed.owner,
      repo: parsed.repo,
      ref,
      githubToken: args.githubToken,
    });
    if (tree) break;
  }

  if (!tree) {
    throw new Error(
      "Unable to resolve repository tree. Check repository URL and branch.",
    );
  }

  const candidates = selectCandidateBlobs(tree);
  const contents = await mapWithConcurrency(
    candidates,
    8,
    async (candidate) => {
      const content = await fetchBlobContent({
        owner: parsed.owner,
        repo: parsed.repo,
        sha: candidate.sha,
        githubToken: args.githubToken,
      });
      if (content === null) return null;
      return { path: candidate.path, content };
    },
  );

  return contents.filter(
    (entry): entry is { path: string; content: string } => entry !== null,
  );
}

function detectFramework(args: {
  dependencies: string[];
  devDependencies: string[];
  router: ProjectRouter;
}): string {
  const all = new Set(
    [...args.dependencies, ...args.devDependencies].map((value) =>
      value.toLowerCase(),
    ),
  );

  const has = (...names: string[]) => names.some((name) => all.has(name));

  if (has("next")) return "nextjs";
  if (has("nuxt", "nuxt3")) return "nuxt";
  if (has("@remix-run/react", "@remix-run/node")) return "remix";
  if (has("astro")) return "astro";
  if (has("gatsby")) return "gatsby";
  if (has("@angular/core")) return "angular";
  if (has("@sveltejs/kit")) return "svelte";
  if (has("vue", "vue-router")) return "vue";
  if (has("solid-js")) return "solid";
  if (has("react", "react-dom")) return "react";
  if (has("@nestjs/core", "@nestjs/common")) return "nestjs";
  if (has("express")) return "express";

  if (args.router !== "unknown") return "nextjs";
  return "unknown";
}

function inferRouteCriticality(routePath: string): RouteCriticality {
  const pathLower = routePath.toLowerCase();
  if (
    /\/(login|signin|signup|register|auth|checkout|billing|payment|admin)\b/.test(
      pathLower,
    )
  ) {
    return "high";
  }
  if (
    /\/(dashboard|settings|profile|account|projects|runs|issues)\b/.test(
      pathLower,
    )
  ) {
    return "medium";
  }
  return "low";
}

function parseJsonFromContent(content: string): unknown {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i);
    if (!fenced?.[1]) {
      throw new Error("Failed to parse AI JSON output");
    }
    return JSON.parse(fenced[1]);
  }
}

const aiRouteInsightsSchema = z.object({
  routes: z.array(
    z.object({
      path: z.string().min(1),
      description: z.string().min(1).max(220),
      criticality: z.enum(["high", "medium", "low"]).optional(),
    }),
  ),
});

async function generateAiRouteInsights(args: {
  framework: string;
  router: ProjectRouter;
  routes: string[];
}): Promise<Map<string, AiRouteInsight>> {
  const apiKey = process.env.AI_API_KEY;
  const baseUrl = (
    process.env.AI_BASE_URL ?? "https://api.openai.com/v1"
  ).replace(/\/$/, "");
  if (!apiKey || args.routes.length === 0) {
    return new Map();
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.AI_CHAT_MODEL ?? "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a software QA analyst. Return strict JSON only. For each route, provide concise purpose and criticality. Never add routes that were not provided.",
        },
        {
          role: "user",
          content: JSON.stringify({
            framework: args.framework,
            router: args.router,
            routes: args.routes.slice(0, 250),
            schema: {
              routes: [
                {
                  path: "/example",
                  description:
                    "Short, specific purpose of this page and user intent.",
                  criticality: "high",
                },
              ],
            },
          }),
        },
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    return new Map();
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) return new Map();

  try {
    const parsed = aiRouteInsightsSchema.parse(parseJsonFromContent(content));
    const byPath = new Map<string, AiRouteInsight>();
    for (const route of parsed.routes) {
      const normalizedPath = normalizeRoutePath(route.path);
      byPath.set(normalizedPath, {
        path: normalizedPath,
        description: route.description.trim(),
        criticality: route.criticality,
      });
    }
    return byPath;
  } catch {
    return new Map();
  }
}

export async function analyzeGithubRoutesAndFramework(args: {
  repoUrl: string;
  projectName?: string;
  githubToken?: string;
}): Promise<GithubRouteAnalysis> {
  const parsedRepo = parseGithubRepoUrl(args.repoUrl);
  const sourceFiles = await loadGithubSourceFiles({
    repoUrl: args.repoUrl,
    githubToken: args.githubToken,
  });

  const scan = await scanProjectFromFiles({
    files: sourceFiles,
    projectNameHint: toPublicProjectName(args.projectName, parsedRepo.repo),
  });

  const framework = detectFramework({
    dependencies: scan.detectedStack.dependencies,
    devDependencies: scan.detectedStack.devDependencies,
    router: scan.scorecard.project.router,
  });

  const normalizedRoutes = Array.from(
    new Set(scan.uiRoutes.map((route) => normalizeRoutePath(route))),
  ).sort();

  const aiInsights = await generateAiRouteInsights({
    framework,
    router: scan.scorecard.project.router,
    routes: normalizedRoutes,
  });

  const routeInsights = normalizedRoutes.map((routePath) => {
    const aiInsight = aiInsights.get(routePath);
    return {
      path: routePath,
      description: resolveRoutePurpose(routePath, aiInsight?.description),
      criticality: aiInsight?.criticality ?? inferRouteCriticality(routePath),
    } satisfies RouteInsight;
  });

  return {
    scanId: nextAnalysisScanId(),
    project: {
      name: toPublicProjectName(args.projectName, scan.scorecard.project.name),
      framework,
      router: scan.scorecard.project.router,
    },
    routes: normalizedRoutes,
    routeInsights,
    endpointCount: scan.scorecard.endpoints.length,
  };
}
