import { z } from "zod";

export const focusSchema = z.enum([
  "usability",
  "accessibility",
  "security",
  "content",
  "functional",
]);

export const educationLevelSchema = z.enum(["beginner", "intermediate", "advanced"]);

export const viewportSchema = z.object({
  key: z.enum(["desktop", "mobile"]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const defaultViewports = [
  { key: "desktop", width: 1440, height: 900 },
  { key: "mobile", width: 390, height: 844 },
] satisfies Array<z.infer<typeof viewportSchema>>;

export const auditRequestSchema = z.object({
  baseUrl: z.string().url(),
  routes: z.array(z.string()).default([]),
  viewports: z.array(viewportSchema).length(2).default(defaultViewports),
  maxPages: z.number().int().min(1).max(10).default(6),
  maxClicksPerPage: z.number().int().min(1).max(10).default(6),
  educationLevel: educationLevelSchema.default("intermediate"),
  focus: z.array(focusSchema).min(1).default(["usability", "accessibility", "security", "content", "functional"]),
});

export const runStatusSchema = z.enum(["queued", "running", "completed", "failed", "canceled"]);

export const pageSignalSchema = z.object({
  ctaAboveFold: z.boolean().nullable(),
  mobileHorizontalScroll: z.boolean().nullable(),
  navWorks: z.boolean().nullable(),
  formLabelingOk: z.boolean().nullable(),
});

export const screenshotSchema = z.object({
  label: z.string(),
  url: z.string().url(),
});

export const pageResultSchema = z.object({
  route: z.string(),
  fullUrl: z.string().url(),
  viewportKey: z.enum(["desktop", "mobile"]),
  finalUrl: z.string().url().optional().or(z.literal("")),
  title: z.string().default(""),
  status: z.enum(["pending", "running", "ok", "warning", "error"]),
  signals: pageSignalSchema,
  evidence: z.object({
    screenshots: z.array(screenshotSchema),
    notes: z.array(z.string()),
  }),
});

export const issueSchema = z.object({
  severity: z.enum(["high", "medium", "low"]),
  category: z.enum(["functional", "usability", "accessibility", "security", "content"]),
  title: z.string(),
  symptom: z.string(),
  reproSteps: z.array(z.string()),
  expected: z.string(),
  actual: z.string(),
  impact: z.string(),
  recommendedFixApproach: z.string(),
  verificationSteps: z.array(z.string()),
  evidenceLinks: z.array(z.string().url()),
});

export const auditSummarySchema = z.object({
  baseUrl: z.string().url(),
  pagesAudited: z.number().int().nonnegative(),
  viewports: z.array(z.enum(["desktop", "mobile"])),
  passCount: z.number().int().nonnegative(),
  failCount: z.number().int().nonnegative(),
  highRiskCount: z.number().int().nonnegative(),
  keyFindings: z.array(z.string()).max(6),
});

export const auditProgressSchema = z.object({
  phase: z.enum(["queued", "running", "completed", "failed", "canceled"]),
  completedChecks: z.number().int().nonnegative(),
  totalChecks: z.number().int().nonnegative(),
  lastSyncedAt: z.string().datetime().nullable(),
});

export const artifactSchema = z.object({
  kind: z.string(),
  url: z.string().url(),
  meta: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .default({}),
});

export const auditStatusResponseSchema = z.object({
  auditId: z.string().uuid(),
  status: runStatusSchema,
  input: auditRequestSchema,
  progress: auditProgressSchema,
  summary: auditSummarySchema,
  pageResults: z.array(pageResultSchema),
  issues: z.array(issueSchema),
  artifacts: z.object({
    links: z.array(artifactSchema),
  }),
  updatedAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable().optional(),
  finishedAt: z.string().datetime().nullable().optional(),
  error: z.string().nullable().optional(),
});

export const auditListItemSchema = z.object({
  auditId: z.string().uuid(),
  baseUrl: z.string().url(),
  status: runStatusSchema,
  summary: auditSummarySchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable(),
  input: auditRequestSchema,
});

export const exportFormatSchema = z.enum(["json", "md"]);

export type Focus = z.infer<typeof focusSchema>;
export type EducationLevel = z.infer<typeof educationLevelSchema>;
export type AuditRequest = z.infer<typeof auditRequestSchema>;
export type RunStatus = z.infer<typeof runStatusSchema>;
export type PageResult = z.infer<typeof pageResultSchema>;
export type Issue = z.infer<typeof issueSchema>;
export type AuditSummary = z.infer<typeof auditSummarySchema>;
export type AuditProgress = z.infer<typeof auditProgressSchema>;
export type Artifact = z.infer<typeof artifactSchema>;
export type AuditStatusResponse = z.infer<typeof auditStatusResponseSchema>;
export type AuditListItem = z.infer<typeof auditListItemSchema>;
export type ExportFormat = z.infer<typeof exportFormatSchema>;
