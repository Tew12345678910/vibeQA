import crypto from "node:crypto";
import path from "node:path";

import { z } from "zod";

import { getDbClient } from "@/lib/db/client";
import { generateAiReport } from "@/lib/ai";
import {
  scanProjectFromFiles,
  compactChecksForAi,
  scannerNotes,
} from "@/lib/project-auditor/scanner";
import {
  browserUseFindingsSchema,
  type BrowserUseTestPlan,
  type StandardsScorecard,
} from "@/lib/project-auditor/schemas";
import { generateBrowserUseTestPlan } from "@/lib/project-auditor/test-plan";
import { analyzeGithubRoutesAndFramework } from "@/lib/browserqa/github-route-analysis";
import {
  BINARY_EXTENSIONS,
  MAX_FILE_BYTES,
  MAX_SCAN_FILES,
  MAX_TOTAL_BYTES,
  SKIP_DIRECTORIES,
  TEXT_EXTENSIONS,
} from "@/lib/project-auditor/constants";
import { validateHostedHttpsUrl } from "@/lib/utils/urlSafety";
import { auditRepoWithRag } from "@/lib/rag/service";

type CardPriority = "P0" | "P1" | "P2";
type CardSource = "local" | "nextjs-api";

type ImproveCard = {
  id: string;
  source: CardSource;
  title: string;
  priority: CardPriority;
  category: string;
  standard_refs: Array<{ name: string; type: "internal" }>;
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
      type: "code" | "browser";
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
    owner: "backend" | "frontend" | "fullstack";
    created_at: string;
    updated_at: string;
  };
};

type ScanState = {
  scanId: string;
  generatedAt: string;
  project: {
    name: string;
    framework: "nextjs";
    router: "app" | "pages" | "unknown";
  };
  summary: {
    score: number;
    p0: number;
    p1: number;
    p2: number;
  };
  scorecard: StandardsScorecard;
  browserUseTestPlan: BrowserUseTestPlan;
  localCards: ImproveCard[];
  routes: string[];
  endpointCount: number;
  artifacts: {
    scorecardPath: string;
    testPlanPath: string;
    aiReportPath: string;
    scanStatePath: string;
  };
};

type ReviewRemoteState = {
  status: "queued" | "running" | "completed" | "failed" | "disabled";
  reviewId: string | null;
  lastCheckedAt: string | null;
  error: string | null;
  findingsPath: string | null;
};

type RunState = {
  runId: string;
  scanId: string;
  createdAt: string;
  updatedAt: string;
  baseUrl: string;
  project: {
    name: string;
    framework: "nextjs";
  };
  summary: {
    score: number;
    p0: number;
    p1: number;
    p2: number;
  };
  localCards: ImproveCard[];
  remoteCards: ImproveCard[];
  remote: ReviewRemoteState;
  reviewRequestPath: string;
};

type ReportResponse = {
  report: {
    id: string;
    project: {
      name: string;
      framework: "nextjs";
    };
    generated_at: string;
    summary: {
      score: number;
      p0: number;
      p1: number;
      p2: number;
    };
  };
  cards: ImproveCard[];
  remote: ReviewRemoteState;
};

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "qa-project-artifacts";

const githubScanRequestSchema = z.object({
  repoUrl: z.string().url(),
  projectName: z.string().trim().min(1).max(120).optional(),
  githubToken: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
  runId: z.string().trim().min(1).optional(),
  analysisOnly: z.boolean().optional(),
});

const confirmReviewRequestSchema = z.object({
  scanId: z.string().min(8),
  baseUrl: z.string().url(),
});

function dateIdSegment(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function nextScanId(): string {
  return `SCAN-${dateIdSegment()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
}

function nextRunId(): string {
  const tail = crypto.randomUUID().replace(/-/g, "").slice(0, 3).toUpperCase();
  return `RUN-${dateIdSegment()}-${tail}`;
}

function weightSource(source: CardSource): number {
  return source === "local" ? 0 : 1;
}

function weightPriority(priority: CardPriority): number {
  if (priority === "P0") return 0;
  if (priority === "P1") return 1;
  return 2;
}

function recalcSummary(
  cards: ImproveCard[],
  baseScore: number,
): RunState["summary"] {
  const p0 = cards.filter((c) => c.priority === "P0").length;
  const p1 = cards.filter((c) => c.priority === "P1").length;
  const p2 = cards.filter((c) => c.priority === "P2").length;
  const penalty = p0 * 8 + p1 * 4 + p2 * 2;
  const score = Math.max(0, Math.min(100, baseScore - penalty));
  return { score, p0, p1, p2 };
}

function rankAndRenumber(cards: ImproveCard[]): ImproveCard[] {
  const sorted = [...cards].sort((a, b) => {
    const sourceDiff = weightSource(a.source) - weightSource(b.source);
    if (sourceDiff !== 0) return sourceDiff;
    const priorityDiff =
      weightPriority(a.priority) - weightPriority(b.priority);
    if (priorityDiff !== 0) return priorityDiff;
    return a.title.localeCompare(b.title);
  });

  return sorted.map((card, index) => ({
    ...card,
    id: `IC-${String(index + 1).padStart(4, "0")}`,
  }));
}

async function ensureBucket(): Promise<void> {
  const client = getDbClient();
  const { data, error } = await client.storage.listBuckets();
  if (error) {
    throw new Error(`Supabase bucket check failed: ${error.message}`);
  }

  if (!data.some((bucket) => bucket.name === BUCKET)) {
    const created = await client.storage.createBucket(BUCKET, {
      public: false,
    });
    if (
      created.error &&
      !created.error.message.toLowerCase().includes("already exists")
    ) {
      throw new Error(
        `Failed to create Supabase bucket '${BUCKET}': ${created.error.message}`,
      );
    }
  }
}

async function uploadBuffer(
  filePath: string,
  data: Buffer,
  contentType: string,
): Promise<void> {
  const client = getDbClient();
  const result = await client.storage.from(BUCKET).upload(filePath, data, {
    upsert: true,
    contentType,
  });

  if (result.error) {
    throw new Error(
      `Storage upload failed for ${filePath}: ${result.error.message}`,
    );
  }
}

async function uploadJson(filePath: string, value: unknown): Promise<void> {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  await uploadBuffer(
    filePath,
    Buffer.from(serialized, "utf8"),
    "application/json; charset=utf-8",
  );
}

async function uploadText(
  filePath: string,
  text: string,
  contentType: string,
): Promise<void> {
  await uploadBuffer(filePath, Buffer.from(text, "utf8"), contentType);
}

async function downloadText(filePath: string): Promise<string> {
  const client = getDbClient();
  const result = await client.storage.from(BUCKET).download(filePath);
  if (result.error || !result.data) {
    throw new Error(
      `Storage download failed for ${filePath}: ${result.error?.message ?? "missing data"}`,
    );
  }
  return result.data.text();
}

async function downloadJson<T>(filePath: string): Promise<T> {
  const text = await downloadText(filePath);
  return JSON.parse(text) as T;
}

function parseGithubRepoUrl(repoUrl: string): {
  owner: string;
  repo: string;
  branch: string | null;
} {
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
    // GitHub URLs may include extra path segments after branch (e.g. /tree/main/src).
    // For tree/blob scanning we only need the branch hint itself.
    branch = decodeURIComponent(segments[3]);
  }

  return {
    owner: segments[0]!,
    repo: segments[1]!.replace(/\.git$/i, ""),
    branch,
  };
}

function githubApiHeaders(githubToken: string): Record<string, string> {
  return {
    Authorization: `token ${githubToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "QA-Pipeline-Scanner/1.0",
  };
}

function githubHeaders(githubToken?: string): Record<string, string> {
  return githubToken
    ? githubApiHeaders(githubToken)
    : {
        Accept: "application/vnd.github+json",
        "User-Agent": "QA-Pipeline-Scanner/1.0",
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

type GitTreeEntry = {
  path: string;
  mode: string;
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
    `https://api.github.com/repos/${args.owner}/${args.repo}`,
    {
      headers: githubHeaders(args.githubToken),
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (response.ok) {
    const body = (await response.json()) as { default_branch?: string };
    return {
      defaultBranch:
        typeof body.default_branch === "string" ? body.default_branch : null,
    };
  }

  if (response.status === 404) {
    if (!args.githubToken) {
      throw new Error(
        "Repository not accessible. Connect GitHub to scan private repositories.",
      );
    }
    throw new Error("Repository not found or token has no access.");
  }

  if (response.status === 401) {
    throw new Error(
      "GitHub token is invalid or expired. Reconnect GitHub and try again.",
    );
  }

  if (response.status === 403) {
    throw new Error(
      "GitHub API access denied (403). Check token scopes or rate limits.",
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
      signal: AbortSignal.timeout(20_000),
    },
  );

  if (response.ok) {
    const payload = (await response.json()) as GitTreePayload;
    if (payload.truncated) {
      throw new Error(
        "Repository tree is too large for GitHub tree API recursion.",
      );
    }
    return Array.isArray(payload.tree) ? payload.tree : [];
  }

  if (response.status === 404) {
    return null;
  }

  if (response.status === 401) {
    throw new Error(
      "GitHub token is invalid or expired. Reconnect GitHub and try again.",
    );
  }

  if (response.status === 403) {
    const remaining = response.headers.get("x-ratelimit-remaining");
    if (remaining === "0") {
      throw new Error(
        "GitHub API rate limit reached while reading repository tree.",
      );
    }
    throw new Error(
      "GitHub API access denied (403) while reading repository tree.",
    );
  }

  if (response.status === 409) {
    throw new Error("Repository is empty or unavailable for tree scan.");
  }

  throw new Error(
    `GitHub tree API failed (${response.status}) for ref '${args.ref}'.`,
  );
}

function selectCandidateBlobs(
  entries: GitTreeEntry[],
): Array<{ path: string; sha: string; size: number }> {
  const candidates: Array<{ path: string; sha: string; size: number }> = [];

  for (const entry of entries) {
    if (entry.type !== "blob") continue;

    const filePath = entry.path.replace(/\\/g, "/");
    if (!filePath) continue;
    if (shouldSkipByDirectory(filePath)) continue;
    if (isBinaryByExtension(filePath)) continue;
    if (!isTextCandidate(filePath)) continue;

    const size = typeof entry.size === "number" ? entry.size : 0;
    if (size > MAX_FILE_BYTES) continue;

    candidates.push({
      path: filePath,
      sha: entry.sha,
      size,
    });
  }

  candidates.sort((a, b) => a.path.localeCompare(b.path));

  if (candidates.length > MAX_SCAN_FILES) {
    throw new Error(`File scan cap exceeded (${MAX_SCAN_FILES} files)`);
  }

  const projectedBytes = candidates.reduce(
    (acc, candidate) => acc + candidate.size,
    0,
  );
  if (projectedBytes > MAX_TOTAL_BYTES) {
    throw new Error(
      `Total scanned bytes exceeded cap (${Math.floor(MAX_TOTAL_BYTES / (1024 * 1024))}MB)`,
    );
  }

  return candidates;
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
      signal: AbortSignal.timeout(20_000),
    },
  );

  if (!response.ok) {
    if (response.status === 404) return null;
    if (
      response.status === 403 &&
      response.headers.get("x-ratelimit-remaining") === "0"
    ) {
      throw new Error(
        "GitHub API rate limit reached while reading file blobs.",
      );
    }
    throw new Error(`GitHub blob API failed (${response.status})`);
  }

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

function checkToCard(
  check: StandardsScorecard["checks"][number],
  index: number,
  createdAt: string,
): ImproveCard {
  const firstEvidence = check.evidence[0];

  return {
    id: `IC-${String(index + 1).padStart(4, "0")}`,
    source: "local",
    title: `${check.standard}: ${check.message}`,
    priority: check.severity,
    category: check.standard,
    standard_refs: [{ name: check.standard, type: "internal" }],
    impact: {
      user: "Users may experience inconsistent behavior and reduced reliability.",
      business:
        "Unresolved API quality issues increase support and maintenance cost.",
      risk: "Gaps in standards can become production reliability and security incidents.",
    },
    scope: {
      surfaces: firstEvidence
        ? [{ kind: "endpoint", path: firstEvidence.file, method: "*" }]
        : [{ kind: "endpoint", path: "/api/*", method: "*" }],
      files: firstEvidence
        ? [
            {
              path: firstEvidence.file,
              line_start: firstEvidence.lineStart,
              line_end: firstEvidence.lineEnd,
            },
          ]
        : [],
    },
    problem: {
      summary: check.message,
      evidence: check.evidence.map((evidence) => ({
        type: "code" as const,
        path: evidence.file,
        line_start: evidence.lineStart,
        line_end: evidence.lineEnd,
        snippet: evidence.snippet,
      })),
    },
    recommendation: {
      summary:
        check.recommendations[0] ?? "Apply project standards consistently.",
      implementation_steps: check.recommendations,
      acceptance_criteria: [
        "Updated endpoint behavior passes regression checks.",
        `The ${check.standard} standard is satisfied for affected handlers.`,
      ],
      estimated_effort: "S",
      confidence: check.status === "fail" ? "high" : "medium",
    },
    education: {
      why_it_matters: `The ${check.standard} standard affects system quality and maintainability.`,
      rule_of_thumb: `Every endpoint should satisfy ${check.standard} requirements by default.`,
    },
    status: {
      state: "open",
      owner: "backend",
      created_at: createdAt,
      updated_at: createdAt,
    },
  };
}

function findingsToCards(args: {
  findings: z.infer<typeof browserUseFindingsSchema>["findings"];
  scan: ScanState;
  createdAt: string;
}): ImproveCard[] {
  return args.findings
    .filter((finding) => finding.result === "fail")
    .map((finding, index) => {
      const endpointMatch = args.scan.scorecard.endpoints.find(
        (endpoint) =>
          finding.path.startsWith(endpoint.path) ||
          endpoint.path.startsWith(finding.path),
      );

      return {
        id: `IC-B-${String(index + 1).padStart(4, "0")}`,
        source: "nextjs-api",
        title: `Browser finding on ${finding.path}`,
        priority: finding.severity,
        category: "UX",
        standard_refs: [
          { name: finding.testId || "BrowserUse", type: "internal" },
        ],
        impact: {
          user: finding.observed,
          business: "User-facing regressions degrade conversion and trust.",
          risk: `Severity ${finding.severity} UI/API mismatch can escape to production if not fixed.`,
        },
        scope: {
          surfaces: [
            {
              kind: "route",
              path: finding.path,
            },
            ...(endpointMatch
              ? [
                  {
                    kind: "endpoint" as const,
                    path: endpointMatch.path,
                    method: endpointMatch.method,
                  },
                ]
              : []),
          ],
          files: endpointMatch
            ? [
                {
                  path: endpointMatch.file,
                  line_start: 1,
                  line_end: 200,
                },
              ]
            : [],
        },
        problem: {
          summary: finding.observed,
          evidence: [
            {
              type: "browser",
              path: finding.evidence.url || finding.path,
              line_start: 1,
              line_end: 1,
              snippet: `${finding.expected}\nObserved: ${finding.observed}`,
            },
          ],
        },
        recommendation: {
          summary: `Fix behavior on ${finding.path} to match expected result for ${finding.testId}.`,
          implementation_steps: [
            ...finding.reproSteps,
            "Patch route/API behavior and update tests.",
          ],
          acceptance_criteria: [
            "Browser use scenario no longer fails.",
            "Expected behavior matches observed behavior on both desktop and mobile.",
          ],
          estimated_effort: "M",
          confidence: "medium",
        },
        education: {
          why_it_matters:
            "Browser-level failures directly affect user experience and confidence.",
          rule_of_thumb:
            "Every critical route should have repeatable browser checks with evidence.",
        },
        status: {
          state: "open",
          owner: "fullstack",
          created_at: args.createdAt,
          updated_at: args.createdAt,
        },
      } satisfies ImproveCard;
    });
}

function makeScanPrefix(scanId: string): string {
  return `pipeline/scans/${scanId}`;
}

function makeRunPrefix(runId: string): string {
  return `pipeline/runs/${runId}`;
}

function toPublicProjectName(input?: string, fallback = "my-app"): string {
  const value = (input ?? "").trim();
  return value ? value.slice(0, 120) : fallback;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function buildScanState(args: {
  sourceFiles: Array<{ path: string; content: string }>;
  projectName?: string;
}): Promise<ScanState> {
  const scanId = nextScanId();
  const scanPrefix = makeScanPrefix(scanId);
  const generatedAt = new Date().toISOString();

  const scan = await scanProjectFromFiles({
    files: args.sourceFiles,
    projectNameHint: toPublicProjectName(args.projectName),
  });

  const ai = await generateAiReport({
    project: scan.scorecard.project,
    summary: scan.scorecard.summary,
    endpoints: scan.scorecard.endpoints,
    checks: compactChecksForAi(scan.scorecard),
    detectedStack: scan.detectedStack,
    uiRoutes: scan.uiRoutes,
  });

  const notes = scannerNotes(scan.stats).join(" ");
  const browserUseTestPlan = generateBrowserUseTestPlan({
    scorecard: scan.scorecard,
    uiRoutes: scan.uiRoutes,
    notes,
  });

  const localCards = scan.scorecard.checks
    .filter((check) => check.status === "warn" || check.status === "fail")
    .map((check, index) => checkToCard(check, index, generatedAt));

  const state: ScanState = {
    scanId,
    generatedAt,
    project: {
      name: toPublicProjectName(args.projectName, scan.scorecard.project.name),
      framework: "nextjs",
      router: scan.scorecard.project.router,
    },
    summary: scan.scorecard.summary,
    scorecard: {
      ...scan.scorecard,
      project: {
        ...scan.scorecard.project,
        name: toPublicProjectName(
          args.projectName,
          scan.scorecard.project.name,
        ),
      },
    },
    browserUseTestPlan,
    localCards,
    routes: scan.uiRoutes,
    endpointCount: scan.scorecard.endpoints.length,
    artifacts: {
      scorecardPath: `${scanPrefix}/standards_scorecard.json`,
      testPlanPath: `${scanPrefix}/browser_use_test_plan.json`,
      aiReportPath: `${scanPrefix}/ai_report.md`,
      scanStatePath: `${scanPrefix}/scan_state.json`,
    },
  };

  await ensureBucket();
  await Promise.all([
    uploadJson(state.artifacts.scorecardPath, state.scorecard),
    uploadJson(state.artifacts.testPlanPath, state.browserUseTestPlan),
    uploadText(
      state.artifacts.aiReportPath,
      ai.markdown,
      "text/markdown; charset=utf-8",
    ),
    uploadJson(state.artifacts.scanStatePath, state),
  ]);

  return state;
}

async function readScanState(scanId: string): Promise<ScanState> {
  return downloadJson<ScanState>(`${makeScanPrefix(scanId)}/scan_state.json`);
}

async function writeRunState(runState: RunState): Promise<void> {
  await uploadJson(`${makeRunPrefix(runState.runId)}/run_state.json`, runState);
}

async function readRunState(runId: string): Promise<RunState> {
  return downloadJson<RunState>(`${makeRunPrefix(runId)}/run_state.json`);
}

function getBrowserUseConfig(): {
  baseUrl: string | null;
  apiKey: string | null;
} {
  return {
    baseUrl: process.env.BROWSER_USE_SERVER_BASE_URL ?? null,
    apiKey: process.env.BROWSER_USE_SERVER_API_KEY ?? null,
  };
}

function requestHeaders(apiKey: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

function readField<T>(
  raw: Record<string, unknown>,
  keys: string[],
): T | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (value !== undefined && value !== null) {
      return value as T;
    }
  }
  return undefined;
}

async function startRemoteReview(args: {
  runId: string;
  baseUrl: string;
  scan: ScanState;
}): Promise<{ remote: ReviewRemoteState; requestPayload: unknown }> {
  const config = getBrowserUseConfig();
  const requestPayload = {
    runId: args.runId,
    baseUrl: args.baseUrl,
    requirements: {
      project: {
        ...args.scan.browserUseTestPlan.project,
        baseUrl: args.baseUrl,
      },
      standards: args.scan.browserUseTestPlan.standards,
      routes: args.scan.browserUseTestPlan.routes,
    },
  };

  if (!config.baseUrl) {
    return {
      remote: {
        status: "disabled",
        reviewId: null,
        lastCheckedAt: new Date().toISOString(),
        error: "BROWSER_USE_SERVER_BASE_URL is not configured.",
        findingsPath: null,
      },
      requestPayload,
    };
  }

  const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/reviews`, {
    method: "POST",
    headers: requestHeaders(config.apiKey),
    body: JSON.stringify(requestPayload),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const body = await response.text();
    return {
      remote: {
        status: "failed",
        reviewId: null,
        lastCheckedAt: new Date().toISOString(),
        error: `Browser use start failed (${response.status}): ${body}`,
        findingsPath: null,
      },
      requestPayload,
    };
  }

  const raw = (await response.json()) as Record<string, unknown>;
  const reviewId = readField<string>(raw, ["reviewId", "id", "runId"]);
  const statusRaw = String(
    readField<string>(raw, ["status", "state"]) ?? "queued",
  ).toLowerCase();

  return {
    remote: {
      status: ["completed", "done", "success"].includes(statusRaw)
        ? "completed"
        : ["running", "in_progress"].includes(statusRaw)
          ? "running"
          : "queued",
      reviewId: reviewId ?? null,
      lastCheckedAt: new Date().toISOString(),
      error: null,
      findingsPath: null,
    },
    requestPayload,
  };
}

async function pollRemoteFindings(
  runState: RunState,
  scan: ScanState,
): Promise<RunState> {
  if (!["queued", "running"].includes(runState.remote.status)) {
    return runState;
  }
  if (!runState.remote.reviewId) {
    return {
      ...runState,
      remote: {
        ...runState.remote,
        status: "failed",
        error: "Remote review id is missing.",
        lastCheckedAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    };
  }

  const config = getBrowserUseConfig();
  if (!config.baseUrl) {
    return {
      ...runState,
      remote: {
        ...runState.remote,
        status: "disabled",
        error: "BROWSER_USE_SERVER_BASE_URL is not configured.",
        lastCheckedAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    };
  }

  const response = await fetch(
    `${config.baseUrl.replace(/\/$/, "")}/reviews/${encodeURIComponent(runState.remote.reviewId)}`,
    {
      method: "GET",
      headers: requestHeaders(config.apiKey),
      signal: AbortSignal.timeout(20_000),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    return {
      ...runState,
      remote: {
        ...runState.remote,
        status: "failed",
        error: `Browser use poll failed (${response.status}): ${body}`,
        lastCheckedAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    };
  }

  const raw = (await response.json()) as Record<string, unknown>;
  const rawStatus = String(
    readField<string>(raw, ["status", "state"]) ?? "running",
  ).toLowerCase();

  if (["queued", "running", "in_progress"].includes(rawStatus)) {
    return {
      ...runState,
      remote: {
        ...runState.remote,
        status: rawStatus === "queued" ? "queued" : "running",
        lastCheckedAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    };
  }

  const parsed = browserUseFindingsSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ...runState,
      remote: {
        ...runState.remote,
        status: "failed",
        error: "Remote payload did not match browser findings schema.",
        lastCheckedAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    };
  }

  const findingsPath = `${makeRunPrefix(runState.runId)}/browser_use_findings.json`;
  const remoteCards = findingsToCards({
    findings: parsed.data.findings,
    scan,
    createdAt: new Date().toISOString(),
  });

  await uploadJson(findingsPath, parsed.data);

  return {
    ...runState,
    remoteCards,
    remote: {
      ...runState.remote,
      status: "completed",
      error: null,
      lastCheckedAt: new Date().toISOString(),
      findingsPath,
    },
    updatedAt: new Date().toISOString(),
  };
}

export async function scanGithubRepo(input: unknown) {
  const parsed = githubScanRequestSchema.parse(input);
  const guessedName = parseGithubRepoUrl(parsed.repoUrl).repo;
  const projectId = parsed.projectId?.trim();
  const runId = parsed.runId?.trim();

  const seedRunIfNeeded = async (
    status: "running" | "failed",
    errorMessage?: string,
  ) => {
    if (!projectId || !runId) return;
    const db = getDbClient();
    const nowIso = new Date().toISOString();
    const { error } = await db.from("project_runs").upsert(
      {
        id: runId,
        project_id: projectId,
        count_p0: 0,
        count_p1: 0,
        count_p2: 0,
        count_total: 0,
        created_at: nowIso,
        meta_json: {
          status,
          scanner: "rag-openai",
          repo_url: parsed.repoUrl,
          error: errorMessage ?? null,
        },
      },
      { onConflict: "id" },
    );
    if (error) {
      throw new Error(`Failed to seed project run: ${error.message}`);
    }
  };

  if (!parsed.analysisOnly) {
    await seedRunIfNeeded("running");
  }

  try {
    if (parsed.analysisOnly) {
      const analysis = await analyzeGithubRoutesAndFramework({
        repoUrl: parsed.repoUrl,
        projectName: parsed.projectName ?? guessedName,
        githubToken: parsed.githubToken,
      });

      return {
        scanId: analysis.scanId,
        runId: null,
        status: "completed",
        project: {
          name: analysis.project.name,
          framework: analysis.project.framework,
          router: analysis.project.router,
        },
        routes: analysis.routes,
        routeInsights: analysis.routeInsights,
        endpointCount: analysis.endpointCount,
        summary: {
          score: 100,
          p0: 0,
          p1: 0,
          p2: 0,
        },
        report: {
          id: analysis.scanId,
          project: {
            name: analysis.project.name,
            framework: analysis.project.framework,
          },
          generated_at: new Date().toISOString(),
          summary: {
            score: 100,
            p0: 0,
            p1: 0,
            p2: 0,
          },
        },
        cards: [],
      };
    }

    const analysisPromise = analyzeGithubRoutesAndFramework({
      repoUrl: parsed.repoUrl,
      projectName: parsed.projectName ?? guessedName,
      githubToken: parsed.githubToken,
    }).catch(() => null);

    const rag = await auditRepoWithRag({
      repoUrl: parsed.repoUrl,
      projectName: parsed.projectName ?? guessedName,
      githubToken: parsed.githubToken,
      projectId,
      runId,
    });
    const analysis = await analysisPromise;

    return {
      scanId: rag.scanId,
      runId: runId ?? null,
      status: runId ? "completed" : "done",
      project: {
        name:
          analysis?.project.name ??
          toPublicProjectName(parsed.projectName, guessedName),
        framework: analysis?.project.framework ?? "unknown",
        router: analysis?.project.router ?? "unknown",
      },
      routes: analysis?.routes ?? [],
      routeInsights: analysis?.routeInsights ?? [],
      endpointCount: analysis?.endpointCount ?? 0,
      commitSha: rag.commitSha,
      indexedFiles: rag.indexedFileCount,
      summary: {
        score: Math.max(
          0,
          100 - (rag.counts.p0 * 12 + rag.counts.p1 * 6 + rag.counts.p2 * 3),
        ),
        p0: rag.counts.p0,
        p1: rag.counts.p1,
        p2: rag.counts.p2,
      },
      report: {
        id: runId ?? rag.scanId,
        project: {
          name:
            analysis?.project.name ??
            toPublicProjectName(parsed.projectName, guessedName),
          framework: analysis?.project.framework ?? "unknown",
        },
        generated_at: new Date().toISOString(),
        summary: {
          score: Math.max(
            0,
            100 - (rag.counts.p0 * 12 + rag.counts.p1 * 6 + rag.counts.p2 * 3),
          ),
          p0: rag.counts.p0,
          p1: rag.counts.p1,
          p2: rag.counts.p2,
        },
      },
      cards: rag.cards,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "GitHub scan failed";
    if (!parsed.analysisOnly) {
      await seedRunIfNeeded("failed", message);
    }
    throw error;
  }
}

export async function confirmProjectReview(input: unknown) {
  const parsed = confirmReviewRequestSchema.parse(input);
  const validity = validateHostedHttpsUrl(parsed.baseUrl);
  if (!validity.valid) {
    throw new Error(validity.message ?? "Invalid hosted URL");
  }

  const scan = await readScanState(parsed.scanId);
  const runId = nextRunId();
  const createdAt = new Date().toISOString();

  const remoteStart = await startRemoteReview({
    runId,
    baseUrl: parsed.baseUrl,
    scan,
  });

  const runPrefix = makeRunPrefix(runId);
  const reviewRequestPath = `${runPrefix}/browser_use_request.json`;

  await uploadJson(reviewRequestPath, remoteStart.requestPayload);

  const rankedLocalCards = rankAndRenumber(scan.localCards);

  const runState: RunState = {
    runId,
    scanId: parsed.scanId,
    createdAt,
    updatedAt: createdAt,
    baseUrl: parsed.baseUrl,
    project: {
      name: scan.project.name,
      framework: "nextjs",
    },
    summary: recalcSummary(rankedLocalCards, scan.summary.score),
    localCards: rankedLocalCards,
    remoteCards: [],
    remote: {
      ...remoteStart.remote,
      findingsPath: remoteStart.remote.findingsPath,
    },
    reviewRequestPath,
  };

  await writeRunState(runState);

  return {
    runId,
    issuePageUrl: `/issues?runId=${encodeURIComponent(runId)}`,
    report: {
      id: runState.runId,
      project: runState.project,
      generated_at: runState.updatedAt,
      summary: runState.summary,
    },
    cards: runState.localCards,
    remote: runState.remote,
  };
}

export async function getIssuesReport(runId: string): Promise<ReportResponse> {
  const current = await readRunState(runId);
  const scan = await readScanState(current.scanId);

  const refreshed = await pollRemoteFindings(current, scan);

  const combined = rankAndRenumber([
    ...refreshed.localCards,
    ...refreshed.remoteCards,
  ]);
  const summary = recalcSummary(combined, scan.summary.score);

  const finalState: RunState = {
    ...refreshed,
    summary,
    localCards: combined.filter((card) => card.source === "local"),
    remoteCards: combined.filter((card) => card.source === "nextjs-api"),
    updatedAt: new Date().toISOString(),
  };

  await writeRunState(finalState);

  return {
    report: {
      id: finalState.runId,
      project: finalState.project,
      generated_at: finalState.updatedAt,
      summary: finalState.summary,
    },
    cards: rankAndRenumber([
      ...finalState.localCards,
      ...finalState.remoteCards,
    ]),
    remote: finalState.remote,
  };
}

export async function getScanPreview(scanId: string) {
  const scan = await readScanState(scanId);
  return {
    report: {
      id: scan.scanId,
      project: { name: scan.project.name, framework: "nextjs" as const },
      generated_at: scan.generatedAt,
      summary: scan.summary,
    },
    cards: rankAndRenumber(scan.localCards),
    scanId: scan.scanId,
    routes: scan.routes,
    endpointCount: scan.endpointCount,
  };
}
