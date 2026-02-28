import crypto from "node:crypto";

import { z } from "zod";

import { getDbClient } from "@/lib/db/client";
import { generateAiReport } from "@/lib/ai";
import { scanProjectFromZip, compactChecksForAi, scannerNotes } from "@/lib/project-auditor/scanner";
import {
  browserUseFindingsSchema,
  type BrowserUseTestPlan,
  type StandardsScorecard,
} from "@/lib/project-auditor/schemas";
import { generateBrowserUseTestPlan } from "@/lib/project-auditor/test-plan";
import { MAX_ZIP_BYTES } from "@/lib/project-auditor/constants";
import { validateHostedHttpsUrl } from "@/lib/utils/urlSafety";

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
    surfaces: Array<{ kind: "endpoint" | "route"; path: string; method?: string }>;
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
    sourceZipPath: string;
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

function recalcSummary(cards: ImproveCard[], baseScore: number): RunState["summary"] {
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
    const priorityDiff = weightPriority(a.priority) - weightPriority(b.priority);
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
      fileSizeLimit: `${MAX_ZIP_BYTES}`,
    });
    if (created.error && !created.error.message.toLowerCase().includes("already exists")) {
      throw new Error(`Failed to create Supabase bucket '${BUCKET}': ${created.error.message}`);
    }
  }
}

async function uploadBuffer(filePath: string, data: Buffer, contentType: string): Promise<void> {
  const client = getDbClient();
  const result = await client.storage.from(BUCKET).upload(filePath, data, {
    upsert: true,
    contentType,
  });

  if (result.error) {
    throw new Error(`Storage upload failed for ${filePath}: ${result.error.message}`);
  }
}

async function uploadJson(filePath: string, value: unknown): Promise<void> {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  await uploadBuffer(filePath, Buffer.from(serialized, "utf8"), "application/json; charset=utf-8");
}

async function uploadText(filePath: string, text: string, contentType: string): Promise<void> {
  await uploadBuffer(filePath, Buffer.from(text, "utf8"), contentType);
}

async function downloadText(filePath: string): Promise<string> {
  const client = getDbClient();
  const result = await client.storage.from(BUCKET).download(filePath);
  if (result.error || !result.data) {
    throw new Error(`Storage download failed for ${filePath}: ${result.error?.message ?? "missing data"}`);
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
  if (parsed.hostname !== "github.com" && parsed.hostname !== "www.github.com") {
    throw new Error("Only github.com repository URLs are supported");
  }

  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length < 2) {
    throw new Error("Invalid GitHub repository URL");
  }

  let branch: string | null = null;
  if (segments[2] === "tree" && segments[3]) {
    branch = decodeURIComponent(segments.slice(3).join("/"));
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

async function downloadZip(args: {
  url: string;
  authorizationHeader?: string;
}): Promise<Buffer> {
  const response = await fetch(args.url, {
    headers: {
      Accept: "application/zip",
      "User-Agent": "QA-Pipeline-Scanner/1.0",
      ...(args.authorizationHeader
        ? { Authorization: args.authorizationHeader }
        : {}),
    },
    signal: AbortSignal.timeout(45_000),
  });

  if (!response.ok) {
    throw new Error(`Failed to download repository archive (${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_ZIP_BYTES) {
    throw new Error(`ZIP exceeds max size ${Math.floor(MAX_ZIP_BYTES / (1024 * 1024))}MB`);
  }

  return Buffer.from(arrayBuffer);
}

async function resolveDefaultBranch(args: {
  owner: string;
  repo: string;
  githubToken: string;
}): Promise<string | null> {
  const response = await fetch(
    `https://api.github.com/repos/${args.owner}/${args.repo}`,
    {
      headers: githubApiHeaders(args.githubToken),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) {
    return null;
  }

  const body = (await response.json()) as { default_branch?: string };
  return typeof body.default_branch === "string"
    ? body.default_branch
    : null;
}

async function downloadGithubArchive(
  repoUrl: string,
  githubToken?: string,
): Promise<Buffer> {
  const parsed = parseGithubRepoUrl(repoUrl);
  const branchCandidates = new Set<string>();
  if (parsed.branch) {
    branchCandidates.add(parsed.branch);
  }

  if (githubToken) {
    const defaultBranch = await resolveDefaultBranch({
      owner: parsed.owner,
      repo: parsed.repo,
      githubToken,
    });
    if (defaultBranch) {
      branchCandidates.add(defaultBranch);
    }
  }

  branchCandidates.add("main");
  branchCandidates.add("master");

  const branches = [...branchCandidates];
  let lastError = "Repository archive could not be downloaded";

  if (githubToken) {
    for (const branch of branches) {
      const archiveUrl = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/zipball/${encodeURIComponent(branch)}`;
      try {
        return await downloadZip({
          url: archiveUrl,
          authorizationHeader: `token ${githubToken}`,
        });
      } catch (error) {
        lastError = error instanceof Error ? error.message : lastError;
      }
    }
  }

  for (const branch of branches) {
    const archiveUrl = `https://codeload.github.com/${parsed.owner}/${parsed.repo}/zip/refs/heads/${encodeURIComponent(branch)}`;
    try {
      return await downloadZip({ url: archiveUrl });
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
  }

  throw new Error(lastError);
}

function checkToCard(check: StandardsScorecard["checks"][number], index: number, createdAt: string): ImproveCard {
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
      business: "Unresolved API quality issues increase support and maintenance cost.",
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
      summary: check.recommendations[0] ?? "Apply project standards consistently.",
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
        (endpoint) => finding.path.startsWith(endpoint.path) || endpoint.path.startsWith(finding.path),
      );

      return {
        id: `IC-B-${String(index + 1).padStart(4, "0")}`,
        source: "nextjs-api",
        title: `Browser finding on ${finding.path}`,
        priority: finding.severity,
        category: "UX",
        standard_refs: [{ name: finding.testId || "BrowserUse", type: "internal" }],
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
              ? [{ kind: "endpoint" as const, path: endpointMatch.path, method: endpointMatch.method }]
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
          why_it_matters: "Browser-level failures directly affect user experience and confidence.",
          rule_of_thumb: "Every critical route should have repeatable browser checks with evidence.",
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

async function buildScanState(args: {
  zipBytes: Buffer;
  sourceLabel: string;
  projectName?: string;
}): Promise<ScanState> {
  const scanId = nextScanId();
  const scanPrefix = makeScanPrefix(scanId);
  const generatedAt = new Date().toISOString();

  const scan = await scanProjectFromZip({
    zipBytes: args.zipBytes,
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
        name: toPublicProjectName(args.projectName, scan.scorecard.project.name),
      },
    },
    browserUseTestPlan,
    localCards,
    routes: scan.uiRoutes,
    endpointCount: scan.scorecard.endpoints.length,
    artifacts: {
      sourceZipPath: `${scanPrefix}/source.zip`,
      scorecardPath: `${scanPrefix}/standards_scorecard.json`,
      testPlanPath: `${scanPrefix}/browser_use_test_plan.json`,
      aiReportPath: `${scanPrefix}/ai_report.md`,
      scanStatePath: `${scanPrefix}/scan_state.json`,
    },
  };

  await ensureBucket();
  await Promise.all([
    uploadBuffer(state.artifacts.sourceZipPath, args.zipBytes, "application/zip"),
    uploadJson(state.artifacts.scorecardPath, state.scorecard),
    uploadJson(state.artifacts.testPlanPath, state.browserUseTestPlan),
    uploadText(state.artifacts.aiReportPath, ai.markdown, "text/markdown; charset=utf-8"),
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

function getBrowserUseConfig(): { baseUrl: string | null; apiKey: string | null } {
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

function readField<T>(raw: Record<string, unknown>, keys: string[]): T | undefined {
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
  const statusRaw = String(readField<string>(raw, ["status", "state"]) ?? "queued").toLowerCase();

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

async function pollRemoteFindings(runState: RunState, scan: ScanState): Promise<RunState> {
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
  const rawStatus = String(readField<string>(raw, ["status", "state"]) ?? "running").toLowerCase();

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
  const zipBytes = await downloadGithubArchive(parsed.repoUrl, parsed.githubToken);
  const guessedName = parseGithubRepoUrl(parsed.repoUrl).repo;

  const state = await buildScanState({
    zipBytes,
    sourceLabel: parsed.repoUrl,
    projectName: parsed.projectName ?? guessedName,
  });

  return {
    scanId: state.scanId,
    project: {
      name: state.project.name,
      framework: state.project.framework,
      router: state.project.router,
    },
    routes: state.routes,
    endpointCount: state.endpointCount,
    summary: state.summary,
    report: {
      id: state.scanId,
      project: {
        name: state.project.name,
        framework: state.project.framework,
      },
      generated_at: state.generatedAt,
      summary: state.summary,
    },
    cards: rankAndRenumber(state.localCards),
  };
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

  const combined = rankAndRenumber([...refreshed.localCards, ...refreshed.remoteCards]);
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
    cards: rankAndRenumber([...finalState.localCards, ...finalState.remoteCards]),
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
