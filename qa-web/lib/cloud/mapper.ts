import {
  type Artifact,
  type AuditProgress,
  type AuditSummary,
  type Issue,
  type PageResult,
  type RunStatus,
  defaultViewports,
} from "@/lib/contracts";

type CloudMapInput = {
  raw: Record<string, unknown>;
  baseUrl: string;
};

type CloudMapOutput = {
  status: RunStatus;
  summary: AuditSummary;
  progress: AuditProgress;
  pageResults: PageResult[];
  issues: Issue[];
  artifacts: Artifact[];
};

function readField<T>(
  raw: Record<string, unknown>,
  keys: string[],
): T | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (value !== undefined && value !== null) return value as T;
  }
  return undefined;
}

function toRunStatus(rawStatus: unknown): RunStatus {
  const normalized = String(rawStatus ?? "").toLowerCase();
  if (["queued", "pending", "created"].includes(normalized)) return "queued";
  if (["running", "in_progress", "processing"].includes(normalized))
    return "running";
  if (
    ["completed", "finished", "succeeded", "success", "done"].includes(
      normalized,
    )
  )
    return "completed";
  if (["canceled", "cancelled", "stopped"].includes(normalized))
    return "canceled";
  if (["failed", "error"].includes(normalized)) return "failed";
  return "queued";
}

function toPageStatus(rawStatus: unknown): PageResult["status"] {
  const normalized = String(rawStatus ?? "").toLowerCase();
  if (["ok", "pass", "passed", "success"].includes(normalized)) return "ok";
  if (["warning", "warn"].includes(normalized)) return "warning";
  if (["error", "fail", "failed"].includes(normalized)) return "error";
  if (["running", "in_progress"].includes(normalized)) return "running";
  return "pending";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item)).filter(Boolean)
    : [];
}

function sanitizeMeta(value: unknown): Artifact["meta"] {
  const out: Artifact["meta"] = {};
  const raw = asRecord(value);
  for (const [key, entry] of Object.entries(raw)) {
    if (
      typeof entry === "string" ||
      typeof entry === "number" ||
      typeof entry === "boolean" ||
      entry === null
    ) {
      out[key] = entry;
    }
  }
  return out;
}

function parsePageResults(
  raw: Record<string, unknown>,
  baseUrl: string,
): PageResult[] {
  const source =
    readField<unknown[]>(raw, ["pageResults", "results", "pages"]) ?? [];

  return source
    .map((item) => asRecord(item))
    .map((row) => {
      const route = String(row.route ?? "/");
      const viewportKey = row.viewportKey === "mobile" ? "mobile" : "desktop";
      const status = toPageStatus(row.status);
      const signalsRaw = asRecord(row.signals);
      const evidenceRaw = asRecord(row.evidence);
      const screenshotRows = Array.isArray(evidenceRaw.screenshots)
        ? evidenceRaw.screenshots.map((entry) => asRecord(entry))
        : [];

      const screenshots = screenshotRows
        .map((entry) => ({
          label: String(entry.label ?? "screenshot"),
          url: String(entry.url ?? ""),
        }))
        .filter(
          (entry) =>
            entry.url.startsWith("http://") || entry.url.startsWith("https://"),
        );

      return {
        route,
        fullUrl: String(row.fullUrl ?? `${baseUrl.replace(/\/$/, "")}${route}`),
        viewportKey,
        finalUrl: String(
          row.finalUrl ??
            row.fullUrl ??
            `${baseUrl.replace(/\/$/, "")}${route}`,
        ),
        title: String(row.title ?? ""),
        status,
        signals: {
          ctaAboveFold:
            typeof signalsRaw.ctaAboveFold === "boolean"
              ? signalsRaw.ctaAboveFold
              : null,
          mobileHorizontalScroll:
            typeof signalsRaw.mobileHorizontalScroll === "boolean"
              ? signalsRaw.mobileHorizontalScroll
              : null,
          navWorks:
            typeof signalsRaw.navWorks === "boolean"
              ? signalsRaw.navWorks
              : null,
          formLabelingOk:
            typeof signalsRaw.formLabelingOk === "boolean"
              ? signalsRaw.formLabelingOk
              : null,
        },
        evidence: {
          screenshots,
          notes: asStringArray(evidenceRaw.notes),
        },
      } satisfies PageResult;
    });
}

function parseIssues(raw: Record<string, unknown>): Issue[] {
  const source = readField<unknown[]>(raw, ["issues", "findings"]) ?? [];

  return source
    .map((item) => asRecord(item))
    .map((row) => {
      const severity = ["high", "medium", "low"].includes(String(row.severity))
        ? (row.severity as Issue["severity"])
        : "low";
      const category = [
        "functional",
        "usability",
        "accessibility",
        "security",
        "content",
      ].includes(String(row.category))
        ? (row.category as Issue["category"])
        : "functional";

      const evidenceLinks = asStringArray(row.evidenceLinks).filter(
        (link) => link.startsWith("http://") || link.startsWith("https://"),
      );

      return {
        severity,
        category,
        title: String(row.title ?? "Untitled issue"),
        symptom: String(row.symptom ?? ""),
        reproSteps: asStringArray(row.reproSteps),
        expected: String(row.expected ?? ""),
        actual: String(row.actual ?? ""),
        impact: String(row.impact ?? ""),
        recommendedFixApproach: String(row.recommendedFixApproach ?? ""),
        verificationSteps: asStringArray(row.verificationSteps),
        evidenceLinks,
      } satisfies Issue;
    });
}

function parseArtifacts(
  raw: Record<string, unknown>,
  pageResults: PageResult[],
  issues: Issue[],
): Artifact[] {
  const direct = (
    readField<unknown[]>(raw, ["artifacts", "evidenceLinks"]) ?? []
  )
    .map((item) => asRecord(item))
    .map((row) => ({
      kind: String(row.kind ?? "artifact"),
      url: String(row.url ?? ""),
      meta: sanitizeMeta(row.meta),
    }))
    .filter(
      (row) => row.url.startsWith("http://") || row.url.startsWith("https://"),
    );

  const screenshotArtifacts = pageResults.flatMap((result) =>
    result.evidence.screenshots.map((shot) => ({
      kind: "screenshot",
      url: shot.url,
      meta: {
        route: result.route,
        viewportKey: result.viewportKey,
        label: shot.label,
      },
    })),
  );

  const issueArtifacts = issues.flatMap((entry) =>
    entry.evidenceLinks.map((url) => ({
      kind: "issue_evidence",
      url,
      meta: { title: entry.title, severity: entry.severity },
    })),
  );

  const uniq = new Map<string, Artifact>();
  for (const entry of [...direct, ...screenshotArtifacts, ...issueArtifacts]) {
    uniq.set(`${entry.kind}:${entry.url}`, entry);
  }
  return [...uniq.values()];
}

function deriveProgress(
  status: RunStatus,
  pageResults: PageResult[],
): AuditProgress {
  return {
    phase: status,
    completedChecks: pageResults.filter((i) =>
      ["ok", "warning", "error"].includes(i.status),
    ).length,
    totalChecks: pageResults.length,
    lastSyncedAt: new Date().toISOString(),
  };
}

function deriveSummary(
  raw: Record<string, unknown>,
  baseUrl: string,
  pageResults: PageResult[],
  issues: Issue[],
): AuditSummary {
  const rawSummary = asRecord(raw.summary);
  return {
    baseUrl,
    pagesAudited: Number(rawSummary.pagesAudited ?? pageResults.length),
    viewports: ["desktop", "mobile"],
    passCount: Number(
      rawSummary.passCount ??
        pageResults.filter((i) => i.status === "ok").length,
    ),
    failCount: Number(
      rawSummary.failCount ??
        pageResults.filter((i) => i.status === "error").length,
    ),
    highRiskCount: Number(
      rawSummary.highRiskCount ??
        issues.filter((i) => i.severity === "high").length,
    ),
    keyFindings: (Array.isArray(rawSummary.keyFindings)
      ? rawSummary.keyFindings
      : issues.map((i) => i.title)
    )
      .map((e) => String(e))
      .slice(0, 6),
  };
}

export function emptyAuditSummary(baseUrl: string): AuditSummary {
  return {
    baseUrl,
    pagesAudited: 0,
    viewports: defaultViewports.map((v) => v.key),
    passCount: 0,
    failCount: 0,
    highRiskCount: 0,
    keyFindings: [],
  };
}

export function mapCloudAuditPayload({
  raw,
  baseUrl,
}: CloudMapInput): CloudMapOutput {
  const status = toRunStatus(readField(raw, ["status", "state", "runStatus"]));
  const pageResults = parsePageResults(raw, baseUrl);
  const issues = parseIssues(raw);
  const artifacts = parseArtifacts(raw, pageResults, issues);

  return {
    status,
    summary: deriveSummary(raw, baseUrl, pageResults, issues),
    progress: deriveProgress(status, pageResults),
    pageResults,
    issues,
    artifacts,
  };
}
