import fs from "node:fs";
import path from "node:path";

import { getDbClient } from "@/lib/db/client";

type RuleRow = {
  id: string;
  title: string;
  category: string;
  priority: string;
  description: string;
  contents: Record<string, unknown>;
  enabled: boolean;
};

type RuleInput = {
  id: string;
  title: string;
  category: string;
  critical?: boolean;
  sourceSection?: string;
  ruleKind?: string;
  scope: string;
  howToDetect: string;
  pass: string;
  fail: string;
};

function loadDotEnvLocal(): void {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;

  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function defaultPriority(category: string, critical?: boolean): string {
  if (critical) return "P0";
  if (["AUT", "VAL", "RLM", "LOG", "TMO"].includes(category)) return "P1";
  return "P2";
}

function toRule(input: RuleInput): RuleRow {
  return {
    id: input.id,
    title: input.title,
    category: input.category,
    priority: defaultPriority(input.category, input.critical),
    description: input.howToDetect,
    contents: {
      spec: "server-api-audit-v1.0",
      scoring_included: false,
      critical: Boolean(input.critical),
      source_section: input.sourceSection ?? null,
      rule_kind: input.ruleKind ?? "check",
      scope: input.scope,
      how_to_detect: input.howToDetect,
      pass_criteria: input.pass,
      fail_criteria: input.fail,
    },
    enabled: true,
  };
}

const CHECKS: RuleInput[] = [
  {
    id: "APC-01",
    title: "Consistent response envelope",
    category: "APC",
    sourceSection: "C.1",
    scope: "all route/handler files",
    howToDetect:
      "Inspect res.json / NextResponse.json payload shapes and verify >=90% use a single envelope contract.",
    pass: "At least 90% of endpoints use an identical envelope (for example {data,error} or {success,result}).",
    fail: "Mixed envelope shapes or no discernible envelope pattern.",
  },
  {
    id: "APC-02",
    title: "HTTP status code correctness",
    category: "APC",
    sourceSection: "C.1",
    scope: "all route/handler files",
    howToDetect:
      "Scan status setters and flag POST-create flows returning 200 or error branches returning 200.",
    pass: "Status codes align with verb and error semantics.",
    fail: "POST create returns 200 or errors return 200.",
  },
  {
    id: "APC-03",
    title: "Explicit method handlers",
    category: "APC",
    sourceSection: "C.1",
    scope: "all route/handler files",
    howToDetect:
      "Next.js uses named method exports; Express/Fastify avoid catch-all req.method branching handlers.",
    pass: "Each method is handled explicitly by framework-native method handlers.",
    fail: "Catch-all route branches on req.method instead of explicit handlers.",
  },
  {
    id: "VAL-01",
    title: "Schema validation on mutation endpoints",
    category: "VAL",
    critical: true,
    sourceSection: "C.2",
    scope: "route handlers + dto/schema/validators directories",
    howToDetect:
      "For POST/PUT/PATCH, validate request with zod/joi/yup/class-validator/valibot before DB write or service side-effect.",
    pass: "Every mutation endpoint validates input before writes.",
    fail: "Any mutation endpoint performs write/service call without prior validation.",
  },
  {
    id: "VAL-02",
    title: "Field-level validation errors",
    category: "VAL",
    sourceSection: "C.2",
    scope: "route handlers + validators",
    howToDetect:
      "Error shape includes field-level detail (errors[{field,message}], zod flatten, joi details, ValidationPipe output).",
    pass: "Validation errors include field identifier and message.",
    fail: "Only generic invalid-input message, no field-level detail.",
  },
  {
    id: "VAL-03",
    title: "Validated query params",
    category: "VAL",
    sourceSection: "C.2",
    scope: "GET list handlers",
    howToDetect:
      "limit/page/cursor/sort/filter are parsed/coerced through schema before use.",
    pass: "Query params are validated/coerced before processing.",
    fail: "Raw req.query values used directly.",
  },
  {
    id: "VAL-04",
    title: "Typed path params",
    category: "VAL",
    sourceSection: "C.2",
    scope: "handlers with :id or [id] params",
    howToDetect:
      "Path params parsed and type-checked (uuid/int pipes/parsers) before DB query.",
    pass: "Path params validated and typed before DB usage.",
    fail: "Raw path param passed directly to DB query.",
  },
  {
    id: "AUT-01",
    title: "Auth enforcement on protected routes",
    category: "AUT",
    critical: true,
    sourceSection: "C.3",
    scope: "route files + middleware/guards + auth directory",
    howToDetect:
      "Protected routes invoke session/token verification middleware/guards before DB access; public routes explicitly marked.",
    pass: "All protected routes enforce authentication before sensitive operations.",
    fail: "Any protected route reaches DB/sensitive logic without auth check.",
  },
  {
    id: "AUT-02",
    title: "Resource ownership authorization",
    category: "AUT",
    critical: true,
    sourceSection: "C.3",
    scope: "resource-by-id endpoints",
    howToDetect:
      "After loading resource, assert ownership or equivalent policy before return/mutation.",
    pass: "Ownership/policy checked before all resource access and mutation.",
    fail: "Resource returned or mutated without ownership/policy assertion.",
  },
  {
    id: "AUT-03",
    title: "Cryptographic token verification",
    category: "AUT",
    sourceSection: "C.3",
    scope: "auth handling code",
    howToDetect:
      "Use jwt.verify (or equivalent), not decode-only; session backed by DB/cache validation, not cookie-presence only.",
    pass: "Tokens/sessions are cryptographically or server-side validated.",
    fail: "Decode-only or mere token/cookie presence checks.",
  },
  {
    id: "AUT-04",
    title: "Sensitive fields excluded from responses",
    category: "AUT",
    sourceSection: "C.3",
    scope: "response builders + ORM selectors/DTO mappers",
    howToDetect:
      "Scan response objects for password/passwordHash/secret/apiKey/token leakage; verify select exclusions or DTO mapping.",
    pass: "Sensitive fields are excluded from all API responses.",
    fail: "Sensitive credential fields appear in API response payloads.",
  },
  {
    id: "RLM-01",
    title: "Rate-limit dependency present",
    category: "RLM",
    sourceSection: "C.4",
    scope: "package.json dependencies",
    howToDetect:
      "Dependency set includes known rate-limit library (express-rate-limit, @nestjs/throttler, rate-limiter-flexible, @upstash/ratelimit).",
    pass: "A rate-limit library is installed.",
    fail: "No rate-limit dependency detected.",
  },
  {
    id: "RLM-02",
    title: "Rate limiting on auth endpoints",
    category: "RLM",
    critical: true,
    sourceSection: "C.4",
    scope: "middleware + auth/login/signup/token/password routes",
    howToDetect:
      "Rate limiter applied to all auth endpoints or globally; flag exclusions on auth routes.",
    pass: "All auth endpoints are covered by rate limiting.",
    fail: "Auth endpoints are excluded or uncovered by rate limiting.",
  },
  {
    id: "RLM-03",
    title: "Persistent rate-limit store",
    category: "RLM",
    sourceSection: "C.4",
    scope: "rate limiter configuration",
    howToDetect:
      "Store config references Redis/Upstash/KV; fail on MemoryStore/default in-memory only.",
    pass: "Rate limiter uses persistent/distributed backing store.",
    fail: "In-memory/default store only.",
  },
  {
    id: "RLM-04",
    title: "Rate-limit headers exposed",
    category: "RLM",
    sourceSection: "C.4",
    scope: "response headers/middleware config",
    howToDetect:
      "Presence of X-RateLimit-Limit/X-RateLimit-Remaining/Retry-After.",
    pass: "Rate-limit headers are emitted.",
    fail: "No rate-limit headers configured.",
  },
  {
    id: "IDP-01",
    title: "Idempotency on financial/booking POST",
    category: "IDP",
    sourceSection: "C.5",
    scope: "POST handlers on order|booking|payment|checkout|purchase|transaction|charge|invoice",
    howToDetect:
      "Read Idempotency-Key/x-idempotency-key or apply idempotency middleware (Stripe SDK handling acceptable).",
    pass: "All in-scope POST endpoints enforce idempotency mechanism.",
    fail: "In-scope POST endpoint lacks idempotency mechanism.",
  },
  {
    id: "IDP-02",
    title: "Idempotency key persisted + replayed",
    category: "IDP",
    sourceSection: "C.5",
    scope: "idempotency middleware/storage logic",
    howToDetect:
      "Lookup by key before processing and persist key/result after processing.",
    pass: "Idempotency key lookup and result storage both implemented.",
    fail: "Key read without durable write/replay storage.",
  },
  {
    id: "IDP-03",
    title: "Idempotency key expiry",
    category: "IDP",
    sourceSection: "C.5",
    scope: "idempotency key storage",
    howToDetect:
      "Stored key has TTL/expiry (SET EX/SETEX/expiresAt/expireAt).",
    pass: "Idempotency records include expiry/TTL.",
    fail: "Idempotency records have no expiry.",
  },
  {
    id: "TMO-01",
    title: "Outbound HTTP timeouts",
    category: "TMO",
    sourceSection: "C.6",
    scope: "files making external HTTP calls",
    howToDetect:
      "fetch uses AbortController signal; axios/got/ky specify timeout.",
    pass: "All outbound HTTP calls include timeout handling.",
    fail: "Any bare outbound call without timeout.",
  },
  {
    id: "TMO-02",
    title: "DB query timeout",
    category: "TMO",
    sourceSection: "C.6",
    scope: "files making DB calls",
    howToDetect:
      "Prisma transaction timeout/statement_timeout, Mongoose maxTimeMS, or equivalent DB timeout settings.",
    pass: "DB operations have timeout controls.",
    fail: "No DB timeout controls found.",
  },
  {
    id: "TMO-03",
    title: "Retries limited to idempotent operations",
    category: "TMO",
    sourceSection: "C.6",
    scope: "retry wrappers and callers",
    howToDetect:
      "Retry usage constrained to GET/idempotent calls or mutation calls with explicit idempotency guarantees.",
    pass: "Retries are only used on idempotent-safe operations.",
    fail: "Non-idempotent mutation retried without idempotency protection.",
  },
  {
    id: "TMO-04",
    title: "Exponential backoff",
    category: "TMO",
    sourceSection: "C.6",
    scope: "retry delay logic",
    howToDetect:
      "Retry delay grows exponentially (library/manual); fixed constant delay loops fail.",
    pass: "Retry policy uses exponential backoff (prefer jitter).",
    fail: "Retry policy uses fixed delay.",
  },
  {
    id: "LOG-01",
    title: "Request ID per request",
    category: "LOG",
    sourceSection: "C.7",
    scope: "middleware and request lifecycle hooks",
    howToDetect:
      "Generate and attach requestId/traceId to request context or X-Request-Id header.",
    pass: "Each request gets a correlation/request ID.",
    fail: "No request ID generation/attachment found.",
  },
  {
    id: "LOG-02",
    title: "Errors logged with context",
    category: "LOG",
    critical: true,
    sourceSection: "C.7",
    scope: "all catch blocks and global handlers",
    howToDetect:
      "Catch blocks log errors with contextual fields like requestId/userId/route/stack; empty catch or silent return fails.",
    pass: "All catch blocks log errors with context.",
    fail: "Any catch block swallows errors or returns without logging context.",
  },
  {
    id: "LOG-03",
    title: "Structured logger usage",
    category: "LOG",
    sourceSection: "C.7",
    scope: "route and middleware files",
    howToDetect:
      "Use pino/winston/bunyan/Nest Logger; console-only logging fails.",
    pass: "Structured logger is used in server code.",
    fail: "Only console logging is used.",
  },
  {
    id: "LOG-04",
    title: "Request access logging middleware",
    category: "LOG",
    sourceSection: "C.7",
    scope: "middleware and framework setup",
    howToDetect:
      "Access logging present (morgan/pino-http/interceptor/custom middleware logging method/path/status).",
    pass: "Request access logging middleware is configured.",
    fail: "No request access logging middleware found.",
  },
  {
    id: "PAG-01",
    title: "Pagination params on list endpoints",
    category: "PAG",
    sourceSection: "C.8",
    scope: "GET handlers returning collections",
    howToDetect:
      "List queries use limit+offset/page+pageSize/cursor inputs; unbounded list queries fail.",
    pass: "All list endpoints accept pagination parameters.",
    fail: "Any list endpoint returns full set without pagination params.",
  },
  {
    id: "PAG-02",
    title: "Server-side max limit cap",
    category: "PAG",
    sourceSection: "C.8",
    scope: "GET list handlers",
    howToDetect:
      "Apply hard cap (Math.min / schema.max / @Max) before DB call.",
    pass: "User-supplied limit is capped by server max.",
    fail: "Raw user limit passed directly to DB.",
  },
  {
    id: "PAG-03",
    title: "Pagination metadata in response",
    category: "PAG",
    sourceSection: "C.8",
    scope: "paginated list responses",
    howToDetect:
      "Response includes count/total/totalPages/hasNextPage metadata.",
    pass: "List responses include pagination metadata.",
    fail: "List response has data array only, no pagination metadata.",
  },
  {
    id: "PAG-04",
    title: "Opaque cursor encoding",
    category: "PAG",
    sourceSection: "C.8",
    scope: "cursor pagination responses",
    howToDetect:
      "Cursor tokens are encoded/opaque (base64 or encrypted), not raw DB ids.",
    pass: "Cursor values are opaque/encoded.",
    fail: "Cursor exposes raw DB primary key/id.",
  },
];

const STRUCTURAL_GAPS: RuleInput[] = [
  {
    id: "STR-01",
    title: "Missing rate-limit infrastructure",
    category: "STRUCTURAL",
    critical: true,
    sourceSection: "D.1",
    ruleKind: "structural_gap",
    scope: "dependencies + middleware",
    howToDetect: "No rate-limit library or middleware for public-facing endpoints.",
    pass: "Rate-limit library and middleware/module exists and is wired.",
    fail: "Rate-limit infrastructure missing.",
  },
  {
    id: "STR-02",
    title: "Missing auth middleware/guard",
    category: "STRUCTURAL",
    critical: true,
    sourceSection: "D.1",
    ruleKind: "structural_gap",
    scope: "middleware/guards + protected routes",
    howToDetect: "Protected routes exist with no shared auth middleware/guard pattern.",
    pass: "Auth middleware/guard exists and is used on protected routes.",
    fail: "No auth middleware/guard detected for protected routes.",
  },
  {
    id: "STR-03",
    title: "Missing global error handler",
    category: "STRUCTURAL",
    sourceSection: "D.1",
    ruleKind: "structural_gap",
    scope: "middleware and app bootstrap",
    howToDetect: "No centralized catch-all error handler or exception filter.",
    pass: "Global error handler/filter configured.",
    fail: "No global error handling infrastructure.",
  },
  {
    id: "STR-04",
    title: "Missing request logging middleware",
    category: "STRUCTURAL",
    sourceSection: "D.1",
    ruleKind: "structural_gap",
    scope: "middleware/bootstrap",
    howToDetect: "No request lifecycle logging middleware/interceptor.",
    pass: "Request logging middleware/interceptor configured.",
    fail: "No request logging middleware/interceptor.",
  },
  {
    id: "STR-05",
    title: "Missing schema validation infrastructure",
    category: "STRUCTURAL",
    critical: true,
    sourceSection: "D.1",
    ruleKind: "structural_gap",
    scope: "dependencies + dto/schema/validators",
    howToDetect: "No validation library or validation layer for mutation endpoints.",
    pass: "Validation library and schema/dto infrastructure present.",
    fail: "Validation infrastructure missing.",
  },
  {
    id: "STR-06",
    title: "Missing requestId middleware",
    category: "STRUCTURAL",
    sourceSection: "D.1",
    ruleKind: "structural_gap",
    scope: "middleware",
    howToDetect: "No middleware generating/propagating request correlation id.",
    pass: "Request ID middleware exists and attaches IDs per request.",
    fail: "No request ID middleware.",
  },
  {
    id: "STR-07",
    title: "No timeouts on outbound calls",
    category: "STRUCTURAL",
    sourceSection: "D.1",
    ruleKind: "structural_gap",
    scope: "all outbound HTTP integrations",
    howToDetect: "Outbound HTTP calls detected with no timeout policy on any call site.",
    pass: "Timeout policy implemented for outbound calls.",
    fail: "No timeout policy on outbound calls.",
  },
];

const EXPECTED_INFRASTRUCTURE: RuleInput[] = [
  {
    id: "INF-01",
    title: "Auth middleware or guard file exists",
    category: "STRUCTURAL_EXPECTED",
    critical: true,
    sourceSection: "D.2",
    ruleKind: "expected_infrastructure",
    scope: "middleware/auth.ts or guards/auth.guard.ts",
    howToDetect:
      "Detect dedicated auth middleware/guard pattern when protected routes exist.",
    pass: "Auth middleware/guard file exists and is wired for protected routes.",
    fail: "No auth middleware/guard file pattern found.",
  },
  {
    id: "INF-02",
    title: "Rate limiter middleware/module exists",
    category: "STRUCTURAL_EXPECTED",
    critical: true,
    sourceSection: "D.2",
    ruleKind: "expected_infrastructure",
    scope: "middleware/rateLimiter.ts or throttler.module.ts",
    howToDetect:
      "Detect reusable rate limiting infrastructure for public-facing endpoints.",
    pass: "Rate limiting module/middleware exists and is configured.",
    fail: "No shared rate limiter infrastructure found.",
  },
  {
    id: "INF-03",
    title: "RequestId middleware or pino-http setup exists",
    category: "STRUCTURAL_EXPECTED",
    sourceSection: "D.2",
    ruleKind: "expected_infrastructure",
    scope: "middleware/requestId.ts or pino-http bootstrap",
    howToDetect:
      "Detect request correlation id generation and propagation middleware.",
    pass: "RequestId middleware or pino-http context setup is present.",
    fail: "No request id infrastructure detected.",
  },
  {
    id: "INF-04",
    title: "Global error handling exists",
    category: "STRUCTURAL_EXPECTED",
    sourceSection: "D.2",
    ruleKind: "expected_infrastructure",
    scope: "middleware/errorHandler.ts or global exception filter",
    howToDetect:
      "Detect centralized catch-all error middleware/filter.",
    pass: "Global error handler/filter is configured.",
    fail: "No centralized global error handling found.",
  },
  {
    id: "INF-05",
    title: "Structured logger setup exists",
    category: "STRUCTURAL_EXPECTED",
    sourceSection: "D.2",
    ruleKind: "expected_infrastructure",
    scope: "lib/logger.ts or equivalent logger bootstrap",
    howToDetect:
      "Detect shared structured logger setup for server routes.",
    pass: "Structured logger setup exists.",
    fail: "No shared structured logger setup found.",
  },
  {
    id: "INF-06",
    title: "Validation schema directory exists",
    category: "STRUCTURAL_EXPECTED",
    critical: true,
    sourceSection: "D.2",
    ruleKind: "expected_infrastructure",
    scope: "dto/ or schemas/ or validators/",
    howToDetect:
      "Detect schema/dto/validator directory when mutation endpoints exist.",
    pass: "Validation schema directory structure exists.",
    fail: "No dto/schemas/validators structure found.",
  },
  {
    id: "INF-07",
    title: "Idempotency helper exists for financial flows",
    category: "STRUCTURAL_EXPECTED",
    sourceSection: "D.2",
    ruleKind: "expected_infrastructure",
    scope: "lib/idempotency.ts or equivalent",
    howToDetect:
      "Detect reusable idempotency helper for payment/order/booking routes.",
    pass: "Idempotency helper exists for financial/booking flows.",
    fail: "No idempotency helper detected for financial/booking scope.",
  },
  {
    id: "INF-08",
    title: "Shared cache/redis helper exists",
    category: "STRUCTURAL_EXPECTED",
    sourceSection: "D.2",
    ruleKind: "expected_infrastructure",
    scope: "lib/redis.ts or lib/cache.ts",
    howToDetect:
      "Detect shared cache/redis abstraction for rate limiting or idempotency.",
    pass: "Shared cache/redis helper exists.",
    fail: "No cache/redis helper found.",
  },
];

const SCAN_SCOPE_RULES: RuleInput[] = [
  {
    id: "B-SCAN-01",
    title: "Recursive scan with excluded build/vendor folders",
    category: "SCAN_SCOPE",
    sourceSection: "B.2",
    ruleKind: "scan_scope",
    scope: "repo root recursive scan",
    howToDetect:
      "Scan recursively from root_dir while skipping node_modules, dist, .next, and build.",
    pass: "Scanner recursively evaluates source scope and excludes build/vendor directories.",
    fail: "Scanner does not recurse correctly or includes excluded directories.",
  },
  {
    id: "B-SCAN-02",
    title: "Test files excluded from audit",
    category: "SCAN_SCOPE",
    sourceSection: "B.2",
    ruleKind: "scan_scope",
    scope: "*.test.ts, *.spec.ts, *.e2e.ts",
    howToDetect:
      "Treat test files as test scope and do not include them in audit findings.",
    pass: "Test files are excluded from audit checks and only used for context/coverage signals.",
    fail: "Test files are audited as production code scope.",
  },
  {
    id: "B-SCAN-03",
    title: "Unknown stack fallback scanning",
    category: "SCAN_SCOPE",
    sourceSection: "B.2",
    ruleKind: "scan_scope",
    scope: "*.ts, *.js, *.mjs (non-test, non-node_modules)",
    howToDetect:
      "When stack cannot be detected, scan all supported source file types with standard exclusions.",
    pass: "Unknown stack fallback path is implemented and applied.",
    fail: "Unknown stack leaves source unscanned or uses incorrect file scope.",
  },
  {
    id: "B-RULE-01",
    title: "Static-only analysis constraint",
    category: "SCAN_SCOPE",
    sourceSection: "B.2",
    ruleKind: "constraint",
    scope: "auditor execution model",
    howToDetect:
      "Ensure analysis does not execute application code, install dependencies, or run project scripts.",
    pass: "Audit executes as static analysis only.",
    fail: "Audit process executes runtime code or install/build/test commands.",
  },
  {
    id: "B-RULE-02",
    title: "One-level import trace constraint",
    category: "SCAN_SCOPE",
    sourceSection: "B.2",
    ruleKind: "constraint",
    scope: "route handler import graph",
    howToDetect:
      "If pattern found in shared utility imported by a route handler, count it; trace only one import level deep.",
    pass: "Import tracing is limited to one level and still credits direct shared utility usage.",
    fail: "Import tracing is deeper than one level or ignores first-level shared utilities.",
  },
];

const QUALITY_GATES: RuleInput[] = [
  {
    id: "GATE-A1",
    title: "All route files scanned",
    category: "QUALITY_GATE",
    sourceSection: "F",
    ruleKind: "quality_gate",
    scope: "discovered route files",
    howToDetect:
      "Compare discovered route files against scanned route files and require full coverage.",
    pass: "100% of discovered route files are scanned.",
    fail: "Any discovered route file is missing from scan coverage.",
  },
  {
    id: "GATE-A2",
    title: "Violation payload completeness",
    category: "QUALITY_GATE",
    sourceSection: "F",
    ruleKind: "quality_gate",
    scope: "violation records",
    howToDetect:
      "Each violation must include check_id, severity, pts_lost, file, pattern_expected, pattern_found, and fix_hint.",
    pass: "All violations contain required fields.",
    fail: "One or more violations are missing required fields.",
  },
  {
    id: "GATE-A3",
    title: "All score categories present",
    category: "QUALITY_GATE",
    sourceSection: "F",
    ruleKind: "quality_gate",
    scope: "scores.by_category",
    howToDetect:
      "Ensure response has all 8 category keys (APC, VAL, AUT, RLM, IDP, TMO, LOG, PAG).",
    pass: "All 8 categories are present.",
    fail: "One or more category keys are missing.",
  },
  {
    id: "GATE-A4",
    title: "Critical summary count consistency",
    category: "QUALITY_GATE",
    sourceSection: "F",
    ruleKind: "quality_gate",
    scope: "summary + violations",
    howToDetect:
      "Validate summary.critical_violations equals actual count of critical violations.",
    pass: "Summary critical count matches computed violation count.",
    fail: "Summary critical count does not match computed count.",
  },
  {
    id: "GATE-A5",
    title: "Stack detection and scope validity",
    category: "QUALITY_GATE",
    sourceSection: "F",
    ruleKind: "quality_gate",
    scope: "stack_detected + scan scope",
    howToDetect:
      "Require stack_detected not unknown for strict pass; fallback scan must be logged when unknown.",
    pass: "Stack is detected and correct scope is applied.",
    fail: "Stack is unknown without proper fallback warning/scope handling.",
  },
  {
    id: "F-RULE-01",
    title: "No runtime execution in audit pipeline",
    category: "QUALITY_GATE",
    sourceSection: "F",
    ruleKind: "constraint",
    scope: "audit execution model",
    howToDetect:
      "Prohibit npm install, ts-node, or runtime execution commands during audit.",
    pass: "No runtime/install commands are executed.",
    fail: "Audit flow executes runtime/install commands.",
  },
  {
    id: "F-RULE-02",
    title: "Unparseable file handling",
    category: "QUALITY_GATE",
    sourceSection: "F",
    ruleKind: "constraint",
    scope: "file parser pipeline",
    howToDetect:
      "Unparseable files are marked status=unparseable, skipped, and logged.",
    pass: "Unparseable files are skipped with explicit status/log entries.",
    fail: "Unparseable files crash scan or are silently ignored.",
  },
  {
    id: "F-RULE-03",
    title: "Import depth limit enforcement",
    category: "QUALITY_GATE",
    sourceSection: "F",
    ruleKind: "constraint",
    scope: "import graph tracing",
    howToDetect:
      "Enforce one-level import graph traversal; no recursive barrel traversal.",
    pass: "Import traversal is capped at one level.",
    fail: "Import traversal exceeds one level.",
  },
];

const ALL_RULES: RuleRow[] = [
  ...CHECKS,
  ...STRUCTURAL_GAPS,
  ...EXPECTED_INFRASTRUCTURE,
  ...SCAN_SCOPE_RULES,
  ...QUALITY_GATES,
].map(toRule);

async function main(): Promise<void> {
  loadDotEnvLocal();

  const db = getDbClient();

  const { error } = await db.from("rules").upsert(ALL_RULES, { onConflict: "id" });
  if (error) {
    if (/relation .* does not exist|Could not find the table/i.test(error.message)) {
      throw new Error(
        "Table `rules` is missing. Apply migration qa-web/supabase/migrations/20260228_rules_table.sql first.",
      );
    }
    throw new Error(error.message);
  }

  const { count, error: countError } = await db
    .from("rules")
    .select("id", { count: "exact", head: true });

  if (countError) {
    throw new Error(countError.message);
  }

  console.log(`Upserted ${ALL_RULES.length} API audit rules into public.rules.`);
  console.log(`Current total rows in public.rules: ${count ?? 0}`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
