/**
 * Database Schema and TypeScript Types for BrowserQA Studio
 * Based on the specification document
 */

// ==================== Enums ====================

export type RunStatus = 'pending' | 'running' | 'passed' | 'failed' | 'canceled';
export type TestCaseOrigin = 'auto' | 'guideline';
export type ViewportKey = 'desktop' | 'mobile';
export type IssueSeverity = 'critical' | 'major' | 'minor';

// ==================== Viewport Configuration ====================

export interface Viewport {
  id: string;
  suiteId: string;
  key: ViewportKey;
  label: string;
  width: number;
  height: number;
  enabled: boolean;
}

export const DEFAULT_VIEWPORTS: Omit<Viewport, 'id' | 'suiteId'>[] = [
  { key: 'desktop', label: 'Desktop', width: 1440, height: 900, enabled: true },
  { key: 'mobile', label: 'Mobile', width: 390, height: 844, enabled: true },
];

// ==================== Suite ====================

export interface Suite {
  id: string;
  name: string;
  projectPath: string;
  baseUrl: string;
  guidelinePath?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ==================== Test Case ====================

export interface Assertion {
  kind: 'url_path_equals' | 'text_present' | 'text_absent' | 'title_contains';
  value: string;
  source?: {
    file: string;
    line: number;
  };
}

export interface TestCase {
  id: string;
  suiteId: string;
  externalCaseId: string;
  name: string;
  path: string;
  origin: TestCaseOrigin;
  assertions: Assertion[];
  sourceRefsJson?: string;
  createdAt: Date;
}

// ==================== Run ====================

export interface Run {
  id: string;
  suiteId: string;
  status: RunStatus;
  startedAt: Date;
  finishedAt?: Date;
  trigger: 'manual' | 'scheduled';
  summaryJson?: string;
}

// ==================== Run Case (Test Case × Viewport) ====================

export interface AssertionResult {
  assertionKind: string;
  expected: string;
  actual: string;
  passed: boolean;
  message: string;
  source?: {
    file: string;
    line: number;
  };
}

export interface RunCase {
  id: string;
  runId: string;
  testCaseId: string;
  viewportKey: ViewportKey;
  browserUseTaskId?: string;
  status: RunStatus;
  error?: string;
  liveUrl?: string;
  publicShareUrl?: string;
  outputJson?: string;
  assertionResults?: AssertionResult[];
  startedAt?: Date;
  finishedAt?: Date;
}

// ==================== Issue ====================

export interface Issue {
  id: string;
  runId: string;
  runCaseId: string;
  severity: IssueSeverity;
  title: string;
  symptom: string;
  expected: string;
  actual: string;
  reproStepsJson: string;
  fileHintsJson: string;
  fixGuidance: string;
  createdAt: Date;
}

// ==================== Artifact ====================

export interface Artifact {
  id: string;
  runCaseId: string;
  kind: 'screenshot' | 'video' | 'trace' | 'log';
  urlOrPath: string;
  metadataJson?: string;
}

// ==================== Manifest Contract (Python -> Next.js) ====================

export interface GeneratedManifest {
  analysisSummary: {
    scannedFiles: number;
    routesFound: string[];
    expectedTextCount: number;
    expectedTitleCount: number;
  };
  testCases: Array<{
    caseId: string;
    name: string;
    path: string;
    origin: TestCaseOrigin;
    assertions: Assertion[];
  }>;
}

// ==================== Run Result Contract (Worker -> DB/UI) ====================

export interface RunCaseResult {
  runCaseId: string;
  status: RunStatus;
  viewport: {
    key: ViewportKey;
    width: number;
    height: number;
  };
  browserUseTaskId?: string;
  liveUrl?: string;
  publicShareUrl?: string;
  assertionResults: AssertionResult[];
  error?: string;
}

// ==================== API Response Types ====================

export interface SuiteWithStats extends Suite {
  testCaseCount: number;
  lastRunStatus?: RunStatus;
  lastRunAt?: Date;
  passRate?: number;
}

export interface RunWithDetails extends Run {
  suite?: Suite;
  runCases: RunCase[];
  issues: Issue[];
}

export interface DashboardStats {
  totalSuites: number;
  totalRuns: number;
  totalTestCases: number;
  passRate: number;
  recentRuns: Run[];
}

// ==================== Browser-Use Configuration ====================

export interface BrowserUseConfig {
  baseUrl: string;
  apiKey: string;
}

export const DEFAULT_BROWSER_USE_CONFIG: BrowserUseConfig = {
  baseUrl: process.env.BROWSER_USE_BASE_URL || 'http://localhost:8000',
  apiKey: process.env.BROWSER_USE_API_KEY || '',
};

// ==================== Report Types ====================

export interface ReportData {
  run: Run;
  suite: Suite;
  testCases: TestCase[];
  runCases: RunCase[];
  issues: Issue[];
  summary: {
    totalTests: number;
    passed: number;
    failed: number;
    passRate: number;
    duration: number;
  };
}

export interface ExportedReport {
  markdown: string;
  json: ReportData;
  issues: Issue[];
}
