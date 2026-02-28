export type AssertionKind =
  | "url_path_equals"
  | "text_present"
  | "text_absent"
  | "title_contains";

export type Assertion = {
  kind: AssertionKind;
  value: string;
  source?: { file: string; line: number };
};

export type GeneratedManifest = {
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
    origin: "auto" | "guideline";
    assertions: Assertion[];
  }>;
};

export type RunCaseResult = {
  runCaseId: number;
  status: "pending" | "running" | "passed" | "failed";
  viewport: { key: "desktop" | "mobile"; width: number; height: number };
  browserUseTaskId?: string;
  liveUrl?: string;
  publicShareUrl?: string;
  assertionResults: Array<{
    assertionKind: string;
    expected: string;
    actual: string;
    passed: boolean;
    message: string;
    source?: { file: string; line: number };
  }>;
  error?: string;
};

export type BrowserUseLifecycleStatus =
  | "created"
  | "running"
  | "finished"
  | "failed"
  | "stopped"
  | "paused";
