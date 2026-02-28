import {
  type SecurityFinding,
  type SecurityFindingStatus,
  type SecurityScanConfig,
  type SecurityScanSummary,
  type SecuritySeverity,
  type SecurityFindingType,
} from "./types";
import {
  createSummary,
  generateDemoSecurityFindings,
  maskSecret,
} from "./scanner";

const STORAGE_KEY = "browserqa_security_findings_v1";

type StoredSecurityFinding = Omit<SecurityFinding, "detectedAt"> & {
  detectedAt: string;
};

function canUseStorage(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined"
  );
}

function toStored(finding: SecurityFinding): StoredSecurityFinding {
  const detectedAt =
    finding.detectedAt instanceof Date
      ? finding.detectedAt.toISOString()
      : new Date(finding.detectedAt).toISOString();

  return {
    ...finding,
    detectedAt,
  };
}

function fromStored(raw: unknown): SecurityFinding | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;

  const id = typeof entry.id === "string" ? entry.id : "";
  if (!id) return null;

  const type = entry.type as SecurityFinding["type"] | undefined;
  const severity = entry.severity as SecuritySeverity | undefined;
  const status = entry.status as SecurityFindingStatus | undefined;

  if (!type || !severity || !status) return null;

  const detectedAtRaw =
    typeof entry.detectedAt === "string" ? entry.detectedAt : undefined;
  const detectedAt = detectedAtRaw
    ? new Date(detectedAtRaw)
    : new Date(Date.now());

  const location =
    typeof entry.location === "object" && entry.location !== null
      ? (entry.location as SecurityFinding["location"])
      : {};

  const rawEvidence =
    typeof entry.rawEvidence === "string" || entry.rawEvidence === undefined
      ? (entry.rawEvidence as string | undefined)
      : undefined;
  const evidenceValue = typeof entry.evidence === "string" ? entry.evidence : "";

  const normalizedEvidence = rawEvidence
    ? evidenceValue && evidenceValue !== rawEvidence
      ? evidenceValue
      : maskSecret(rawEvidence)
    : evidenceValue;

  return {
    id,
    runId:
      typeof entry.runId === "string" || entry.runId === undefined
        ? (entry.runId as string | undefined)
        : undefined,
    runCaseId:
      typeof entry.runCaseId === "string" || entry.runCaseId === undefined
        ? (entry.runCaseId as string | undefined)
        : undefined,
    type,
    severity,
    name: typeof entry.name === "string" ? entry.name : "Security finding",
    description:
      typeof entry.description === "string"
        ? entry.description
        : "Security issue detected by BrowserQA.",
    location,
    evidence: normalizedEvidence,
    rawEvidence,
    status,
    detectedAt,
  };
}

function safeParse(raw: string | null): SecurityFinding[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((entry) => fromStored(entry))
      .filter((entry): entry is SecurityFinding => entry !== null);
  } catch {
    return [];
  }
}

function loadAllInternal(): SecurityFinding[] {
  if (!canUseStorage()) return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return safeParse(raw);
}

function saveAllInternal(findings: SecurityFinding[]): void {
  if (!canUseStorage()) return;
  const stored = findings.map((finding) => toStored(finding));
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}

export function getAll(): SecurityFinding[] {
  return loadAllInternal();
}

export function getByRunId(runId: string): SecurityFinding[] {
  return loadAllInternal().filter((finding) => finding.runId === runId);
}

export function getOpenFindings(): SecurityFinding[] {
  return loadAllInternal().filter((finding) => finding.status === "open");
}

export function create(finding: SecurityFinding): SecurityFinding {
  const findings = loadAllInternal();
  const now = new Date();

  const normalized: SecurityFinding = {
    ...finding,
    id: finding.id,
    status: finding.status ?? "open",
    detectedAt: finding.detectedAt ?? now,
  };

  findings.push(normalized);
  saveAllInternal(findings);
  return normalized;
}

export function createMany(findings: SecurityFinding[]): SecurityFinding[] {
  const existing = loadAllInternal();
  const now = new Date();

  const normalized = findings.map<SecurityFinding>((finding) => ({
    ...finding,
    id: finding.id,
    status: finding.status ?? "open",
    detectedAt: finding.detectedAt ?? now,
  }));

  const merged = [...existing, ...normalized];
  saveAllInternal(merged);
  return merged;
}

export function updateStatus(
  id: string,
  status: SecurityFindingStatus,
): SecurityFinding | null {
  const findings = loadAllInternal();
  const index = findings.findIndex((finding) => finding.id === id);
  if (index === -1) return null;

  findings[index] = {
    ...findings[index],
    status,
  };

  saveAllInternal(findings);
  return findings[index] ?? null;
}

export function deleteFinding(id: string): void {
  const findings = loadAllInternal().filter((finding) => finding.id !== id);
  saveAllInternal(findings);
}

export function getSummary(): SecurityScanSummary {
  const findings = loadAllInternal();
  return createSummary(findings);
}

export function getBySeverity(
  severity: SecuritySeverity,
): SecurityFinding[] {
  return loadAllInternal().filter((finding) => finding.severity === severity);
}

export function getByType(
  type: SecurityFindingType,
): SecurityFinding[] {
  return loadAllInternal().filter((finding) => finding.type === type);
}

export function runScan(
  _config: SecurityScanConfig,
): { findings: SecurityFinding[]; summary: SecurityScanSummary } {
  const existing = loadAllInternal();
  const demo = generateDemoSecurityFindings();

  const merged = [...existing, ...demo];
  saveAllInternal(merged);

  const reloaded = loadAllInternal();
  const summary = createSummary(reloaded);

  return { findings: reloaded, summary };
}

export function initSecurityDemoData(): void {
  if (!canUseStorage()) return;
  const existing = loadAllInternal();
  if (existing.length > 0) return;

  const demo = generateDemoSecurityFindings();
  saveAllInternal(demo);
}

