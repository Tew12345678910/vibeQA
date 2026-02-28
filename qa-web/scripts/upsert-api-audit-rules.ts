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
  targets: string[];
  signals: string[];
  skill_tags: string[];
  version: string;
  lesson_enabled: boolean;
  enabled: boolean;
};

type RuleInput = {
  id: string;
  title: string;
  category: string;
  priority?: string;
  critical?: boolean;
  specVersion?: string;
  sourceSection?: string;
  ruleKind?: string;
  standardRefs?: Array<{ name: string; control: string; url: string }>;
  supersedes?: string[];
  overlapsWith?: string[];
  scope: string;
  howToDetect: string;
  pass: string;
  fail: string;
};

type RuleEducation = {
  why_it_matters: string;
  rule_of_thumb: string;
  common_pitfalls: string[];
};

type RuleRemediation = {
  recommended_pattern?: string;
  recommended_envelope?: Record<string, unknown>;
  implementation_steps: string[];
  acceptance_criteria: string[];
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
  if (["AUT", "VAL", "RLM", "LOG", "TMO", "SECAPI"].includes(category)) return "P1";
  return "P2";
}

function uniq(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const value = item.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function inferTargets(input: RuleInput): string[] {
  const scope = input.scope.toLowerCase();
  const baseRouteTargets = [
    "app/api/**/route.ts",
    "app/api/**/*.ts",
    "pages/api/**/*.ts",
    "src/app/api/**/route.ts",
    "src/pages/api/**/*.ts",
    "server/**/*.ts",
  ];

  const structuralTargets = [
    "src/**/*.ts",
    "server/**/*.ts",
    "app/**/*.ts",
    "pages/**/*.ts",
    "middleware/**/*.ts",
    "**/middleware.ts",
    "**/middleware.js",
    "**/middleware.mjs",
    "**/package.json",
  ];

  if (scope.includes("package.json") || scope.includes("dependencies")) {
    return ["package.json", "**/package.json"];
  }

  if (scope.includes("dto") || scope.includes("schema") || scope.includes("validator")) {
    return uniq([
      ...baseRouteTargets,
      "**/dto/**/*.ts",
      "**/schema/**/*.ts",
      "**/schemas/**/*.ts",
      "**/validator/**/*.ts",
      "**/validators/**/*.ts",
    ]);
  }

  if (scope.includes("middleware") || scope.includes("guard") || scope.includes("bootstrap")) {
    return uniq([
      ...baseRouteTargets,
      "middleware/**/*.ts",
      "**/middleware.ts",
      "**/middleware.js",
      "**/middleware.mjs",
      "**/guards/**/*.ts",
      "**/interceptors/**/*.ts",
      "**/src/main.ts",
    ]);
  }

  if (scope.includes("logger")) {
    return uniq([
      ...baseRouteTargets,
      "**/logger/**/*.ts",
      "**/lib/logger.ts",
      "middleware/**/*.ts",
    ]);
  }

  if (input.category === "SCAN_SCOPE" || input.category === "QUALITY_GATE") {
    return ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.mjs", "package.json"];
  }

  if (input.category === "STRUCTURAL" || input.category === "STRUCTURAL_EXPECTED") {
    return structuralTargets;
  }

  return baseRouteTargets;
}

function inferSignals(input: RuleInput): string[] {
  const byCategory: Record<string, string[]> = {
    APC: ["NextResponse.json(", "res.status(", "res.json(", "Allow", "Problem Details"],
    VAL: ["zod", "joi", "yup", "safeParse(", "ValidationPipe", "schema.parse("],
    AUT: ["getServerSession(", "jwt.verify(", "Authorization", "session", "role", "permission"],
    RLM: ["rateLimit(", "@upstash/ratelimit", "Retry-After", "X-RateLimit-", "throttler"],
    IDP: ["Idempotency-Key", "x-idempotency-key", "idempotency", "replay", "409"],
    TMO: ["AbortController", "timeout", "maxTimeMS", "statement_timeout", "retry", "backoff"],
    LOG: ["requestId", "traceId", "logger.", "pino", "winston", "morgan"],
    PAG: ["limit", "offset", "cursor", "pageSize", "hasNextPage", "totalPages"],
    SECAPI: ["cors(", "Access-Control-Allow-Origin", "Cache-Control", "no-store", "fetch(", "URL("],
    STRUCTURAL: ["middleware", "guard", "module", "bootstrap", "infrastructure"],
    STRUCTURAL_EXPECTED: ["middleware", "guard", "module", "lib/", "shared"],
    SCAN_SCOPE: ["node_modules", "dist", ".next", "*.test.ts", "*.spec.ts", "static analysis"],
    QUALITY_GATE: ["coverage", "violation", "summary", "stack_detected", "unparseable"],
  };

  const combinedText = `${input.howToDetect} ${input.pass} ${input.fail}`;
  const callSeeds = Array.from(
    new Set(combinedText.match(/\b[A-Za-z_][A-Za-z0-9_.]{2,}\(/g) ?? []),
  ).slice(0, 8);

  return uniq([...(byCategory[input.category] ?? []), ...callSeeds]);
}

function inferSkillTags(input: RuleInput): string[] {
  const byCategory: Record<string, string[]> = {
    APC: ["api-contracts", "http-semantics"],
    VAL: ["input-validation", "schema-design"],
    AUT: ["authentication", "authorization"],
    RLM: ["rate-limiting", "abuse-prevention"],
    IDP: ["idempotency", "consistency"],
    TMO: ["timeouts-retries", "resilience"],
    LOG: ["observability", "audit-logging"],
    PAG: ["pagination", "query-safety"],
    SECAPI: ["api-security", "transport-security"],
    STRUCTURAL: ["architecture", "security-baseline"],
    STRUCTURAL_EXPECTED: ["infrastructure-readiness", "architecture"],
    SCAN_SCOPE: ["scanner-scope", "static-analysis"],
    QUALITY_GATE: ["quality-gates", "audit-integrity"],
  };
  return byCategory[input.category] ?? ["secure-coding"];
}

function inferEducation(input: RuleInput): RuleEducation {
  const defaults = {
    why_it_matters:
      "This control prevents silent regressions that degrade reliability and security over time.",
    rule_of_thumb:
      "Treat the pass criteria as the default contract and block changes that violate it.",
    common_pitfalls: [
      "Implementing the check in one endpoint but not shared handlers.",
      "Relying on conventions without automated verification.",
      "Fixing symptoms while leaving the root contract undefined.",
    ],
  } satisfies RuleEducation;

  const templates: Record<string, RuleEducation> = {
    APC: {
      why_it_matters:
        "Predictable API contracts reduce integration bugs and make failures diagnosable. Inconsistent envelopes and status codes cause client-side retry, parsing, and caching errors.",
      rule_of_thumb:
        "Use one documented response contract and map each outcome to the correct HTTP status every time.",
      common_pitfalls: [
        "Returning 200 for error states because exceptions are swallowed.",
        "Letting each handler define a bespoke error payload.",
        "Forgetting to include `Allow`/negotiation behavior for unsupported methods.",
        "Mixing framework defaults with custom contracts without normalization.",
      ],
    },
    VAL: {
      why_it_matters:
        "Input validation blocks malformed and malicious data before it reaches persistence or side effects. Early validation failures are cheaper to detect and safer to recover from.",
      rule_of_thumb:
        "Validate and coerce every external input at the boundary before business logic runs.",
      common_pitfalls: [
        "Validating only body payloads while leaving query/path params unchecked.",
        "Accepting unknown fields that trigger mass-assignment issues.",
        "Returning generic validation messages with no field context.",
        "Using runtime type assertions without hard schema enforcement.",
      ],
    },
    AUT: {
      why_it_matters:
        "Authentication and authorization controls prevent unauthorized data access and privilege abuse. Missing one check can expose every downstream resource under that route.",
      rule_of_thumb:
        "Authenticate first, authorize every resource access, and never trust client-provided identity claims.",
      common_pitfalls: [
        "Checking authentication at route entry but skipping ownership checks.",
        "Using token decode-only flows instead of cryptographic verification.",
        "Returning sensitive fields from ORM defaults.",
        "Applying role checks inconsistently across nested/list endpoints.",
      ],
    },
    RLM: {
      why_it_matters:
        "Rate limiting reduces brute-force and abuse risk while preserving service availability. Weak limiter strategy turns auth endpoints into low-cost attack surfaces.",
      rule_of_thumb:
        "Protect sensitive endpoints with persistent, identity-aware limits and deterministic 429 behavior.",
      common_pitfalls: [
        "Using process memory stores that reset on deploy or scale-out.",
        "Applying one global limit without auth-route hardening.",
        "Omitting retry metadata so clients cannot back off correctly.",
        "Choosing limiter keys that attackers can easily rotate around.",
      ],
    },
    IDP: {
      why_it_matters:
        "Idempotency prevents duplicate state changes caused by retries, network flakiness, and race conditions. Financial and booking flows are especially sensitive to duplicate execution.",
      rule_of_thumb:
        "For mutation endpoints, treat repeated requests with the same key as one logical operation.",
      common_pitfalls: [
        "Reading idempotency keys without persisting replay results.",
        "Scoping uniqueness too broadly or too narrowly.",
        "Skipping TTL and creating unbounded key stores.",
        "Reprocessing duplicate keys instead of replaying the original response.",
      ],
    },
    TMO: {
      why_it_matters:
        "Timeout and retry policy controls tail latency and prevents cascading failures across dependencies. Without bounds, one slow upstream can exhaust worker capacity.",
      rule_of_thumb:
        "Set explicit timeouts, cap retries, and use jittered backoff only for idempotent-safe operations.",
      common_pitfalls: [
        "Calling external services without timeout signals.",
        "Retrying non-idempotent writes without safeguards.",
        "Using fixed retry delays that create retry storms.",
        "Leaving DB statement timeout behavior undefined.",
      ],
    },
    LOG: {
      why_it_matters:
        "Structured logs with correlation identifiers are essential for incident response and forensic traceability. Missing context slows detection and increases mean time to recovery.",
      rule_of_thumb:
        "Log every failure path with request context while redacting secrets and PII.",
      common_pitfalls: [
        "Swallowing errors inside catch blocks.",
        "Using console logs without structured fields.",
        "Skipping request IDs across async boundaries.",
        "Logging sensitive credentials in cleartext.",
      ],
    },
    PAG: {
      why_it_matters:
        "Pagination guardrails prevent unbounded reads that can degrade database performance and expose excess data. Predictable pagination metadata improves client behavior and user experience.",
      rule_of_thumb:
        "Enforce bounded, validated pagination inputs and return deterministic page metadata.",
      common_pitfalls: [
        "Allowing arbitrary user-provided limits.",
        "Returning raw cursors that expose internal identifiers.",
        "Omitting total/hasNext metadata needed for client loops.",
        "Building sort/filter clauses directly from user input.",
      ],
    },
    SECAPI: {
      why_it_matters:
        "API security headers and transport controls reduce exploitability in browser and server-to-server interactions. Misconfigured CORS and SSRF paths are frequent high-impact findings.",
      rule_of_thumb:
        "Default to deny: allowlist trusted origins/hosts and explicitly harden sensitive response behavior.",
      common_pitfalls: [
        "Combining wildcard CORS origins with credentials.",
        "Allowing server-side URL fetches to private networks.",
        "Omitting no-store on token or sensitive responses.",
        "Passing bearer secrets in query strings.",
      ],
    },
  };

  return templates[input.category] ?? defaults;
}

function inferRemediation(input: RuleInput): RuleRemediation {
  const steps = [
    `Identify in-scope files (${input.scope}) and mark all current violations of ${input.id}.`,
    `Implement a shared pattern that satisfies the pass criteria: ${input.pass}`,
    "Add regression tests (positive + negative) for representative endpoints and shared helpers.",
    "Run static checks and endpoint tests to verify behavior is consistently enforced.",
  ];

  const acceptance = [
    `Pass criteria met: ${input.pass}`,
    `Fail condition removed: ${input.fail}`,
    "Automated tests cover both compliant and non-compliant cases.",
  ];

  if (input.id === "APC-01") {
    return {
      recommended_envelope: {
        success: true,
        data: {},
        error: null,
        meta: { requestId: "string", timestamp: "ISO-8601" },
      },
      implementation_steps: steps,
      acceptance_criteria: acceptance,
    };
  }

  return {
    recommended_pattern: `Enforce ${input.title.toLowerCase()} as a shared, test-covered default contract.`,
    implementation_steps: steps,
    acceptance_criteria: acceptance,
  };
}

function ruleVersion(input: RuleInput): string {
  return input.specVersion ?? "server-api-audit-v2.0";
}

function lessonEnabled(input: RuleInput): boolean {
  const kind = input.ruleKind ?? "check";
  if (["scan_scope", "quality_gate", "constraint", "expected_infrastructure"].includes(kind)) {
    return false;
  }
  return true;
}

function toRule(input: RuleInput): RuleRow {
  const version = ruleVersion(input);
  const targets = inferTargets(input);
  const signals = inferSignals(input);
  const skillTags = inferSkillTags(input);
  const education = inferEducation(input);
  const remediation = inferRemediation(input);

  return {
    id: input.id,
    title: input.title,
    category: input.category,
    priority: input.priority ?? defaultPriority(input.category, input.critical),
    description: input.howToDetect,
    targets,
    signals,
    skill_tags: skillTags,
    version,
    lesson_enabled: lessonEnabled(input),
    contents: {
      spec: version,
      version,
      scoring_included: false,
      critical: Boolean(input.critical),
      source_section: input.sourceSection ?? null,
      rule_kind: input.ruleKind ?? "check",
      scope: input.scope,
      how_to_detect: input.howToDetect,
      pass_criteria: input.pass,
      fail_criteria: input.fail,
      standard_refs: input.standardRefs ?? [],
      supersedes: input.supersedes ?? [],
      overlaps_with: input.overlapsWith ?? [],
      targets,
      signals,
      skill_tags: skillTags,
      education,
      remediation,
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

const STANDARD_REFERENCES = {
  owaspApiTop10: {
    name: "OWASP API Security Top 10 (2023)",
    control: "API Top 10",
    url: "https://owasp.org/API-Security/",
  },
  owaspAsvs: {
    name: "OWASP ASVS v5.0.0",
    control: "ASVS",
    url: "https://owasp.org/www-project-application-security-verification-standard/",
  },
  owaspRestCs: {
    name: "OWASP REST Security Cheat Sheet",
    control: "REST Security",
    url: "https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html",
  },
  owaspSsrfCs: {
    name: "OWASP SSRF Prevention Cheat Sheet",
    control: "SSRF",
    url: "https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html",
  },
  owaspUploadCs: {
    name: "OWASP File Upload Cheat Sheet",
    control: "File Upload",
    url: "https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html",
  },
  rfc9110: {
    name: "IETF RFC 9110",
    control: "HTTP Semantics",
    url: "https://www.rfc-editor.org/rfc/rfc9110",
  },
  rfc9457: {
    name: "IETF RFC 9457",
    control: "Problem Details",
    url: "https://www.rfc-editor.org/rfc/rfc9457",
  },
  rfc6750: {
    name: "IETF RFC 6750",
    control: "Bearer Token Usage",
    url: "https://www.rfc-editor.org/rfc/rfc6750",
  },
} as const;

const NEW_STANDARDS_RULES_BASE: RuleInput[] = [
  {
    id: "APC-05",
    title: "Enforce Content-Type on mutation endpoints",
    category: "APC",
    sourceSection: "C.1+",
    standardRefs: [STANDARD_REFERENCES.owaspRestCs, STANDARD_REFERENCES.rfc9110],
    scope: "POST/PUT/PATCH handlers",
    howToDetect: "Mutation endpoints validate Content-Type and reject unsupported media types with 415.",
    pass: "Unsupported media types produce 415 with deterministic error contract.",
    fail: "Mutation handlers accept invalid content types without 415 behavior.",
  },
  {
    id: "APC-06",
    title: "Enforce Accept negotiation behavior",
    category: "APC",
    sourceSection: "C.1+",
    standardRefs: [STANDARD_REFERENCES.rfc9110, STANDARD_REFERENCES.owaspRestCs],
    scope: "response negotiation path",
    howToDetect: "Handlers or framework middleware enforce Accept negotiation and return 406 when required representation is unavailable.",
    pass: "Unsupported Accept requests are handled via 406 where negotiation is required.",
    fail: "Accept negotiation is ignored for endpoints requiring explicit representation handling.",
  },
  {
    id: "APC-07",
    title: "405 behavior with Allow header",
    category: "APC",
    sourceSection: "C.1+",
    standardRefs: [STANDARD_REFERENCES.rfc9110],
    scope: "method dispatch path",
    howToDetect: "Unsupported methods return 405 and include Allow header listing supported verbs.",
    pass: "405 responses include an Allow header and correct method handling.",
    fail: "Unsupported methods do not return 405 or omit Allow header.",
  },
  {
    id: "APC-08",
    title: "Use Problem Details error schema",
    category: "APC",
    sourceSection: "C.1+",
    standardRefs: [STANDARD_REFERENCES.rfc9457, STANDARD_REFERENCES.owaspRestCs],
    scope: "error response builders",
    howToDetect: "Error responses follow RFC 9457 style structure (type/title/status/detail/instance).",
    pass: "Error responses are standardized to Problem Details shape.",
    fail: "Error responses are inconsistent and do not follow a standard schema.",
  },
  {
    id: "APC-09",
    title: "OpenAPI specification versioned in repo",
    category: "APC",
    sourceSection: "C.1+",
    standardRefs: [STANDARD_REFERENCES.owaspAsvs],
    scope: "repo docs/spec files",
    howToDetect: "OpenAPI spec file exists (yaml/json) and is version-controlled.",
    pass: "API contract is published and versioned in source control.",
    fail: "No versioned OpenAPI contract found.",
  },
  {
    id: "VAL-05",
    title: "Reject unknown input fields",
    category: "VAL",
    priority: "P1",
    sourceSection: "C.2+",
    standardRefs: [STANDARD_REFERENCES.owaspAsvs, STANDARD_REFERENCES.owaspRestCs],
    scope: "request schema validation layer",
    howToDetect: "Validation schemas run in strict/whitelist mode and reject unexpected fields.",
    pass: "Unknown request fields are rejected consistently.",
    fail: "Unexpected input fields are silently accepted.",
  },
  {
    id: "VAL-06",
    title: "Request body size limits enforced",
    category: "VAL",
    priority: "P1",
    sourceSection: "C.2+",
    standardRefs: [STANDARD_REFERENCES.owaspApiTop10, STANDARD_REFERENCES.rfc9110],
    scope: "body parser/middleware config",
    howToDetect: "Global or route-specific request size limits are configured and mapped to 413 behavior.",
    pass: "Request body size is bounded and oversized payloads are rejected.",
    fail: "No request size limits are configured.",
  },
  {
    id: "VAL-07",
    title: "Mass-assignment protection",
    category: "VAL",
    priority: "P1",
    sourceSection: "C.2+",
    standardRefs: [STANDARD_REFERENCES.owaspApiTop10, STANDARD_REFERENCES.owaspAsvs],
    scope: "DTO/model mapping layer",
    howToDetect: "User input is mapped through field allowlists before persistence.",
    pass: "Only explicitly allowed fields can be persisted.",
    fail: "Raw request bodies flow into model writes without allowlist mapping.",
  },
  {
    id: "VAL-08",
    title: "Validate file and URL user inputs",
    category: "VAL",
    priority: "P1",
    sourceSection: "C.2+",
    standardRefs: [STANDARD_REFERENCES.owaspUploadCs, STANDARD_REFERENCES.owaspSsrfCs],
    scope: "upload and URL ingestion handlers",
    howToDetect: "File metadata and user-provided URLs are validated before downstream processing.",
    pass: "File/URL inputs are validated with explicit constraints.",
    fail: "File/URL inputs are processed without validation guardrails.",
  },
  {
    id: "AUT-05",
    title: "JWT algorithm allowlist and alg=none rejection",
    category: "AUT",
    critical: true,
    priority: "P0",
    sourceSection: "C.3+",
    standardRefs: [STANDARD_REFERENCES.owaspAsvs, STANDARD_REFERENCES.owaspRestCs],
    supersedes: ["AUT-03"],
    scope: "token verification code paths",
    howToDetect: "JWT verification enforces explicit algorithm allowlist and rejects alg=none.",
    pass: "JWT algorithms are explicitly constrained and none-algorithm is rejected.",
    fail: "JWT verification accepts implicit/unsafe algorithms.",
  },
  {
    id: "AUT-06",
    title: "JWT claims validation",
    category: "AUT",
    critical: true,
    priority: "P0",
    sourceSection: "C.3+",
    standardRefs: [STANDARD_REFERENCES.owaspAsvs, STANDARD_REFERENCES.rfc6750],
    supersedes: ["AUT-03"],
    scope: "JWT/session validation layer",
    howToDetect: "Token validation checks exp/nbf/iss/aud claims before accepting identity.",
    pass: "Critical token claims are validated for every authenticated request.",
    fail: "Token claims are partially checked or ignored.",
  },
  {
    id: "AUT-07",
    title: "Strong password hashing algorithms only",
    category: "AUT",
    priority: "P1",
    sourceSection: "C.3+",
    standardRefs: [STANDARD_REFERENCES.owaspAsvs],
    scope: "auth credential storage/update flows",
    howToDetect: "Password hashes use argon2/bcrypt/scrypt and avoid weak/fast hashing algorithms.",
    pass: "Credential hashing uses strong password-hash primitives.",
    fail: "Weak or inappropriate hash algorithms are used for passwords.",
  },
  {
    id: "AUT-08",
    title: "Session cookie security attributes",
    category: "AUT",
    priority: "P1",
    sourceSection: "C.3+",
    standardRefs: [STANDARD_REFERENCES.owaspRestCs],
    scope: "Set-Cookie headers/session config",
    howToDetect: "Session cookies are set with Secure, HttpOnly, and SameSite attributes.",
    pass: "Session cookies include mandatory security attributes.",
    fail: "Session cookies are missing one or more required attributes.",
  },
  {
    id: "AUT-09",
    title: "Role checks on admin and sensitive routes",
    category: "AUT",
    priority: "P1",
    sourceSection: "C.3+",
    standardRefs: [STANDARD_REFERENCES.owaspApiTop10, STANDARD_REFERENCES.owaspAsvs],
    scope: "admin/sensitive endpoint handlers",
    howToDetect: "Role/permission checks are required before privileged actions.",
    pass: "Sensitive routes enforce explicit authorization policy checks.",
    fail: "Privileged actions are reachable without explicit role/permission checks.",
  },
  {
    id: "AUT-10",
    title: "Object-level authorization in nested/list access",
    category: "AUT",
    critical: true,
    priority: "P0",
    sourceSection: "C.3+",
    standardRefs: [STANDARD_REFERENCES.owaspApiTop10],
    scope: "nested resource and list query handlers",
    howToDetect: "Collection/nested queries are constrained by principal scope to prevent cross-tenant or cross-user exposure.",
    pass: "Object-level auth scope is enforced for list and nested resource access.",
    fail: "List/nested access can return resources outside caller ownership scope.",
  },
  {
    id: "RLM-05",
    title: "Robust auth route limiter key strategy",
    category: "RLM",
    priority: "P1",
    sourceSection: "C.4+",
    standardRefs: [STANDARD_REFERENCES.owaspApiTop10, STANDARD_REFERENCES.owaspRestCs],
    scope: "auth/login limiter configuration",
    howToDetect: "Limiter keys include IP plus account/user dimension for login-sensitive routes.",
    pass: "Auth rate limiter uses robust composite identity strategy.",
    fail: "Auth limiter keys rely on a single weak dimension.",
  },
  {
    id: "RLM-06",
    title: "Tiered limits by endpoint sensitivity",
    category: "RLM",
    priority: "P1",
    sourceSection: "C.4+",
    standardRefs: [STANDARD_REFERENCES.owaspApiTop10],
    scope: "rate limit policy definitions",
    howToDetect: "Different endpoint classes have distinct limits instead of one uniform policy.",
    pass: "Rate limits are tuned by endpoint sensitivity/risk.",
    fail: "Single global rate policy is used for all endpoint types.",
  },
  {
    id: "RLM-07",
    title: "429 response contract with retry metadata",
    category: "RLM",
    priority: "P1",
    sourceSection: "C.4+",
    standardRefs: [STANDARD_REFERENCES.rfc9110, STANDARD_REFERENCES.owaspRestCs],
    supersedes: ["RLM-04"],
    scope: "rate limited responses",
    howToDetect: "429 responses include consistent contract and retry hints (headers/body metadata).",
    pass: "429 responses provide deterministic retry metadata.",
    fail: "429 responses are inconsistent or omit retry guidance.",
  },
  {
    id: "RLM-08",
    title: "Brute-force mitigation signals",
    category: "RLM",
    priority: "P1",
    sourceSection: "C.4+",
    standardRefs: [STANDARD_REFERENCES.owaspApiTop10],
    scope: "auth and credential endpoints",
    howToDetect: "Lockout/backoff controls exist for repeated authentication failures.",
    pass: "Brute-force protection includes lockout or progressive delay behavior.",
    fail: "Repeated auth failures are not mitigated.",
  },
  {
    id: "IDP-04",
    title: "Idempotency key uniqueness scope",
    category: "IDP",
    sourceSection: "C.5+",
    standardRefs: [STANDARD_REFERENCES.owaspRestCs],
    scope: "idempotency key storage model",
    howToDetect: "Idempotency uniqueness is scoped by actor + route + method, not key string alone.",
    pass: "Idempotency uniqueness uses safe scope dimensions.",
    fail: "Idempotency key collisions are possible across actors/routes/methods.",
  },
  {
    id: "IDP-05",
    title: "Request fingerprint conflict handling",
    category: "IDP",
    sourceSection: "C.5+",
    standardRefs: [STANDARD_REFERENCES.owaspRestCs, STANDARD_REFERENCES.rfc9110],
    scope: "idempotency duplicate handling path",
    howToDetect: "Same idempotency key with mismatched request fingerprint returns conflict (409).",
    pass: "Mismatched replay attempts are rejected with explicit conflict behavior.",
    fail: "Mismatched payloads with same key are accepted or processed ambiguously.",
  },
  {
    id: "IDP-06",
    title: "Replay original response for duplicate key",
    category: "IDP",
    sourceSection: "C.5+",
    standardRefs: [STANDARD_REFERENCES.owaspRestCs],
    scope: "idempotency replay cache",
    howToDetect: "Duplicate idempotency key returns original status/body instead of reprocessing.",
    pass: "Duplicate idempotency requests are replayed deterministically.",
    fail: "Duplicate keys trigger reprocessing or inconsistent responses.",
  },
  {
    id: "TMO-05",
    title: "Explicit bounded outbound timeout constants",
    category: "TMO",
    priority: "P1",
    sourceSection: "C.6+",
    standardRefs: [STANDARD_REFERENCES.owaspRestCs],
    scope: "HTTP client wrappers/config",
    howToDetect: "Timeouts are explicit constants and bounded to sane values.",
    pass: "Outbound calls use explicit bounded timeout configuration.",
    fail: "Timeouts are implicit/unbounded or absent.",
  },
  {
    id: "TMO-06",
    title: "Retry attempt bounds enforced",
    category: "TMO",
    priority: "P1",
    sourceSection: "C.6+",
    standardRefs: [STANDARD_REFERENCES.owaspRestCs],
    scope: "retry policy configuration",
    howToDetect: "Retry mechanisms enforce maxAttempts bounds.",
    pass: "Retry behavior is explicitly bounded.",
    fail: "Retry loops are unbounded or unclear.",
  },
  {
    id: "TMO-07",
    title: "Retry jitter strategy present",
    category: "TMO",
    priority: "P1",
    sourceSection: "C.6+",
    standardRefs: [STANDARD_REFERENCES.owaspRestCs],
    supersedes: ["TMO-04"],
    scope: "retry delay policy",
    howToDetect: "Retry backoff includes jitter to avoid synchronized retry bursts.",
    pass: "Retry policy uses jittered backoff.",
    fail: "Retry policy uses deterministic delay without jitter.",
  },
  {
    id: "LOG-05",
    title: "Sensitive value redaction in logs",
    category: "LOG",
    priority: "P1",
    sourceSection: "C.7+",
    standardRefs: [STANDARD_REFERENCES.owaspAsvs, STANDARD_REFERENCES.owaspRestCs],
    scope: "logger middleware/serializers",
    howToDetect: "Log pipeline redacts tokens, passwords, secrets, and API keys.",
    pass: "Sensitive values are consistently redacted in logs.",
    fail: "Sensitive values can be emitted in logs.",
  },
  {
    id: "LOG-06",
    title: "Security event audit logging",
    category: "LOG",
    priority: "P1",
    sourceSection: "C.7+",
    standardRefs: [STANDARD_REFERENCES.owaspAsvs],
    scope: "auth and privilege event handlers",
    howToDetect: "Security events (auth failures, privilege changes, lockouts) are logged with context.",
    pass: "Security-relevant events are auditable in structured logs.",
    fail: "Security events are not logged or lack audit context.",
  },
  {
    id: "LOG-07",
    title: "Access logs include latency and request context",
    category: "LOG",
    priority: "P2",
    sourceSection: "C.7+",
    standardRefs: [STANDARD_REFERENCES.owaspRestCs],
    scope: "access logging middleware",
    howToDetect: "Access logs include route/method/status/latency/requestId.",
    pass: "Access logs contain complete request lifecycle metadata.",
    fail: "Access logs miss key request lifecycle fields.",
  },
  {
    id: "LOG-08",
    title: "Health/readiness endpoints with protected diagnostics",
    category: "LOG",
    priority: "P2",
    sourceSection: "C.7+",
    standardRefs: [STANDARD_REFERENCES.owaspAsvs],
    scope: "ops endpoints",
    howToDetect: "Health/readiness endpoints exist, and verbose diagnostics are protected.",
    pass: "Operational health endpoints are present and sensitive diagnostics are restricted.",
    fail: "Health endpoints are missing or expose sensitive diagnostics publicly.",
  },
  {
    id: "PAG-05",
    title: "Default pagination limit enforced",
    category: "PAG",
    priority: "P2",
    sourceSection: "C.8+",
    standardRefs: [STANDARD_REFERENCES.owaspApiTop10],
    scope: "list endpoint pagination logic",
    howToDetect: "List endpoints apply a server default limit when client omits pagination parameters.",
    pass: "Default pagination limit is consistently applied.",
    fail: "Requests without pagination can return unbounded results.",
  },
  {
    id: "PAG-06",
    title: "Sort/filter allowlist validation",
    category: "PAG",
    priority: "P2",
    sourceSection: "C.8+",
    standardRefs: [STANDARD_REFERENCES.owaspApiTop10, STANDARD_REFERENCES.owaspRestCs],
    scope: "query parsing and query builder layer",
    howToDetect: "Sort/filter fields are validated against explicit allowlists before query composition.",
    pass: "Sort/filter options are constrained to allowed fields.",
    fail: "User-controlled sort/filter fields are used without allowlist validation.",
  },
  {
    id: "PAG-07",
    title: "Cursor tamper resistance",
    category: "PAG",
    priority: "P2",
    sourceSection: "C.8+",
    standardRefs: [STANDARD_REFERENCES.owaspRestCs],
    scope: "cursor pagination encoder/decoder",
    howToDetect: "Cursor values are opaque and signed/encrypted to prevent client tampering.",
    pass: "Cursor design prevents straightforward tampering/forgery.",
    fail: "Cursor values are raw/forgeable identifiers.",
  },
  {
    id: "PAG-08",
    title: "Large export guardrails",
    category: "PAG",
    priority: "P2",
    sourceSection: "C.8+",
    standardRefs: [STANDARD_REFERENCES.owaspApiTop10],
    scope: "bulk export/list endpoints",
    howToDetect: "Large exports are handled by async jobs or streaming with explicit guardrails.",
    pass: "Bulk data extraction paths are bounded and operationally safe.",
    fail: "Large exports are synchronous and unbounded.",
  },
  {
    id: "SECAPI-01",
    title: "CORS origin allowlist enforced",
    category: "SECAPI",
    priority: "P1",
    sourceSection: "I",
    standardRefs: [STANDARD_REFERENCES.owaspApiTop10, STANDARD_REFERENCES.owaspRestCs],
    scope: "CORS middleware/config",
    howToDetect: "CORS policy uses explicit allowed origins for credentialed APIs.",
    pass: "CORS origins are allowlisted and intentional.",
    fail: "CORS is overly permissive for protected endpoints.",
  },
  {
    id: "SECAPI-02",
    title: "Block wildcard origin with credentials",
    category: "SECAPI",
    priority: "P1",
    sourceSection: "I",
    standardRefs: [STANDARD_REFERENCES.owaspRestCs],
    scope: "CORS configuration",
    howToDetect: "Policy blocks Access-Control-Allow-Origin=* when credentials are enabled.",
    pass: "Wildcard origin is not combined with credentialed requests.",
    fail: "CORS allows wildcard origin with credentials.",
  },
  {
    id: "SECAPI-03",
    title: "No-store cache controls on sensitive responses",
    category: "SECAPI",
    priority: "P1",
    sourceSection: "I",
    standardRefs: [STANDARD_REFERENCES.owaspRestCs, STANDARD_REFERENCES.rfc9110],
    scope: "auth/token/sensitive response handlers",
    howToDetect: "Sensitive responses set Cache-Control no-store semantics.",
    pass: "Sensitive responses explicitly prevent caching.",
    fail: "Sensitive responses omit strict cache control.",
  },
  {
    id: "SECAPI-04",
    title: "SSRF private-network egress blocking",
    category: "SECAPI",
    critical: true,
    priority: "P0",
    sourceSection: "I",
    standardRefs: [STANDARD_REFERENCES.owaspApiTop10, STANDARD_REFERENCES.owaspSsrfCs],
    scope: "server-side URL fetch paths",
    howToDetect: "Outbound URL fetch code blocks localhost, link-local, and private address ranges.",
    pass: "SSRF guardrails block private/internal network destinations.",
    fail: "Server-side fetch can target internal/private network ranges.",
  },
  {
    id: "SECAPI-05",
    title: "Outbound host/domain allowlist for URL fetch",
    category: "SECAPI",
    priority: "P1",
    sourceSection: "I",
    standardRefs: [STANDARD_REFERENCES.owaspSsrfCs],
    scope: "fetch-by-url integrations",
    howToDetect: "Outbound URL fetch is constrained by explicit host/domain allowlist policy.",
    pass: "Only approved hosts/domains can be fetched server-side.",
    fail: "No outbound domain allowlist exists for URL fetch features.",
  },
  {
    id: "SECAPI-06",
    title: "No bearer/API secrets in URL query",
    category: "SECAPI",
    priority: "P1",
    sourceSection: "I",
    standardRefs: [STANDARD_REFERENCES.rfc6750, STANDARD_REFERENCES.owaspRestCs],
    scope: "auth/token handling and URL construction",
    howToDetect: "Bearer/API credentials are not transported in URL query parameters.",
    pass: "Credentials are carried via headers or secure body fields, not URLs.",
    fail: "Bearer/API secrets appear in URL query strings.",
  },
  {
    id: "SECAPI-07",
    title: "File upload extension/MIME/size hardening",
    category: "SECAPI",
    priority: "P1",
    sourceSection: "I",
    standardRefs: [STANDARD_REFERENCES.owaspUploadCs],
    scope: "file upload handlers",
    howToDetect: "Uploads enforce extension allowlist, MIME checks, and size bounds before storage.",
    pass: "Upload pipeline validates extension, MIME, and size before persistence.",
    fail: "Uploads are accepted without adequate validation hardening.",
  },
];

const NEW_STANDARDS_RULES: RuleInput[] = NEW_STANDARDS_RULES_BASE.map((item) => ({
  ...item,
  specVersion: "server-api-standards-v1.1",
}));

const SUPERSEDED_RULE_IDS = [
  "B-RULE-01",
  "B-RULE-02",
  "AUT-03",
  "RLM-04",
  "TMO-04",
] as const;

const ALL_RULES: RuleRow[] = [
  ...CHECKS,
  ...STRUCTURAL_GAPS,
  ...EXPECTED_INFRASTRUCTURE,
  ...SCAN_SCOPE_RULES,
  ...QUALITY_GATES,
  ...NEW_STANDARDS_RULES,
]
  .filter((item) => !SUPERSEDED_RULE_IDS.includes(item.id as (typeof SUPERSEDED_RULE_IDS)[number]))
  .map(toRule);

async function main(): Promise<void> {
  loadDotEnvLocal();

  const db = getDbClient();

  const { error: deleteError } = await db
    .from("rules")
    .delete()
    .in("id", [...SUPERSEDED_RULE_IDS]);
  if (deleteError) {
    throw new Error(deleteError.message);
  }

  const { error } = await db.from("rules").upsert(ALL_RULES, { onConflict: "id" });
  if (error) {
    if (/relation .* does not exist|Could not find the table/i.test(error.message)) {
      throw new Error(
        "Table `rules` is missing. Apply migration qa-web/supabase/migrations/20260228_rules_table.sql first.",
      );
    }
    if (/column .* does not exist/i.test(error.message)) {
      throw new Error(
        "Rules columns are outdated. Apply migration qa-web/supabase/migrations/20260301_rules_learning_fields.sql first.",
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
