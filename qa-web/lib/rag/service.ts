import crypto from "node:crypto";
import path from "node:path";

import { getDbClient } from "@/lib/db/client";
import { embedText, generateIssueCard } from "@/lib/ai/openai";

type RuleRow = {
  id: string;
  title: string;
  category: string;
  priority: string;
  description: string;
  contents: Record<string, unknown>;
};

type CodeChunkRow = {
  path: string;
  line_start: number;
  line_end: number;
  chunk_text: string;
};

type RouteInsight = {
  path: string;
  description: string;
  criticality: "high" | "medium" | "low";
};

type RagIssueCard = {
  id: string;
  source: "nextjs-api";
  title: string;
  priority: "P0" | "P1" | "P2";
  category: string;
  standard_refs: Array<{
    name: string;
    type: "internal" | "standard";
    url?: string;
  }>;
  impact: {
    user: string;
    business: string;
    risk: string;
  };
  scope: {
    surfaces: Array<{
      kind: "endpoint" | "route";
      path: string;
      method?: string;
    }>;
    files: Array<{ path: string; line_start: number; line_end: number }>;
  };
  problem: {
    summary: string;
    evidence: Array<{
      type: "code";
      path: string;
      line_start: number;
      line_end: number;
      snippet: string;
    }>;
  };
  recommendation: {
    summary: string;
    implementation_steps: string[];
    acceptance_criteria: string[];
    estimated_effort: "S" | "M" | "L";
    confidence: "high" | "medium" | "low";
  };
  education: {
    why_it_matters: string;
    rule_of_thumb: string;
  };
  status: {
    state: "open";
    owner: "backend" | "fullstack";
    created_at: string;
    updated_at: string;
  };
};

type AuditFinding = {
  issueId: string;
  controlId: string;
  card: RagIssueCard;
  filePath: string;
  endpoint: string | null;
  confidence: "high" | "medium" | "low";
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
  truncated?: boolean;
  size?: number;
};

type ParsedRepoUrl = {
  owner: string;
  repo: string;
  branch: string | null;
};

type IndexRepoResult = {
  repoFull: string;
  commitSha: string;
  endpointCount: number;
  routes: string[];
  routeInsights: RouteInsight[];
  /** Number of source files indexed into code_chunks for this commit. */
  indexedFileCount: number;
};

type AuditRepoInput = {
  projectId?: string;
  runId?: string;
  repoUrl: string;
  projectName?: string;
  githubToken?: string;
};

type AuditRepoOutput = {
  scanId: string;
  repoFull: string;
  commitSha: string;
  endpointCount: number;
  /** Number of source files that were indexed into code_chunks. */
  indexedFileCount: number;
  routes: string[];
  routeInsights: RouteInsight[];
  cards: Array<{
    id: string;
    source: "github";
    title: string;
    priority: "P0" | "P1" | "P2";
    category: string;
    description: string;
    card: RagIssueCard;
  }>;
  counts: {
    p0: number;
    p1: number;
    p2: number;
    total: number;
  };
};

const MAX_SOURCE_FILES = 700;
const MAX_AUDIT_CHUNKS = 120;
const RULE_MATCH_COUNT = 6;
const CODE_MATCH_COUNT = 10;
const CODE_CHUNK_SIZE = 200;
const CODE_CHUNK_OVERLAP = 30;

const ISSUE_CARD_SCHEMA_PROMPT = `
Return ONLY valid JSON object or null.

JSON schema:
{
  "id": "<control_id from RETRIEVED_RULES>",
  "source": "nextjs-api",
  "title": "string",
  "priority": "P0|P1|P2",
  "category": "string",
  "standard_refs": [{"name": "string", "type": "internal|standard", "url": "optional"}],
  "impact": {"user": "string", "business": "string", "risk": "string"},
  "scope": {
    "surfaces": [{"kind": "endpoint|route", "path": "string", "method": "optional"}],
    "files": [{"path": "string", "line_start": 1, "line_end": 1}]
  },
  "problem": {
    "summary": "string",
    "evidence": [{
      "type": "code",
      "path": "string",
      "line_start": 1,
      "line_end": 1,
      "snippet": "string"
    }]
  },
  "recommendation": {
    "summary": "string",
    "implementation_steps": ["string"],
    "acceptance_criteria": ["string"],
    "estimated_effort": "S|M|L",
    "confidence": "high|medium|low"
  },
  "education": {"why_it_matters": "string", "rule_of_thumb": "string"},
  "status": {
    "state": "open",
    "owner": "backend|fullstack",
    "created_at": "ISO-8601",
    "updated_at": "ISO-8601"
  }
}

Rules:
- Evidence MUST reference provided code chunks only.
- If no concrete static evidence with file + line + snippet exists, return null.
- id MUST be one of retrieved control_id values.
- Do not output markdown.
`;

function nextScanId(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `SCAN-${y}${m}${d}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
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

function githubHeaders(token?: string): Record<string, string> {
  if (!token) {
    return {
      Accept: "application/vnd.github+json",
      "User-Agent": "QA-RAG-Auditor/1.0",
    };
  }

  return {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "QA-RAG-Auditor/1.0",
  };
}

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function normalizePriority(priority: string): "P0" | "P1" | "P2" {
  const value = priority.toUpperCase();
  if (value === "P0") return "P0";
  if (value === "P1") return "P1";
  return "P2";
}

function chunkByLines(
  content: string,
): Array<{ chunkText: string; lineStart: number; lineEnd: number }> {
  const lines = content.split(/\r?\n/);
  const chunks: Array<{
    chunkText: string;
    lineStart: number;
    lineEnd: number;
  }> = [];

  let index = 0;
  while (index < lines.length) {
    const start = index;
    const end = Math.min(index + CODE_CHUNK_SIZE, lines.length);
    chunks.push({
      chunkText: lines.slice(start, end).join("\n"),
      lineStart: start + 1,
      lineEnd: end,
    });

    index = end - CODE_CHUNK_OVERLAP;
    if (index <= start) {
      index = end;
    }
  }

  return chunks;
}

function isSkippablePath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  const skipPrefixes = [
    "node_modules/",
    ".next/",
    "dist/",
    "build/",
    "coverage/",
    "out/",
  ];
  if (skipPrefixes.some((prefix) => normalized.startsWith(prefix))) return true;

  if (/\.(test|spec|e2e)\.(t|j)sx?$/i.test(normalized)) return true;
  return false;
}

function isSourceCandidate(filePath: string): boolean {
  if (isSkippablePath(filePath)) return false;

  const ext = path.extname(filePath).toLowerCase();
  const allowExt = new Set([
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".mts",
    ".cts",
  ]);
  if (!allowExt.has(ext)) return false;

  const lower = filePath.toLowerCase();

  // Always include any file that lives under an api/ directory or is an
  // explicit Next.js / Express / NestJS route/action handler.
  if (lower.includes("/api/")) return true;
  if (/\/pages\/api\//.test(lower)) return true;

  // Common backend file name stems.
  const backendKeywords = [
    "controller",
    "middleware",
    "guard",
    "auth",
    "validator",
    "schema",
    "schemas",
    "dto",
    "router",
    "server",
    "service",
    "services",
    "repository",
    "repositories",
    "action", // Next.js server actions
    "actions",
    "handler",
    "handlers",
    "helper",
    "helpers",
    "hook", // SWR / React Query hooks that call APIs
    "hooks",
    "resolver", // GraphQL resolvers
    "resolvers",
    "mutation",
    "mutations",
    "query",
    "queries",
    "interceptor",
    "interceptors",
    "policy",
    "policies",
    "permission",
    "permissions",
    "event",
    "events",
    "gateway",
    "gateways",
    "provider",
    "providers",
    "config", // server config / env types
    "utils", // utilities that may call external APIs
    "util",
    "lib", // general library code
  ];

  const basename = path.basename(lower, ext);
  for (const kw of backendKeywords) {
    if (
      basename === kw ||
      basename.endsWith(`-${kw}`) ||
      basename.endsWith(`.${kw}`)
    ) {
      return true;
    }
    if (lower.includes(`/${kw}/`) || lower.includes(`/${kw}s/`)) return true;
  }

  // Top-level entry points
  if (
    lower.endsWith("main.ts") ||
    lower.endsWith("main.js") ||
    lower.endsWith("app.ts") ||
    lower.endsWith("app.js") ||
    lower.endsWith("server.ts") ||
    lower.endsWith("server.js") ||
    lower.endsWith("index.ts") ||
    lower.endsWith("index.js")
  ) {
    return true;
  }

  return false;
}

function isAuditTargetChunk(chunk: CodeChunkRow): boolean {
  const lower = chunk.path.toLowerCase();
  if (lower.includes("/api/")) return true;
  if (lower.endsWith(".controller.ts")) return true;
  if (lower.includes("middleware") || lower.includes("guard")) return true;
  if (lower.includes("auth")) return true;

  return /\b(router\.|fastify\.|@controller|@useguards|nextresponse|res\.status|req\.query|findmany|findunique|jwt\.)/i.test(
    chunk.chunk_text,
  );
}

function inferEndpointFromPath(filePath: string): string | null {
  if (filePath.startsWith("app/api/") && /\/route\.(t|j)sx?$/.test(filePath)) {
    const routePath = filePath
      .replace(/^app\/api\//, "")
      .replace(/\/route\.(t|j)sx?$/, "")
      .split("/")
      .map((segment) => segment.replace(/^\[(.+)\]$/, ":$1"))
      .join("/");
    return `/api/${routePath}`.replace(/\/+/g, "/");
  }

  if (filePath.startsWith("pages/api/") && /\.(t|j)sx?$/.test(filePath)) {
    const routePath = filePath
      .replace(/^pages\/api\//, "")
      .replace(/\.(t|j)sx?$/, "")
      .replace(/\/index$/i, "")
      .split("/")
      .map((segment) => segment.replace(/^\[(.+)\]$/, ":$1"))
      .join("/");
    return `/api/${routePath}`.replace(/\/+/g, "/");
  }

  return null;
}

function buildRouteInsights(paths: string[]): {
  routes: string[];
  insights: RouteInsight[];
} {
  const endpoints = Array.from(
    new Set(
      paths.map((p) => inferEndpointFromPath(p)).filter(Boolean) as string[],
    ),
  ).sort();

  const insights = endpoints.map((endpoint) => {
    const criticality: "high" | "medium" | "low" =
      /auth|login|payment|checkout|admin|token/i.test(endpoint)
        ? "high"
        : /user|account|order|invoice/i.test(endpoint)
          ? "medium"
          : "low";

    return {
      path: endpoint,
      description: `API surface discovered at ${endpoint}`,
      criticality,
    } satisfies RouteInsight;
  });

  return {
    routes: endpoints,
    insights,
  };
}

async function fetchRepoMetadata(args: {
  owner: string;
  repo: string;
  githubToken?: string;
}): Promise<{ defaultBranch: string | null }> {
  const response = await fetch(
    `https://api.github.com/repos/${args.owner}/${args.repo}`,
    {
      headers: githubHeaders(args.githubToken),
      signal: AbortSignal.timeout(20_000),
    },
  );

  if (response.ok) {
    const payload = (await response.json()) as { default_branch?: string };
    return {
      defaultBranch:
        typeof payload.default_branch === "string"
          ? payload.default_branch
          : null,
    };
  }

  if (response.status === 404) {
    if (!args.githubToken) {
      throw new Error(
        "Repository not accessible. Provide GitHub token for private repositories.",
      );
    }
    throw new Error("Repository not found or token has no access.");
  }

  if (response.status === 401) {
    throw new Error("GitHub token is invalid or expired.");
  }

  if (response.status === 403) {
    throw new Error(
      "GitHub API access denied (403). Check scopes and rate limits.",
    );
  }

  throw new Error(`GitHub repository lookup failed (${response.status}).`);
}

async function fetchRepoTreeByRef(args: {
  owner: string;
  repo: string;
  ref: string;
  githubToken?: string;
}): Promise<GitTreeEntry[] | null> {
  const response = await fetch(
    `https://api.github.com/repos/${args.owner}/${args.repo}/git/trees/${encodeURIComponent(args.ref)}?recursive=1`,
    {
      headers: githubHeaders(args.githubToken),
      signal: AbortSignal.timeout(30_000),
    },
  );

  if (response.ok) {
    const payload = (await response.json()) as GitTreePayload;
    if (payload.truncated) {
      throw new Error(
        "Repository tree is too large for recursive GitHub tree API.",
      );
    }
    return payload.tree ?? [];
  }

  if (response.status === 404) return null;
  if (response.status === 409)
    throw new Error("Repository is empty or unavailable for tree scan.");
  if (response.status === 401)
    throw new Error("GitHub token is invalid or expired.");

  throw new Error(
    `GitHub tree API failed (${response.status}) for ref '${args.ref}'.`,
  );
}

async function fetchCommitSha(args: {
  owner: string;
  repo: string;
  ref: string;
  githubToken?: string;
}): Promise<string> {
  const response = await fetch(
    `https://api.github.com/repos/${args.owner}/${args.repo}/commits/${encodeURIComponent(args.ref)}`,
    {
      headers: githubHeaders(args.githubToken),
      signal: AbortSignal.timeout(20_000),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to resolve commit SHA (${response.status}) for ref '${args.ref}'.`,
    );
  }

  const payload = (await response.json()) as { sha?: string };
  if (!payload.sha) {
    throw new Error("Commit SHA is missing from GitHub response.");
  }

  return payload.sha;
}

async function fetchBlobContent(args: {
  owner: string;
  repo: string;
  sha: string;
  githubToken?: string;
}): Promise<string | null> {
  const response = await fetch(
    `https://api.github.com/repos/${args.owner}/${args.repo}/git/blobs/${encodeURIComponent(args.sha)}`,
    {
      headers: githubHeaders(args.githubToken),
      signal: AbortSignal.timeout(30_000),
    },
  );

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`GitHub blob API failed (${response.status}).`);
  }

  const payload = (await response.json()) as GitBlobPayload;
  if (payload.truncated) return null;

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

export async function indexRulesIfNeeded(): Promise<void> {
  const db = getDbClient();

  const { data: rules, error: rulesError } = await db
    .from("rules")
    .select("id, title, category, priority, description, contents")
    .eq("enabled", true)
    .order("id", { ascending: true });

  if (rulesError) {
    throw new Error(`Failed to load rules: ${rulesError.message}`);
  }

  const activeRules = (rules ?? []) as RuleRow[];
  if (activeRules.length === 0) return;

  const ids = activeRules.map((rule) => rule.id);
  const { data: existing, error: existingError } = await db
    .from("control_chunks")
    .select("control_id, metadata")
    .in("control_id", ids);

  if (existingError) {
    throw new Error(
      `Failed to inspect control chunk index: ${existingError.message}`,
    );
  }

  const existingById = new Map<string, string>();
  for (const row of existing ?? []) {
    const value = row as {
      control_id: string;
      metadata?: Record<string, unknown>;
    };
    const hash =
      typeof value.metadata?.rule_hash === "string"
        ? value.metadata.rule_hash
        : "";
    if (value.control_id) {
      existingById.set(value.control_id, hash);
    }
  }

  const rowsToUpsert: Array<{
    control_id: string;
    chunk_text: string;
    metadata: Record<string, unknown>;
    embedding: number[];
  }> = [];

  const embeddingModel =
    process.env.AI_EMBEDDING_MODEL ?? "text-embedding-3-small";

  for (const rule of activeRules) {
    const chunkText = [
      `ID: ${rule.id}`,
      `Title: ${rule.title}`,
      `Category: ${rule.category}`,
      `Priority: ${rule.priority}`,
      `Description: ${rule.description}`,
      "",
      `Contents: ${JSON.stringify(rule.contents ?? {}, null, 2)}`,
    ].join("\n");

    // Include the model name in the hash so switching embedding models
    // always triggers re-indexing even if rule text hasn't changed.
    const ruleHash = sha256(`${chunkText}\n__model__:${embeddingModel}`);
    if (existingById.get(rule.id) === ruleHash) {
      continue;
    }

    const embedding = await embedText(chunkText);
    rowsToUpsert.push({
      control_id: rule.id,
      chunk_text: chunkText,
      metadata: {
        rule_hash: ruleHash,
        embedding_model: embeddingModel,
        category: rule.category,
        priority: rule.priority,
        title: rule.title,
      },
      embedding,
    });
  }

  if (rowsToUpsert.length === 0) return;

  const { error: upsertError } = await db
    .from("control_chunks")
    .upsert(rowsToUpsert, { onConflict: "control_id" });

  if (upsertError) {
    throw new Error(`Failed to upsert rule chunks: ${upsertError.message}`);
  }
}

export async function indexRepoCommit(args: {
  repoUrl: string;
  githubToken?: string;
}): Promise<IndexRepoResult> {
  const db = getDbClient();
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

  let selectedRef: string | null = null;
  let tree: GitTreeEntry[] | null = null;

  for (const ref of refCandidates) {
    const nextTree = await fetchRepoTreeByRef({
      owner: parsed.owner,
      repo: parsed.repo,
      ref,
      githubToken: args.githubToken,
    });
    if (nextTree) {
      selectedRef = ref;
      tree = nextTree;
      break;
    }
  }

  if (!selectedRef || !tree) {
    throw new Error(
      "Unable to resolve repository tree. Check repository URL and branch.",
    );
  }

  const commitSha = await fetchCommitSha({
    owner: parsed.owner,
    repo: parsed.repo,
    ref: selectedRef,
    githubToken: args.githubToken,
  });

  const repoFull = `${parsed.owner}/${parsed.repo}`;
  const embeddingModel =
    process.env.AI_EMBEDDING_MODEL ?? "text-embedding-3-small";

  const { data: existingRows, error: countError } = await db
    .from("code_chunks")
    .select("metadata")
    .eq("repo", repoFull)
    .eq("commit_sha", commitSha)
    .limit(1);

  if (countError) {
    throw new Error(
      `Failed to inspect code chunk index: ${countError.message}`,
    );
  }

  const existingRow =
    (
      (existingRows ?? []) as Array<{ metadata?: Record<string, unknown> }>
    )[0] ?? null;
  const storedModel = existingRow?.metadata?.embedding_model;

  // If chunks were indexed with a different model, clear them so they get
  // re-embedded with the current model.
  if (existingRow && storedModel !== embeddingModel) {
    const { error: deleteError } = await db
      .from("code_chunks")
      .delete()
      .eq("repo", repoFull)
      .eq("commit_sha", commitSha);
    if (deleteError) {
      throw new Error(
        `Failed to clear stale code chunks: ${deleteError.message}`,
      );
    }
  }

  const hasCurrentChunks =
    existingRow !== null && storedModel === embeddingModel;

  const candidateFiles = tree
    .filter((entry) => entry.type === "blob" && isSourceCandidate(entry.path))
    .sort((a, b) => a.path.localeCompare(b.path))
    .slice(0, MAX_SOURCE_FILES);

  if (!hasCurrentChunks && candidateFiles.length > 0) {
    const blobContents = await mapWithConcurrency(
      candidateFiles,
      8,
      async (entry) => {
        const content = await fetchBlobContent({
          owner: parsed.owner,
          repo: parsed.repo,
          sha: entry.sha,
          githubToken: args.githubToken,
        });
        if (!content) return null;
        return { path: entry.path, content };
      },
    );

    const rowsToInsert: Array<{
      repo: string;
      commit_sha: string;
      path: string;
      line_start: number;
      line_end: number;
      chunk_text: string;
      metadata: Record<string, unknown>;
      embedding: number[];
    }> = [];

    for (const file of blobContents) {
      if (!file) continue;
      const chunks = chunkByLines(file.content);

      for (const chunk of chunks) {
        const embedding = await embedText(
          `FILE: ${file.path}\nLINES: ${chunk.lineStart}-${chunk.lineEnd}\n\n${chunk.chunkText}`,
        );

        rowsToInsert.push({
          repo: repoFull,
          commit_sha: commitSha,
          path: file.path,
          line_start: chunk.lineStart,
          line_end: chunk.lineEnd,
          chunk_text: chunk.chunkText,
          metadata: {
            ref: selectedRef,
            embedding_model: embeddingModel,
          },
          embedding,
        });

        if (rowsToInsert.length >= 60) {
          const { error } = await db.from("code_chunks").insert(rowsToInsert);
          if (error) {
            throw new Error(`Failed to insert code chunks: ${error.message}`);
          }
          rowsToInsert.length = 0;
        }
      }
    }

    if (rowsToInsert.length > 0) {
      const { error } = await db.from("code_chunks").insert(rowsToInsert);
      if (error) {
        throw new Error(`Failed to insert code chunks: ${error.message}`);
      }
    }
  }

  const { data: allPathsRows, error: pathError } = await db
    .from("code_chunks")
    .select("path")
    .eq("repo", repoFull)
    .eq("commit_sha", commitSha);

  if (pathError) {
    throw new Error(
      `Failed to load indexed code chunk paths: ${pathError.message}`,
    );
  }

  const allPaths = Array.from(
    new Set(
      (allPathsRows ?? []).map((row) => String((row as { path: string }).path)),
    ),
  );
  const routeData = buildRouteInsights(allPaths);

  return {
    repoFull,
    commitSha,
    endpointCount: routeData.routes.length,
    routes: routeData.routes,
    routeInsights: routeData.insights,
    indexedFileCount: allPaths.length,
  };
}

function extractJson(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (value === "null") return "null";

  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start >= 0 && end >= start) {
    return value.slice(start, end + 1);
  }

  return null;
}

function parseIssueCard(rawText: string): RagIssueCard | null {
  const candidate = extractJson(rawText);
  if (!candidate || candidate === "null") return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  const card = parsed as Partial<RagIssueCard>;

  if (typeof card.id !== "string" || !card.id.trim()) return null;
  if (typeof card.title !== "string" || !card.title.trim()) return null;

  const priority = normalizePriority(String(card.priority ?? "P2"));
  const evidence = card.problem?.evidence;
  if (!Array.isArray(evidence) || evidence.length === 0) return null;

  const now = new Date().toISOString();

  const normalizedEvidence = evidence
    .map((entry) => {
      const value = entry as {
        path?: unknown;
        line_start?: unknown;
        line_end?: unknown;
        snippet?: unknown;
      };
      const lineStart = Number(value.line_start ?? 1);
      const lineEnd = Number(value.line_end ?? lineStart);
      return {
        type: "code" as const,
        path: typeof value.path === "string" ? value.path : "",
        line_start: Number.isFinite(lineStart)
          ? Math.max(1, Math.floor(lineStart))
          : 1,
        line_end: Number.isFinite(lineEnd)
          ? Math.max(1, Math.floor(lineEnd))
          : 1,
        snippet: typeof value.snippet === "string" ? value.snippet : "",
      };
    })
    .filter((entry) => entry.path && entry.snippet)
    .slice(0, 6);

  if (normalizedEvidence.length === 0) return null;

  return {
    id: card.id.trim(),
    source: "nextjs-api",
    title: card.title.trim(),
    priority,
    category: String(card.category ?? "Security").trim() || "Security",
    standard_refs: Array.isArray(card.standard_refs)
      ? card.standard_refs
          .map((ref) => {
            const value = ref as {
              name?: unknown;
              type?: unknown;
              url?: unknown;
            };
            const name =
              typeof value.name === "string" ? value.name : "Internal Rule";
            const type: "internal" | "standard" =
              value.type === "standard" ? "standard" : "internal";
            const url = typeof value.url === "string" ? value.url : undefined;
            return { name, type, url };
          })
          .slice(0, 5)
      : [],
    impact: {
      user: String(
        card.impact?.user ??
          "Potential reliability and security risk for users.",
      ),
      business: String(
        card.impact?.business ??
          "Increases operational and security incident risk.",
      ),
      risk: String(
        card.impact?.risk ?? "Control gap can be exploited in production.",
      ),
    },
    scope: {
      surfaces: Array.isArray(card.scope?.surfaces)
        ? card.scope.surfaces
            .map((surface) => {
              const value = surface as {
                kind?: unknown;
                path?: unknown;
                method?: unknown;
              };
              const kind: "endpoint" | "route" =
                value.kind === "route" ? "route" : "endpoint";
              const endpointPath =
                typeof value.path === "string" ? value.path : "/api/*";
              const method =
                typeof value.method === "string" ? value.method : undefined;
              return { kind, path: endpointPath, method };
            })
            .slice(0, 5)
        : [],
      files: Array.isArray(card.scope?.files)
        ? card.scope.files
            .map((file) => {
              const value = file as {
                path?: unknown;
                line_start?: unknown;
                line_end?: unknown;
              };
              const filePath = typeof value.path === "string" ? value.path : "";
              const lineStart = Number(value.line_start ?? 1);
              const lineEnd = Number(value.line_end ?? lineStart);
              return {
                path: filePath,
                line_start: Number.isFinite(lineStart)
                  ? Math.max(1, Math.floor(lineStart))
                  : 1,
                line_end: Number.isFinite(lineEnd)
                  ? Math.max(1, Math.floor(lineEnd))
                  : 1,
              };
            })
            .filter((file) => file.path)
            .slice(0, 8)
        : [],
    },
    problem: {
      summary: String(
        card.problem?.summary ?? "Static security issue detected.",
      ),
      evidence: normalizedEvidence,
    },
    recommendation: {
      summary: String(
        card.recommendation?.summary ??
          "Apply secure coding remediation for this rule.",
      ),
      implementation_steps: Array.isArray(
        card.recommendation?.implementation_steps,
      )
        ? card.recommendation.implementation_steps
            .map((step) => String(step))
            .filter(Boolean)
            .slice(0, 8)
        : [
            "Implement remediation in the affected handler and supporting middleware.",
          ],
      acceptance_criteria: Array.isArray(
        card.recommendation?.acceptance_criteria,
      )
        ? card.recommendation.acceptance_criteria
            .map((step) => String(step))
            .filter(Boolean)
            .slice(0, 8)
        : ["Automated checks pass and issue no longer reproduces."],
      estimated_effort:
        card.recommendation?.estimated_effort === "L" ||
        card.recommendation?.estimated_effort === "M"
          ? card.recommendation.estimated_effort
          : "S",
      confidence:
        card.recommendation?.confidence === "high" ||
        card.recommendation?.confidence === "low"
          ? card.recommendation.confidence
          : "medium",
    },
    education: {
      why_it_matters: String(
        card.education?.why_it_matters ??
          "Security controls reduce exploitability and operational risk.",
      ),
      rule_of_thumb: String(
        card.education?.rule_of_thumb ??
          "Validate inputs and enforce least privilege by default.",
      ),
    },
    status: {
      state: "open",
      owner: card.status?.owner === "fullstack" ? "fullstack" : "backend",
      created_at: card.status?.created_at ?? now,
      updated_at: card.status?.updated_at ?? now,
    },
  };
}

function evidenceIsGrounded(
  card: RagIssueCard,
  codeHits: CodeChunkRow[],
): boolean {
  if (card.problem.evidence.length === 0) return false;

  return card.problem.evidence.every((evidence) => {
    return codeHits.some((chunk) => {
      if (chunk.path !== evidence.path) return false;
      if (
        evidence.line_end < chunk.line_start ||
        evidence.line_start > chunk.line_end
      )
        return false;

      const snippet = evidence.snippet.trim();
      if (!snippet) return false;

      const normalizedChunk = chunk.chunk_text.replace(/\s+/g, " ");
      const normalizedSnippet = snippet.replace(/\s+/g, " ").slice(0, 180);
      return normalizedChunk.includes(normalizedSnippet);
    });
  });
}

function createIssueId(
  controlId: string,
  filePath: string,
  lineStart: number,
  lineEnd: number,
): string {
  const hash = sha256(`${controlId}|${filePath}|${lineStart}|${lineEnd}`).slice(
    0,
    12,
  );
  return `${controlId}-${hash}`;
}

function toRunCounts(findings: AuditFinding[]): {
  p0: number;
  p1: number;
  p2: number;
  total: number;
} {
  const p0 = findings.filter(
    (finding) => finding.card.priority === "P0",
  ).length;
  const p1 = findings.filter(
    (finding) => finding.card.priority === "P1",
  ).length;
  const p2 = findings.filter(
    (finding) => finding.card.priority === "P2",
  ).length;
  return { p0, p1, p2, total: findings.length };
}

async function upsertRun(args: {
  projectId: string;
  runId: string;
  counts: { p0: number; p1: number; p2: number; total: number };
  metaJson: Record<string, unknown>;
}): Promise<void> {
  const db = getDbClient();

  const { error } = await db.from("project_runs").upsert(
    {
      id: args.runId,
      project_id: args.projectId,
      count_p0: args.counts.p0,
      count_p1: args.counts.p1,
      count_p2: args.counts.p2,
      count_total: args.counts.total,
      meta_json: args.metaJson,
      created_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (error) {
    throw new Error(`Failed to upsert project run: ${error.message}`);
  }
}

async function upsertRunIssue(args: {
  projectId: string;
  runId: string;
  finding: AuditFinding;
}): Promise<void> {
  const db = getDbClient();

  const { error } = await db.from("run_issues").upsert(
    {
      run_id: args.runId,
      project_id: args.projectId,
      issue_id: args.finding.issueId,
      source: "github",
      title: args.finding.card.title,
      priority: args.finding.card.priority,
      category: args.finding.card.category,
      description: args.finding.card.problem.summary,
      card_json: args.finding.card,
      file_path: args.finding.filePath,
      endpoint: args.finding.endpoint,
      confidence: args.finding.confidence,
      state: "open",
    },
    { onConflict: "run_id,issue_id" },
  );

  if (error) {
    throw new Error(`Failed to upsert run issue: ${error.message}`);
  }
}

export async function auditRepoWithRag(
  input: AuditRepoInput,
): Promise<AuditRepoOutput> {
  const scanId = nextScanId();
  await indexRulesIfNeeded();

  const indexed = await indexRepoCommit({
    repoUrl: input.repoUrl,
    githubToken: input.githubToken,
  });

  const db = getDbClient();

  const { data: chunkRows, error: chunkError } = await db
    .from("code_chunks")
    .select("path, line_start, line_end, chunk_text")
    .eq("repo", indexed.repoFull)
    .eq("commit_sha", indexed.commitSha)
    .order("path", { ascending: true })
    .order("line_start", { ascending: true });

  if (chunkError) {
    throw new Error(
      `Failed to load indexed code chunks: ${chunkError.message}`,
    );
  }

  const allChunks = (chunkRows ?? []) as CodeChunkRow[];
  const targetChunks = allChunks
    .filter(isAuditTargetChunk)
    .slice(0, MAX_AUDIT_CHUNKS);

  const findings: AuditFinding[] = [];
  const dedupe = new Set<string>();

  if (input.projectId && input.runId) {
    // Upsert the project row first to satisfy the FK on project_runs(project_id).
    // Without this, upsertRun fails with a FK constraint violation if the project
    // was only saved to localStorage on the client and never reached the DB.
    const { error: projUpsertError } = await db.from("projects").upsert(
      {
        id: input.projectId,
        name: input.projectName ?? indexed.repoFull,
        source_type: "github",
        github_repo: input.repoUrl,
        base_url: "",
        config_json: {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (projUpsertError) {
      throw new Error(
        `Failed to upsert project before run: ${projUpsertError.message}`,
      );
    }

    await upsertRun({
      projectId: input.projectId,
      runId: input.runId,
      counts: { p0: 0, p1: 0, p2: 0, total: 0 },
      metaJson: {
        status: "running",
        scanner: "rag-openai",
        repo: indexed.repoFull,
        commit_sha: indexed.commitSha,
        project_name: input.projectName ?? null,
        indexed_files: indexed.indexedFileCount,
        processed_chunks: 0,
        total_chunks: targetChunks.length,
      },
    });
  }

  let processedChunks = 0;

  for (const chunk of targetChunks) {
    processedChunks += 1;

    try {
      const queryEmbedding = await embedText(
        `AUDIT TARGET\nFILE: ${chunk.path}\nLINES: ${chunk.line_start}-${chunk.line_end}\n\n${chunk.chunk_text}`,
      );

      const { data: ruleHits, error: ruleError } = await db.rpc(
        "match_control_chunks",
        {
          query_embedding: queryEmbedding,
          match_count: RULE_MATCH_COUNT,
        },
      );
      if (ruleError) {
        throw new Error(ruleError.message);
      }

      const { data: codeHitsRaw, error: codeError } = await db.rpc(
        "match_code_chunks",
        {
          query_embedding: queryEmbedding,
          repo_filter: indexed.repoFull,
          commit_filter: indexed.commitSha,
          match_count: CODE_MATCH_COUNT,
        },
      );
      if (codeError) {
        throw new Error(codeError.message);
      }

      const codeHits = (codeHitsRaw ?? []).map((row: unknown) => {
        const value = row as Record<string, unknown>;
        return {
          path: String(value.path ?? ""),
          line_start: Number(value.line_start ?? 1),
          line_end: Number(value.line_end ?? 1),
          chunk_text: String(value.chunk_text ?? ""),
        } satisfies CodeChunkRow;
      });

      if ((ruleHits ?? []).length === 0 || codeHits.length === 0) {
        continue;
      }

      const prompt = [
        ISSUE_CARD_SCHEMA_PROMPT,
        "",
        "RETRIEVED_RULES:",
        JSON.stringify(ruleHits, null, 2),
        "",
        "RETRIEVED_CODE_CHUNKS:",
        JSON.stringify(codeHits, null, 2),
        "",
        "TASK:",
        "- Output ONE issue card if a concrete static issue exists.",
        "- Otherwise output null.",
      ].join("\n");

      const modelRaw = await generateIssueCard(prompt);
      const card = parseIssueCard(modelRaw);
      if (!card) {
        if (input.projectId && input.runId) {
          await upsertRun({
            projectId: input.projectId,
            runId: input.runId,
            counts: toRunCounts(findings),
            metaJson: {
              status: "running",
              scanner: "rag-openai",
              repo: indexed.repoFull,
              commit_sha: indexed.commitSha,
              project_name: input.projectName ?? null,
              processed_chunks: processedChunks,
              total_chunks: targetChunks.length,
            },
          });
        }
        continue;
      }

      const controlIds = new Set(
        (ruleHits ?? []).map((row: unknown) =>
          String((row as Record<string, unknown>).control_id ?? ""),
        ),
      );
      if (!controlIds.has(card.id)) {
        continue;
      }

      if (!evidenceIsGrounded(card, codeHits)) {
        continue;
      }

      const primaryEvidence = card.problem.evidence[0]!;
      const dedupeKey = `${card.id}|${primaryEvidence.path}|${primaryEvidence.line_start}|${primaryEvidence.line_end}`;
      if (dedupe.has(dedupeKey)) {
        continue;
      }
      dedupe.add(dedupeKey);

      const issueId = createIssueId(
        card.id,
        primaryEvidence.path,
        primaryEvidence.line_start,
        primaryEvidence.line_end,
      );
      const endpoint =
        card.scope.surfaces.find((surface) => surface.kind === "endpoint")
          ?.path ?? inferEndpointFromPath(primaryEvidence.path);

      const finding: AuditFinding = {
        issueId,
        controlId: card.id,
        filePath: primaryEvidence.path,
        endpoint: endpoint ?? null,
        confidence: card.recommendation.confidence,
        card,
      };

      findings.push(finding);

      if (input.projectId && input.runId) {
        await upsertRunIssue({
          projectId: input.projectId,
          runId: input.runId,
          finding,
        });

        await upsertRun({
          projectId: input.projectId,
          runId: input.runId,
          counts: toRunCounts(findings),
          metaJson: {
            status: "running",
            scanner: "rag-openai",
            repo: indexed.repoFull,
            commit_sha: indexed.commitSha,
            project_name: input.projectName ?? null,
            processed_chunks: processedChunks,
            total_chunks: targetChunks.length,
            latest_issue_id: issueId,
          },
        });
      }
    } catch {
      if (input.projectId && input.runId) {
        await upsertRun({
          projectId: input.projectId,
          runId: input.runId,
          counts: toRunCounts(findings),
          metaJson: {
            status: "running",
            scanner: "rag-openai",
            repo: indexed.repoFull,
            commit_sha: indexed.commitSha,
            project_name: input.projectName ?? null,
            processed_chunks: processedChunks,
            total_chunks: targetChunks.length,
          },
        });
      }
    }
  }

  const counts = toRunCounts(findings);

  if (input.projectId && input.runId) {
    await upsertRun({
      projectId: input.projectId,
      runId: input.runId,
      counts,
      metaJson: {
        status: "completed",
        scanner: "rag-openai",
        repo: indexed.repoFull,
        commit_sha: indexed.commitSha,
        project_name: input.projectName ?? null,
        indexed_files: indexed.indexedFileCount,
        processed_chunks: targetChunks.length,
        total_chunks: targetChunks.length,
      },
    });
  }

  return {
    scanId,
    repoFull: indexed.repoFull,
    commitSha: indexed.commitSha,
    endpointCount: indexed.endpointCount,
    indexedFileCount: indexed.indexedFileCount,
    routes: indexed.routes,
    routeInsights: indexed.routeInsights,
    cards: findings.map((finding) => ({
      id: finding.issueId,
      source: "github",
      title: finding.card.title,
      priority: finding.card.priority,
      category: finding.card.category,
      description: finding.card.problem.summary,
      card: finding.card,
    })),
    counts,
  };
}
