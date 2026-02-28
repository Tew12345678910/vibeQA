import path from "node:path";

import unzipper from "unzipper";

import {
  BINARY_EXTENSIONS,
  LARGE_FILE_WARN_THRESHOLD,
  MAX_FILE_BYTES,
  MAX_SCAN_FILES,
  MAX_TOTAL_BYTES,
  SKIP_DIRECTORIES,
  TEXT_EXTENSIONS,
} from "@/lib/project-auditor/constants";
import {
  standardsScorecardSchema,
  type Endpoint,
  type ScorecardCheck,
  type Severity,
  type StandardsScorecard,
} from "@/lib/project-auditor/schemas";

type ScannedFile = {
  path: string;
  content: string;
  bytes: number;
};

type InputFile = {
  path: string;
  content: string;
};

type Evidence = {
  file: string;
  lineStart: number;
  lineEnd: number;
  snippet: string;
};

type DetectedStack = {
  dependencies: string[];
  devDependencies: string[];
  authLibraries: string[];
  validationLibraries: string[];
  rateLimitLibraries: string[];
  loggingLibraries: string[];
};

export type ScanOutput = {
  scorecard: StandardsScorecard;
  detectedStack: DetectedStack;
  uiRoutes: string[];
  stats: {
    scannedFiles: number;
    scannedBytes: number;
    skippedLargeFiles: number;
  };
};

const APP_API_ROUTE_RE = /(?:^|\/)app\/api(?:\/(.*))?\/route\.[cm]?[jt]sx?$/;
const PAGES_API_ROUTE_RE = /(?:^|\/)pages\/api\/(.+)\.[cm]?[jt]sx?$/;
const APP_PAGE_RE = /(?:^|\/)app\/(.+)\/page\.[cm]?[jt]sx?$/;
const ROOT_APP_PAGE_RE = /(?:^|\/)app\/page\.[cm]?[jt]sx?$/;
const PAGES_PAGE_RE = /(?:^|\/)pages\/(.+)\.[cm]?[jt]sx?$/;

const METHOD_RE = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g;
const METHOD_CONST_RE = /export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\s*=/g;
const REQ_METHOD_RE = /req\.method\s*===\s*["'](GET|POST|PUT|PATCH|DELETE)["']/g;
const SWITCH_CASE_RE = /case\s+["'](GET|POST|PUT|PATCH|DELETE)["']\s*:/g;

function normalizeZipPath(raw: string): string {
  const unixPath = raw.replace(/\\/g, "/");
  const normalized = path.posix.normalize(unixPath);

  if (!normalized || normalized === ".") {
    throw new Error("Empty path in zip entry");
  }
  if (normalized.startsWith("/") || normalized.startsWith("../") || normalized.includes("/../")) {
    throw new Error(`Unsafe zip path detected: ${raw}`);
  }

  return normalized;
}

function isBinaryByExtension(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext.length > 0 && BINARY_EXTENSIONS.has(ext);
}

function isTextCandidate(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  if (!ext) {
    const base = path.basename(filePath).toLowerCase();
    return ["dockerfile", "makefile", "readme", "license", ".env"].includes(base);
  }
  return TEXT_EXTENSIONS.has(ext);
}

function shouldSkipByDirectory(filePath: string): boolean {
  const segments = filePath.split("/");
  return segments.some((segment) => SKIP_DIRECTORIES.has(segment));
}

function hasNullByte(buffer: Buffer): boolean {
  for (let i = 0; i < buffer.length; i += 1) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

function makeSnippet(content: string, lineNumber: number): string {
  const lines = content.split(/\r?\n/);
  const start = Math.max(0, lineNumber - 3);
  const end = Math.min(lines.length, start + 15);
  return lines.slice(start, end).join("\n");
}

function lineNumberAt(content: string, index: number): number {
  return content.slice(0, index).split(/\r?\n/).length;
}

function firstRegexEvidence(files: ScannedFile[], regexes: RegExp[], max = 3): Evidence[] {
  const output: Evidence[] = [];

  for (const file of files) {
    for (const regex of regexes) {
      const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
      const re = new RegExp(regex.source, flags);
      const match = re.exec(file.content);
      if (!match || match.index === undefined) continue;

      const lineStart = lineNumberAt(file.content, match.index);
      output.push({
        file: file.path,
        lineStart,
        lineEnd: Math.min(lineStart + 14, file.content.split(/\r?\n/).length),
        snippet: makeSnippet(file.content, lineStart),
      });

      if (output.length >= max) return output;
    }
  }

  return output;
}

function toApiPath(parts: string): string {
  const segments = parts
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .filter((segment) => segment !== "index");

  return `/api${segments.length ? `/${segments.join("/")}` : ""}`;
}

function normalizeUiRoute(parts: string): string {
  const clean = parts
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .filter((segment) => !segment.startsWith("("))
    .filter((segment) => !segment.startsWith("@"))
    .filter((segment) => segment !== "index")
    .join("/");

  if (!clean) return "/";
  return `/${clean}`;
}

function collectMethods(content: string, regex: RegExp): Set<Endpoint["method"]> {
  const methods = new Set<Endpoint["method"]>();
  const re = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : `${regex.flags}g`);
  let match = re.exec(content);
  while (match) {
    const method = match[1] as Endpoint["method"];
    methods.add(method);
    match = re.exec(content);
  }
  return methods;
}

function extractEndpoints(files: ScannedFile[]): Endpoint[] {
  const endpoints: Endpoint[] = [];

  for (const file of files) {
    const appMatch = APP_API_ROUTE_RE.exec(file.path);
    if (appMatch) {
      const routePath = toApiPath(appMatch[1] ?? "");
      const methods = new Set<Endpoint["method"]>([
        ...collectMethods(file.content, METHOD_RE),
        ...collectMethods(file.content, METHOD_CONST_RE),
      ]);

      if (!methods.size) {
        endpoints.push({
          method: "*",
          path: routePath,
          file: file.path,
          notes: "App Router handler with dynamic method branching",
        });
      } else {
        for (const method of methods) {
          endpoints.push({
            method,
            path: routePath,
            file: file.path,
            notes: "App Router route handler",
          });
        }
      }
      continue;
    }

    const pagesMatch = PAGES_API_ROUTE_RE.exec(file.path);
    if (pagesMatch) {
      const routePath = toApiPath(pagesMatch[1] ?? "");
      const methods = new Set<Endpoint["method"]>([
        ...collectMethods(file.content, REQ_METHOD_RE),
        ...collectMethods(file.content, SWITCH_CASE_RE),
      ]);

      if (!methods.size) {
        endpoints.push({
          method: "*",
          path: routePath,
          file: file.path,
          notes: "Pages API handler without explicit method guards",
        });
      } else {
        for (const method of methods) {
          endpoints.push({
            method,
            path: routePath,
            file: file.path,
            notes: "Pages Router API route",
          });
        }
      }
    }
  }

  return endpoints.sort((a, b) => `${a.path}:${a.method}`.localeCompare(`${b.path}:${b.method}`));
}

function detectUiRoutes(files: ScannedFile[]): string[] {
  const routes = new Set<string>();

  for (const file of files) {
    if (ROOT_APP_PAGE_RE.test(file.path)) {
      routes.add("/");
      continue;
    }

    const appMatch = APP_PAGE_RE.exec(file.path);
    if (appMatch && !file.path.includes("/api/")) {
      routes.add(normalizeUiRoute(appMatch[1] ?? ""));
      continue;
    }

    const pagesMatch = PAGES_PAGE_RE.exec(file.path);
    if (pagesMatch) {
      const raw = pagesMatch[1] ?? "";
      if (raw.startsWith("api/") || raw === "_app" || raw === "_document" || raw === "_error") {
        continue;
      }
      routes.add(normalizeUiRoute(raw));
    }
  }

  return [...routes].sort();
}

function detectRouter(files: ScannedFile[]): "app" | "pages" | "unknown" {
  const hasApp = files.some((file) => file.path.includes("/app/") || file.path.startsWith("app/"));
  const hasPages = files.some((file) => file.path.includes("/pages/") || file.path.startsWith("pages/"));

  if (hasApp) return "app";
  if (hasPages) return "pages";
  return "unknown";
}

function getDependencies(files: ScannedFile[]) {
  const packageJsonCandidates = files
    .filter((file) => path.basename(file.path) === "package.json")
    .sort((a, b) => a.path.split("/").length - b.path.split("/").length);

  const selected = packageJsonCandidates[0];
  if (!selected) {
    return {
      projectName: "unknown-project",
      dependencies: [] as string[],
      devDependencies: [] as string[],
    };
  }

  try {
    const parsed = JSON.parse(selected.content) as {
      name?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    return {
      projectName: parsed.name || "unknown-project",
      dependencies: Object.keys(parsed.dependencies ?? {}).sort(),
      devDependencies: Object.keys(parsed.devDependencies ?? {}).sort(),
    };
  } catch {
    return {
      projectName: "unknown-project",
      dependencies: [] as string[],
      devDependencies: [] as string[],
    };
  }
}

function buildStack(dependencies: string[], devDependencies: string[]): DetectedStack {
  const all = [...dependencies, ...devDependencies].map((item) => item.toLowerCase());

  const pick = (patterns: RegExp[]) =>
    [...new Set(all.filter((dep) => patterns.some((pattern) => pattern.test(dep))))].sort();

  return {
    dependencies,
    devDependencies,
    authLibraries: pick([/auth/, /clerk/, /supabase/, /firebase/, /passport/, /next-auth/, /better-auth/]),
    validationLibraries: pick([/zod/, /joi/, /yup/, /valibot/, /superstruct/]),
    rateLimitLibraries: pick([/rate/, /ratelimit/, /upstash/]),
    loggingLibraries: pick([/pino/, /winston/, /logtail/, /sentry/, /datadog/]),
  };
}

function makeCheck(args: {
  standard: ScorecardCheck["standard"];
  status: ScorecardCheck["status"];
  severity: Severity;
  message: string;
  evidence: Evidence[];
  recommendations: string[];
}): ScorecardCheck {
  return {
    standard: args.standard,
    status: args.status,
    severity: args.severity,
    message: args.message,
    evidence: args.evidence,
    recommendations: args.recommendations,
  };
}

function endpointSourceFiles(endpoints: Endpoint[], files: ScannedFile[]): ScannedFile[] {
  const set = new Set(endpoints.map((endpoint) => endpoint.file));
  return files.filter((file) => set.has(file.path));
}

function fallbackEndpointEvidence(endpointFiles: ScannedFile[], max = 2): Evidence[] {
  return endpointFiles.slice(0, max).map((file) => ({
    file: file.path,
    lineStart: 1,
    lineEnd: Math.min(file.content.split(/\r?\n/).length, 12),
    snippet: file.content.split(/\r?\n/).slice(0, 12).join("\n"),
  }));
}

function evaluateChecks(args: {
  files: ScannedFile[];
  endpoints: Endpoint[];
  stack: DetectedStack;
}): ScorecardCheck[] {
  const { files, endpoints, stack } = args;
  const endpointFiles = endpointSourceFiles(endpoints, files);
  const mutatingEndpoints = endpoints.filter((endpoint) =>
    ["POST", "PUT", "PATCH", "DELETE", "*"].includes(endpoint.method),
  );
  const getEndpoints = endpoints.filter((endpoint) => ["GET", "*"].includes(endpoint.method));

  const contractDataEvidence = firstRegexEvidence(endpointFiles, [
    /NextResponse\.json\(\s*\{[^}]*\bdata\b/is,
    /\.json\(\s*\{[^}]*\bdata\b/is,
    /return\s+\{\s*data\s*:/is,
  ]);
  const contractErrorEvidence = firstRegexEvidence(endpointFiles, [
    /NextResponse\.json\(\s*\{[^}]*\berror\b/is,
    /\.json\(\s*\{[^}]*\berror\b/is,
    /catch\s*\([^)]*\)\s*\{[^}]*\berror\b/is,
  ]);

  const validationEvidence = firstRegexEvidence(endpointFiles, [
    /zod/i,
    /joi/i,
    /yup/i,
    /safeParse\(/,
    /\.parse\(/,
  ]);

  const authEvidence = firstRegexEvidence(endpointFiles, [
    /requireAuth/i,
    /withAuth/i,
    /auth\(/i,
    /getServerSession/i,
    /verifyAuth/i,
    /clerk/i,
    /next-auth/i,
    /better-auth/i,
    /bearer/i,
    /jwt/i,
  ]);

  const authzEvidence = firstRegexEvidence(endpointFiles, [
    /ownerId/i,
    /userId/i,
    /organizationId/i,
    /tenantId/i,
    /role/i,
    /permission/i,
    /forbidden/i,
    /403/,
    /authorize/i,
    /isAdmin/i,
    /can\(/,
  ]);

  const rateLimitEvidence = firstRegexEvidence(files, [
    /@upstash\/ratelimit/i,
    /rate[-_ ]?limit/i,
    /ratelimit/i,
    /rateLimiter/i,
  ]);

  const rateLimitAppliedEvidence = firstRegexEvidence(endpointFiles, [
    /ratelimit/i,
    /rate[-_ ]?limit/i,
    /limit\(/i,
  ]);

  const idempotencyEvidence = firstRegexEvidence(files, [/Idempotency-Key/i, /idempotency/i]);
  const idempotencyStoreEvidence = firstRegexEvidence(files, [
    /redis/i,
    /upstash/i,
    /setnx/i,
    /unique/i,
    /INSERT/i,
    /prisma/i,
  ]);

  const externalCallEvidence = firstRegexEvidence(files, [/fetch\(/, /axios\./, /got\(/]);
  const timeoutEvidence = firstRegexEvidence(files, [
    /AbortController/i,
    /timeout\s*:/i,
    /withTimeout/i,
    /retry\(/i,
    /p-retry/i,
  ]);

  const requestIdEvidence = firstRegexEvidence(files, [
    /requestId/i,
    /x-request-id/i,
    /traceId/i,
    /correlationId/i,
  ]);

  const loggingEvidence = firstRegexEvidence(files, [
    /pino/i,
    /winston/i,
    /logger\./i,
    /console\.(error|warn|info)/i,
  ]);

  const paginationEvidence = firstRegexEvidence(endpointFiles, [
    /cursor/i,
    /pageSize/i,
    /\bpage\b/i,
    /\blimit\b/i,
    /offset/i,
  ]);

  const paginationCapEvidence = firstRegexEvidence(endpointFiles, [
    /Math\.min\(/,
    /maxLimit/i,
    /\.max\(/,
    /limit\s*[<>]=?\s*\d+/i,
  ]);

  const checks: ScorecardCheck[] = [];

  if (!endpoints.length) {
    checks.push(
      makeCheck({
        standard: "Contract",
        status: "unknown",
        severity: "P1",
        message: "No API endpoints were detected in app/api or pages/api.",
        evidence: [],
        recommendations: [
          "Verify API routes exist in app/api/**/route.ts or pages/api/** files.",
        ],
      }),
    );
  } else if (contractDataEvidence.length && contractErrorEvidence.length) {
    checks.push(
      makeCheck({
        standard: "Contract",
        status: "pass",
        severity: "P1",
        message: "Both data and error response envelopes were detected.",
        evidence: [...contractDataEvidence, ...contractErrorEvidence].slice(0, 3),
        recommendations: [
          "Keep envelope shape consistent across all endpoints: { data } or { error }.",
        ],
      }),
    );
  } else if (contractDataEvidence.length || contractErrorEvidence.length) {
    checks.push(
      makeCheck({
        standard: "Contract",
        status: "warn",
        severity: "P1",
        message: "Partial contract consistency detected; data/error envelope coverage is uneven.",
        evidence: [...contractDataEvidence, ...contractErrorEvidence, ...fallbackEndpointEvidence(endpointFiles)].slice(0, 3),
        recommendations: [
          "Adopt a single API response helper to enforce uniform { data }/{ error } envelopes.",
          "Return explicit HTTP status codes for all failure branches.",
        ],
      }),
    );
  } else {
    checks.push(
      makeCheck({
        standard: "Contract",
        status: "fail",
        severity: "P1",
        message: "No consistent data/error API response envelope pattern was found.",
        evidence: fallbackEndpointEvidence(endpointFiles),
        recommendations: [
          "Add centralized helpers like ok(data) and fail(error, status) for all handlers.",
          "Standardize on { data } for success and { error } for failure.",
        ],
      }),
    );
  }

  if (validationEvidence.length) {
    checks.push(
      makeCheck({
        standard: "Validation",
        status: "pass",
        severity: "P1",
        message: "Request validation patterns were detected.",
        evidence: validationEvidence,
        recommendations: [
          "Keep schema validation at API boundaries and map validation errors to field-level responses.",
        ],
      }),
    );
  } else if (stack.validationLibraries.length) {
    checks.push(
      makeCheck({
        standard: "Validation",
        status: "warn",
        severity: "P1",
        message: `Validation libs are installed (${stack.validationLibraries.join(", ")}) but endpoint usage is unclear.`,
        evidence: fallbackEndpointEvidence(endpointFiles),
        recommendations: [
          "Use schema.parse/safeParse on all mutable endpoint inputs.",
          "Return field-level validation errors in a stable shape.",
        ],
      }),
    );
  } else {
    checks.push(
      makeCheck({
        standard: "Validation",
        status: endpoints.length ? "fail" : "unknown",
        severity: "P1",
        message: endpoints.length
          ? "No validation framework usage detected near API handlers."
          : "No API handlers detected to evaluate validation.",
        evidence: fallbackEndpointEvidence(endpointFiles),
        recommendations: [
          "Add request validation with zod/joi/yup for params, body, and query.",
          "Map schema errors to deterministic field-level responses.",
        ],
      }),
    );
  }

  if (!mutatingEndpoints.length) {
    checks.push(
      makeCheck({
        standard: "Auth",
        status: authEvidence.length ? "pass" : "warn",
        severity: "P0",
        message: authEvidence.length
          ? "Auth guard patterns detected."
          : "No mutating endpoints were detected; auth requirements may be limited.",
        evidence: authEvidence.length ? authEvidence : fallbackEndpointEvidence(endpointFiles, 1),
        recommendations: [
          "Protect every non-public mutating route with authentication middleware or route guards.",
        ],
      }),
    );
  } else if (authEvidence.length) {
    checks.push(
      makeCheck({
        standard: "Auth",
        status: "pass",
        severity: "P0",
        message: "Auth guard patterns detected for API handlers.",
        evidence: authEvidence,
        recommendations: ["Keep auth checks close to route entry points to avoid bypass paths."],
      }),
    );
  } else {
    checks.push(
      makeCheck({
        standard: "Auth",
        status: "fail",
        severity: "P0",
        message: "Mutating endpoints detected but no clear auth guard pattern found.",
        evidence: fallbackEndpointEvidence(endpointFiles),
        recommendations: [
          "Require auth middleware/guards for POST, PUT, PATCH, and DELETE endpoints.",
          "Add explicit 401 responses for unauthenticated callers.",
        ],
      }),
    );
  }

  if (!mutatingEndpoints.length) {
    checks.push(
      makeCheck({
        standard: "AuthZ",
        status: "warn",
        severity: "P0",
        message: "No mutating endpoints detected; ownership/role checks could not be fully assessed.",
        evidence: fallbackEndpointEvidence(endpointFiles, 1),
        recommendations: [
          "For all write operations, enforce ownership or role checks after authentication.",
        ],
      }),
    );
  } else if (authzEvidence.length) {
    checks.push(
      makeCheck({
        standard: "AuthZ",
        status: "pass",
        severity: "P0",
        message: "Authorization patterns (ownership/role checks) were detected.",
        evidence: authzEvidence,
        recommendations: [
          "Continue enforcing least-privilege checks and return 403 for denied access.",
        ],
      }),
    );
  } else if (authEvidence.length) {
    checks.push(
      makeCheck({
        standard: "AuthZ",
        status: "warn",
        severity: "P0",
        message: "Authentication exists but ownership/authorization checks are not obvious.",
        evidence: authEvidence,
        recommendations: [
          "Add resource ownership or role-based authorization checks for every mutating route.",
          "Add tests that user A cannot modify user B resources.",
        ],
      }),
    );
  } else {
    checks.push(
      makeCheck({
        standard: "AuthZ",
        status: "fail",
        severity: "P0",
        message: "No clear authorization checks were found for mutating API routes.",
        evidence: fallbackEndpointEvidence(endpointFiles),
        recommendations: [
          "Implement authorization middleware or policy checks tied to resource ownership.",
        ],
      }),
    );
  }

  if (rateLimitEvidence.length && rateLimitAppliedEvidence.length) {
    checks.push(
      makeCheck({
        standard: "RateLimit",
        status: "pass",
        severity: "P1",
        message: "Rate limiting patterns and endpoint usage were detected.",
        evidence: [...rateLimitEvidence, ...rateLimitAppliedEvidence].slice(0, 3),
        recommendations: [
          "Ensure sensitive endpoints use durable shared stores (Redis/Upstash) in production.",
        ],
      }),
    );
  } else if (rateLimitEvidence.length) {
    checks.push(
      makeCheck({
        standard: "RateLimit",
        status: "warn",
        severity: "P1",
        message: "Rate limiting code exists, but applied coverage on endpoints is unclear.",
        evidence: rateLimitEvidence,
        recommendations: [
          "Apply rate limit checks to auth, write, and expensive endpoints.",
          "Use a distributed store for serverless deployments.",
        ],
      }),
    );
  } else {
    checks.push(
      makeCheck({
        standard: "RateLimit",
        status: mutatingEndpoints.length ? "fail" : "warn",
        severity: "P1",
        message: mutatingEndpoints.length
          ? "No rate limiting pattern detected for API handlers."
          : "No clear rate limiting pattern detected.",
        evidence: fallbackEndpointEvidence(endpointFiles, 1),
        recommendations: [
          "Introduce a reusable rate limiter and apply it to sensitive endpoints.",
        ],
      }),
    );
  }

  const postEndpoints = endpoints.filter((endpoint) => endpoint.method === "POST" || endpoint.method === "*");
  if (!postEndpoints.length) {
    checks.push(
      makeCheck({
        standard: "Idempotency",
        status: "unknown",
        severity: "P1",
        message: "No create-style POST endpoints detected to assess idempotency.",
        evidence: [],
        recommendations: [
          "For create endpoints, support Idempotency-Key to prevent duplicate writes.",
        ],
      }),
    );
  } else if (idempotencyEvidence.length && idempotencyStoreEvidence.length) {
    checks.push(
      makeCheck({
        standard: "Idempotency",
        status: "pass",
        severity: "P1",
        message: "Idempotency key handling and persistence signals were detected.",
        evidence: [...idempotencyEvidence, ...idempotencyStoreEvidence].slice(0, 3),
        recommendations: [
          "Ensure key collision windows and response replay logic are documented and tested.",
        ],
      }),
    );
  } else if (idempotencyEvidence.length) {
    checks.push(
      makeCheck({
        standard: "Idempotency",
        status: "warn",
        severity: "P1",
        message: "Idempotency terminology detected, but durable key storage is unclear.",
        evidence: idempotencyEvidence,
        recommendations: [
          "Persist idempotency keys in Redis or DB with TTL and replay cached responses.",
        ],
      }),
    );
  } else {
    checks.push(
      makeCheck({
        standard: "Idempotency",
        status: "fail",
        severity: "P1",
        message: "POST endpoints detected without an Idempotency-Key pattern.",
        evidence: fallbackEndpointEvidence(endpointFiles),
        recommendations: [
          "Require Idempotency-Key for non-idempotent create operations.",
          "Store keys atomically to prevent duplicate side effects.",
        ],
      }),
    );
  }

  if (!externalCallEvidence.length) {
    checks.push(
      makeCheck({
        standard: "Timeouts",
        status: "unknown",
        severity: "P1",
        message: "No obvious external HTTP calls found; timeout/retry requirements are unclear.",
        evidence: [],
        recommendations: [
          "Wrap all outbound calls with explicit timeout and bounded retry policies.",
        ],
      }),
    );
  } else if (timeoutEvidence.length) {
    checks.push(
      makeCheck({
        standard: "Timeouts",
        status: "pass",
        severity: "P1",
        message: "Timeout or retry handling patterns were found for external calls.",
        evidence: [...externalCallEvidence, ...timeoutEvidence].slice(0, 3),
        recommendations: [
          "Keep timeout values explicit and include jittered retry/backoff for transient failures.",
        ],
      }),
    );
  } else {
    checks.push(
      makeCheck({
        standard: "Timeouts",
        status: "fail",
        severity: "P1",
        message: "External calls detected without clear timeout/retry wrappers.",
        evidence: externalCallEvidence,
        recommendations: [
          "Add AbortController or client timeouts to all outbound requests.",
          "Introduce a shared retry utility with bounded attempts and jitter.",
        ],
      }),
    );
  }

  if (requestIdEvidence.length && loggingEvidence.length) {
    checks.push(
      makeCheck({
        standard: "Logging",
        status: "pass",
        severity: "P2",
        message: "Request-id tracing and logging patterns were detected.",
        evidence: [...requestIdEvidence, ...loggingEvidence].slice(0, 3),
        recommendations: ["Keep logs structured JSON and include requestId on all error logs."],
      }),
    );
  } else if (loggingEvidence.length) {
    checks.push(
      makeCheck({
        standard: "Logging",
        status: "warn",
        severity: "P2",
        message: "Logging exists, but request correlation IDs are not obvious.",
        evidence: loggingEvidence,
        recommendations: [
          "Attach requestId/traceId to every request lifecycle log line.",
          "Emit structured error logs with stable fields for alerting.",
        ],
      }),
    );
  } else {
    checks.push(
      makeCheck({
        standard: "Logging",
        status: endpoints.length ? "fail" : "unknown",
        severity: "P2",
        message: endpoints.length
          ? "No structured logging signals were detected in API code."
          : "No API code found to evaluate logging coverage.",
        evidence: fallbackEndpointEvidence(endpointFiles, 1),
        recommendations: [
          "Introduce a shared structured logger and include requestId + endpoint context.",
        ],
      }),
    );
  }

  if (!getEndpoints.length) {
    checks.push(
      makeCheck({
        standard: "Pagination",
        status: "unknown",
        severity: "P2",
        message: "No GET endpoints detected to assess pagination and data limits.",
        evidence: [],
        recommendations: ["Apply cursor/page pagination for list endpoints.", "Cap max limits to protect DB and APIs."],
      }),
    );
  } else if (paginationEvidence.length && paginationCapEvidence.length) {
    checks.push(
      makeCheck({
        standard: "Pagination",
        status: "pass",
        severity: "P2",
        message: "Pagination parameters and max-limit enforcement patterns were detected.",
        evidence: [...paginationEvidence, ...paginationCapEvidence].slice(0, 3),
        recommendations: [
          "Keep server-enforced max page size and document defaults in API contracts.",
        ],
      }),
    );
  } else if (paginationEvidence.length) {
    checks.push(
      makeCheck({
        standard: "Pagination",
        status: "warn",
        severity: "P2",
        message: "Pagination signals found, but hard max-limit enforcement is unclear.",
        evidence: paginationEvidence,
        recommendations: [
          "Enforce max page size with Math.min or schema max constraints.",
          "Reject invalid cursor/page params with 400 + field errors.",
        ],
      }),
    );
  } else {
    checks.push(
      makeCheck({
        standard: "Pagination",
        status: "fail",
        severity: "P2",
        message: "GET endpoints detected without clear pagination/data-limit patterns.",
        evidence: fallbackEndpointEvidence(endpointFiles),
        recommendations: [
          "Add cursor/page pagination for every collection endpoint.",
          "Add hard caps for limit/pageSize values.",
        ],
      }),
    );
  }

  return checks;
}

function computeSummary(checks: ScorecardCheck[]): { score: number; p0: number; p1: number; p2: number } {
  const points = checks.reduce((acc, check) => {
    const value =
      check.status === "pass"
        ? 1
        : check.status === "warn"
          ? 0.5
          : check.status === "unknown"
            ? 0.25
            : 0;
    return acc + value;
  }, 0);

  const score = Math.round((points / Math.max(checks.length, 1)) * 100);

  const counts = checks.reduce(
    (acc, check) => {
      if (!["warn", "fail"].includes(check.status)) return acc;
      if (check.severity === "P0") acc.p0 += 1;
      if (check.severity === "P1") acc.p1 += 1;
      if (check.severity === "P2") acc.p2 += 1;
      return acc;
    },
    { p0: 0, p1: 0, p2: 0 },
  );

  return { score, ...counts };
}

async function extractFilesFromZip(zipBytes: Buffer): Promise<{
  files: ScannedFile[];
  scannedBytes: number;
  skippedLargeFiles: number;
}> {
  const directory = await unzipper.Open.buffer(zipBytes);

  const normalizedPaths: string[] = [];
  for (const entry of directory.files) {
    if (entry.type === "Directory") continue;
    normalizedPaths.push(normalizeZipPath(entry.path));
  }

  const firstSegments = new Set(normalizedPaths.map((entry) => entry.split("/")[0]).filter(Boolean));
  const rootPrefix = firstSegments.size === 1 ? [...firstSegments][0] : null;

  const files: ScannedFile[] = [];
  let scannedBytes = 0;
  let skippedLargeFiles = 0;

  for (const entry of directory.files) {
    if (entry.type === "Directory") continue;

    const safePath = normalizeZipPath(entry.path);
    const relativePath = rootPrefix && safePath.startsWith(`${rootPrefix}/`) ? safePath.slice(rootPrefix.length + 1) : safePath;
    if (!relativePath) continue;

    if (shouldSkipByDirectory(relativePath)) continue;
    if (isBinaryByExtension(relativePath)) continue;
    if (!isTextCandidate(relativePath)) continue;

    if (files.length >= MAX_SCAN_FILES) {
      throw new Error(`File scan cap exceeded (${MAX_SCAN_FILES} files)`);
    }

    if (entry.uncompressedSize > MAX_FILE_BYTES) {
      skippedLargeFiles += 1;
      continue;
    }

    const data = await entry.buffer();
    if (hasNullByte(data)) continue;

    scannedBytes += data.byteLength;
    if (scannedBytes > MAX_TOTAL_BYTES) {
      throw new Error(
        `Total scanned bytes exceeded cap (${Math.floor(MAX_TOTAL_BYTES / (1024 * 1024))}MB)`,
      );
    }

    files.push({
      path: relativePath,
      content: data.toString("utf8"),
      bytes: data.byteLength,
    });
  }

  return { files, scannedBytes, skippedLargeFiles };
}

function extractFilesFromInputs(inputFiles: InputFile[]): {
  files: ScannedFile[];
  scannedBytes: number;
  skippedLargeFiles: number;
} {
  const files: ScannedFile[] = [];
  let scannedBytes = 0;
  let skippedLargeFiles = 0;

  for (const inputFile of inputFiles) {
    const safePath = normalizeZipPath(inputFile.path);
    if (shouldSkipByDirectory(safePath)) continue;
    if (isBinaryByExtension(safePath)) continue;
    if (!isTextCandidate(safePath)) continue;

    if (files.length >= MAX_SCAN_FILES) {
      throw new Error(`File scan cap exceeded (${MAX_SCAN_FILES} files)`);
    }

    const data = Buffer.from(inputFile.content, "utf8");
    if (data.byteLength > MAX_FILE_BYTES) {
      skippedLargeFiles += 1;
      continue;
    }
    if (hasNullByte(data)) continue;

    scannedBytes += data.byteLength;
    if (scannedBytes > MAX_TOTAL_BYTES) {
      throw new Error(
        `Total scanned bytes exceeded cap (${Math.floor(MAX_TOTAL_BYTES / (1024 * 1024))}MB)`,
      );
    }

    files.push({
      path: safePath,
      content: inputFile.content,
      bytes: data.byteLength,
    });
  }

  return { files, scannedBytes, skippedLargeFiles };
}

function buildScanOutput(args: {
  files: ScannedFile[];
  scannedBytes: number;
  skippedLargeFiles: number;
  projectNameHint: string;
}): ScanOutput {
  const router = detectRouter(args.files);
  const endpoints = extractEndpoints(args.files);
  const uiRoutes = detectUiRoutes(args.files);

  const deps = getDependencies(args.files);
  const stack = buildStack(deps.dependencies, deps.devDependencies);

  const checks = evaluateChecks({
    files: args.files,
    endpoints,
    stack,
  });

  const summary = computeSummary(checks);

  const scorecard = standardsScorecardSchema.parse({
    project: {
      name: deps.projectName !== "unknown-project" ? deps.projectName : args.projectNameHint,
      framework: "nextjs",
      router,
    },
    summary,
    endpoints,
    checks,
  });

  return {
    scorecard,
    detectedStack: stack,
    uiRoutes,
    stats: {
      scannedFiles: args.files.length,
      scannedBytes: args.scannedBytes,
      skippedLargeFiles: args.skippedLargeFiles,
    },
  };
}

export async function scanProjectFromZip(args: {
  zipBytes: Buffer;
  projectNameHint: string;
}): Promise<ScanOutput> {
  const extracted = await extractFilesFromZip(args.zipBytes);
  return buildScanOutput({
    files: extracted.files,
    scannedBytes: extracted.scannedBytes,
    skippedLargeFiles: extracted.skippedLargeFiles,
    projectNameHint: args.projectNameHint,
  });
}

export async function scanProjectFromFiles(args: {
  files: InputFile[];
  projectNameHint: string;
}): Promise<ScanOutput> {
  const extracted = extractFilesFromInputs(args.files);
  return buildScanOutput({
    files: extracted.files,
    scannedBytes: extracted.scannedBytes,
    skippedLargeFiles: extracted.skippedLargeFiles,
    projectNameHint: args.projectNameHint,
  });
}

export function compactChecksForAi(scorecard: StandardsScorecard) {
  return scorecard.checks.map((check) => ({
    standard: check.standard,
    status: check.status,
    severity: check.severity,
    message: check.message,
    evidence: check.evidence.map((evidence) => ({
      file: evidence.file,
      lineStart: evidence.lineStart,
      lineEnd: evidence.lineEnd,
      snippet: evidence.snippet.split(/\r?\n/).slice(0, 15).join("\n"),
    })),
    recommendations: check.recommendations,
  }));
}

export function scannerNotes(stats: ScanOutput["stats"]): string[] {
  const notes = [
    `Static scan only. No uploaded code was executed.`,
    `Scanned ${stats.scannedFiles} text files (${(stats.scannedBytes / (1024 * 1024)).toFixed(2)} MB).`,
  ];

  if (stats.skippedLargeFiles > 0) {
    notes.push(
      `Skipped ${stats.skippedLargeFiles} files larger than ${Math.floor(MAX_FILE_BYTES / 1024)} KB each.`,
    );
  }

  if (stats.scannedBytes > LARGE_FILE_WARN_THRESHOLD) {
    notes.push("Consider narrowing scan scope if response times increase on serverless deployments.");
  }

  return notes;
}
