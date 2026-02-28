import { z } from "zod";

export const routerSchema = z.enum(["app", "pages", "unknown"]);

export const projectSchema = z.object({
  name: z.string(),
  framework: z.literal("nextjs"),
  router: routerSchema,
});

export const endpointMethodSchema = z.enum([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "*",
]);

export const endpointSchema = z.object({
  method: endpointMethodSchema,
  path: z.string(),
  file: z.string(),
  notes: z.string(),
});

export const standardSchema = z.enum([
  "Contract",
  "Validation",
  "Auth",
  "AuthZ",
  "RateLimit",
  "Idempotency",
  "Timeouts",
  "Logging",
  "Pagination",
]);

export const checkStatusSchema = z.enum(["pass", "warn", "fail", "unknown"]);

export const severitySchema = z.enum(["P0", "P1", "P2"]);

export const evidenceSchema = z.object({
  file: z.string(),
  lineStart: z.number().int().nonnegative(),
  lineEnd: z.number().int().nonnegative(),
  snippet: z.string(),
});

export const scorecardCheckSchema = z.object({
  standard: standardSchema,
  status: checkStatusSchema,
  severity: severitySchema,
  message: z.string(),
  evidence: z.array(evidenceSchema),
  recommendations: z.array(z.string()),
});

export const standardsScorecardSchema = z.object({
  project: projectSchema.extend({
    name: z.string(),
  }),
  summary: z.object({
    score: z.number().int().min(0).max(100),
    p0: z.number().int().nonnegative(),
    p1: z.number().int().nonnegative(),
    p2: z.number().int().nonnegative(),
  }),
  endpoints: z.array(endpointSchema),
  checks: z.array(scorecardCheckSchema),
});

export const browserUseTestSchema = z.object({
  id: z.string(),
  category: z.string(),
  goal: z.string(),
  steps: z.array(z.string()).min(1),
  expected: z.string(),
  severity_if_fail: severitySchema,
});

export const browserUseRouteSchema = z.object({
  path: z.string(),
  purpose: z.string(),
  criticality: z.enum(["high", "medium", "low"]),
  tests: z.array(browserUseTestSchema),
});

export const browserUseTestPlanSchema = z.object({
  project: z.object({
    name: z.string(),
    framework: z.literal("nextjs"),
    baseUrl: z.string(),
    notes: z.string(),
  }),
  standards: z.array(z.string()),
  routes: z.array(browserUseRouteSchema),
});

export const browserUseFindingsSchema = z.object({
  run: z.object({
    baseUrl: z.string(),
    timestamp: z.string(),
    deviceProfiles: z.array(z.enum(["desktop", "mobile"])),
  }),
  findings: z.array(
    z.object({
      testId: z.string(),
      path: z.string(),
      result: z.enum(["pass", "fail", "blocked"]),
      severity: severitySchema,
      observed: z.string(),
      expected: z.string(),
      reproSteps: z.array(z.string()),
      evidence: z.object({
        url: z.string(),
        notes: z.string(),
        screenshot: z.string().optional(),
      }),
    }),
  ),
  summary: z.object({
    pass: z.number().int().nonnegative(),
    fail: z.number().int().nonnegative(),
    blocked: z.number().int().nonnegative(),
  }),
});

export const githubIngestRequestSchema = z.object({
  repoUrl: z.string().url(),
});

export const analyzeRequestSchema = z.object({
  ingestionId: z.string().uuid(),
  baseUrl: z.string().url().optional(),
});

export const ingestionRecordSchema = z.object({
  id: z.string().uuid(),
  sourceType: z.enum(["zip", "github"]),
  sourceLabel: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  status: z.enum(["ingested", "analyzing", "completed", "failed"]),
  error: z.string().nullable(),
  zipFileName: z.string(),
  zipBytes: z.number().int().nonnegative(),
  projectNameHint: z.string(),
});

export const analyzeResultSchema = z.object({
  id: z.string().uuid(),
  scorecard: standardsScorecardSchema,
  browserUseTestPlan: browserUseTestPlanSchema,
  aiReportMarkdown: z.string(),
  generatedAt: z.string().datetime(),
});

export type Endpoint = z.infer<typeof endpointSchema>;
export type ScorecardCheck = z.infer<typeof scorecardCheckSchema>;
export type StandardsScorecard = z.infer<typeof standardsScorecardSchema>;
export type BrowserUseTestPlan = z.infer<typeof browserUseTestPlanSchema>;
export type IngestionRecord = z.infer<typeof ingestionRecordSchema>;
export type AnalyzeResult = z.infer<typeof analyzeResultSchema>;
export type StandardName = z.infer<typeof standardSchema>;
export type CheckStatus = z.infer<typeof checkStatusSchema>;
export type Severity = z.infer<typeof severitySchema>;
