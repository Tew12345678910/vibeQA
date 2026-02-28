export type SecuritySeverity = "critical" | "high" | "medium" | "low" | "info";

export type SecurityFindingType =
  | "secret_leak"
  | "pii_exposure"
  | "xss_vulnerability"
  | "sql_injection"
  | "insecure_dependency"
  | "insecure_header"
  | "csrf_missing";

export type SecurityFindingStatus = "open" | "false_positive" | "resolved";

export interface SecurityFindingLocation {
  url?: string;
  file?: string;
  line?: number;
  selector?: string;
  requestUrl?: string;
}

export interface SecurityFinding {
  id: string;
  runId?: string;
  runCaseId?: string;
  type: SecurityFindingType;
  severity: SecuritySeverity;
  name: string;
  description: string;
  location: SecurityFindingLocation;
  evidence: string;
  rawEvidence?: string;
  status: SecurityFindingStatus;
  detectedAt: Date;
}

export interface SecurityEducation {
  type: SecurityFindingType;
  title: string;
  explanation: string;
  impact: string;
  remediation: string;
  references: string[];
  cweId?: string;
  owaspCategory?: string;
}

export interface SecurityScanConfig {
  enableSecretsScan: boolean;
  enablePiiScan: boolean;
  enableXssScan: boolean;
  enableDependencyScan: boolean;
  enableHeaderScan: boolean;
  failOnCritical: boolean;
}

export interface SecurityScanSummary {
  totalFindings: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  infoCount: number;
  byType: Record<SecurityFindingType, number>;
  riskScore: number;
}

