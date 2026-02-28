import type { AuditListItem } from "@/lib/contracts";
import { toPassRate } from "@/lib/browserqa/format";
import { listItemDisplayStatus } from "@/lib/browserqa/status";
import {
  loadSuites,
  makeVirtualSuiteId,
  type SuiteConfig,
} from "@/lib/browserqa/suite-store";

export type SuiteListItem = {
  id: string;
  name: string;
  baseUrl: string;
  projectPath: string;
  guidelinePath?: string;
  updatedAt: string;
  runCount: number;
  testCaseCount: number;
  passRate: number;
  lastRunStatus?: ReturnType<typeof listItemDisplayStatus>;
  latestRun?: AuditListItem;
  fromLocal: boolean;
  config?: SuiteConfig;
};

function fallbackName(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    return url.hostname;
  } catch {
    return baseUrl;
  }
}

export function buildSuitesFromAudits(audits: AuditListItem[]): SuiteListItem[] {
  const localSuites = loadSuites();
  const byBaseUrl = new Map<string, AuditListItem[]>();

  for (const audit of audits) {
    const existing = byBaseUrl.get(audit.baseUrl) ?? [];
    existing.push(audit);
    byBaseUrl.set(audit.baseUrl, existing);
  }

  for (const list of byBaseUrl.values()) {
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  const result: SuiteListItem[] = [];

  for (const local of localSuites) {
    const runs = byBaseUrl.get(local.baseUrl) ?? [];
    const latest = runs[0];
    const passed = runs.filter((run) => run.summary.failCount === 0 && run.status === "completed").length;
    const failed = runs.filter((run) => run.summary.failCount > 0 || run.status === "failed").length;

    result.push({
      id: local.id,
      name: local.name,
      baseUrl: local.baseUrl,
      projectPath: local.projectPath,
      guidelinePath: local.guidelinePath,
      updatedAt: local.updatedAt,
      runCount: runs.length,
      testCaseCount: latest?.summary.pagesAudited ?? 0,
      passRate: toPassRate(passed, failed),
      lastRunStatus: latest ? listItemDisplayStatus(latest) : undefined,
      latestRun: latest,
      fromLocal: true,
      config: local,
    });
  }

  for (const [baseUrl, runs] of byBaseUrl.entries()) {
    if (result.some((suite) => suite.baseUrl === baseUrl)) continue;

    const latest = runs[0];
    const passed = runs.filter((run) => run.summary.failCount === 0 && run.status === "completed").length;
    const failed = runs.filter((run) => run.summary.failCount > 0 || run.status === "failed").length;

    result.push({
      id: makeVirtualSuiteId(baseUrl),
      name: fallbackName(baseUrl),
      baseUrl,
      projectPath: "—",
      updatedAt: latest?.updatedAt ?? latest?.createdAt ?? new Date().toISOString(),
      runCount: runs.length,
      testCaseCount: latest?.summary.pagesAudited ?? 0,
      passRate: toPassRate(passed, failed),
      lastRunStatus: latest ? listItemDisplayStatus(latest) : undefined,
      latestRun: latest,
      fromLocal: false,
    });
  }

  return result.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}
