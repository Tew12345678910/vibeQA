/**
 * Data Store for BrowserQA Studio
 * Provides localStorage-based persistence for the QA platform
 */

import {
  Suite,
  TestCase,
  Run,
  RunCase,
  Issue,
  Artifact,
  Viewport,
  DEFAULT_VIEWPORTS,
  RunStatus,
  TestCaseOrigin,
  Assertion,
  GeneratedManifest,
  IssueSeverity
} from '../types/schema';

// Generate unique IDs
const generateId = () => Math.random().toString(36).substring(2, 15) + Date.now().toString(36);

// Storage keys
const STORAGE_KEYS = {
  SUITES: 'browserqa_suites',
  TEST_CASES: 'browserqa_test_cases',
  RUNS: 'browserqa_runs',
  RUN_CASES: 'browserqa_run_cases',
  ISSUES: 'browserqa_issues',
  ARTIFACTS: 'browserqa_artifacts',
  VIEWPORTS: 'browserqa_viewports',
  CONFIG: 'browserqa_config',
};

// Generic storage helpers
const getStorage = <T>(key: string, defaultValue: T): T => {
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Convert date strings back to Date objects
      return parsed;
    }
  } catch (e) {
    console.error(`Error reading from localStorage: ${key}`, e);
  }
  return defaultValue;
};

const setStorage = <T>(key: string, value: T): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`Error writing to localStorage: ${key}`, e);
  }
};

// ==================== Suite Store ====================

export const suiteStore = {
  getAll: (): Suite[] => {
    const suites = getStorage<Suite[]>(STORAGE_KEYS.SUITES, []);
    return suites.map(s => ({
      ...s,
      createdAt: new Date(s.createdAt),
      updatedAt: new Date(s.updatedAt),
    }));
  },

  getById: (id: string): Suite | undefined => {
    const suites = suiteStore.getAll();
    return suites.find(s => s.id === id);
  },

  create: (suite: Omit<Suite, 'id' | 'createdAt' | 'updatedAt'>): Suite => {
    const suites = suiteStore.getAll();
    const newSuite: Suite = {
      ...suite,
      id: generateId(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    suites.push(newSuite);
    setStorage(STORAGE_KEYS.SUITES, suites);

    // Create default viewports for the suite
    viewportStore.createForSuite(newSuite.id);

    return newSuite;
  },

  update: (id: string, updates: Partial<Suite>): Suite | undefined => {
    const suites = suiteStore.getAll();
    const index = suites.findIndex(s => s.id === id);
    if (index === -1) return undefined;

    suites[index] = {
      ...suites[index],
      ...updates,
      updatedAt: new Date(),
    };
    setStorage(STORAGE_KEYS.SUITES, suites);
    return suites[index];
  },

  delete: (id: string): boolean => {
    const suites = suiteStore.getAll();
    const filtered = suites.filter(s => s.id !== id);
    if (filtered.length === suites.length) return false;

    setStorage(STORAGE_KEYS.SUITES, filtered);
    // Also delete related data
    testCaseStore.deleteBySuite(id);
    runStore.deleteBySuite(id);
    viewportStore.deleteBySuite(id);
    return true;
  },
};

// ==================== Viewport Store ====================

export const viewportStore = {
  getBySuite: (suiteId: string): Viewport[] => {
    const all = getStorage<Viewport[]>(STORAGE_KEYS.VIEWPORTS, []);
    return all.filter(v => v.suiteId === suiteId);
  },

  createForSuite: (suiteId: string): Viewport[] => {
    const viewports: Viewport[] = DEFAULT_VIEWPORTS.map(v => ({
      ...v,
      id: generateId(),
      suiteId,
    }));

    const existing = getStorage<Viewport[]>(STORAGE_KEYS.VIEWPORTS, []);
    setStorage(STORAGE_KEYS.VIEWPORTS, [...existing, ...viewports]);
    return viewports;
  },

  update: (id: string, updates: Partial<Viewport>): Viewport | undefined => {
    const all = getStorage<Viewport[]>(STORAGE_KEYS.VIEWPORTS, []);
    const index = all.findIndex(v => v.id === id);
    if (index === -1) return undefined;

    all[index] = { ...all[index], ...updates };
    setStorage(STORAGE_KEYS.VIEWPORTS, all);
    return all[index];
  },

  deleteBySuite: (suiteId: string): void => {
    const all = getStorage<Viewport[]>(STORAGE_KEYS.VIEWPORTS, []);
    setStorage(STORAGE_KEYS.VIEWPORTS, all.filter(v => v.suiteId !== suiteId));
  },
};

// ==================== Test Case Store ====================

export const testCaseStore = {
  getAll: (): TestCase[] => {
    const cases = getStorage<TestCase[]>(STORAGE_KEYS.TEST_CASES, []);
    return cases.map(c => ({
      ...c,
      createdAt: new Date(c.createdAt),
    }));
  },

  getBySuite: (suiteId: string): TestCase[] => {
    return testCaseStore.getAll().filter(c => c.suiteId === suiteId);
  },

  getById: (id: string): TestCase | undefined => {
    return testCaseStore.getAll().find(c => c.id === id);
  },

  create: (testCase: Omit<TestCase, 'id' | 'createdAt'>): TestCase => {
    const cases = testCaseStore.getAll();
    const newCase: TestCase = {
      ...testCase,
      id: generateId(),
      createdAt: new Date(),
    };
    cases.push(newCase);
    setStorage(STORAGE_KEYS.TEST_CASES, cases);
    return newCase;
  },

  createMany: (testCases: Omit<TestCase, 'id' | 'createdAt'>[]): TestCase[] => {
    const cases = testCaseStore.getAll();
    const newCases: TestCase[] = testCases.map(tc => ({
      ...tc,
      id: generateId(),
      createdAt: new Date(),
    }));
    setStorage(STORAGE_KEYS.TEST_CASES, [...cases, ...newCases]);
    return newCases;
  },

  upsertFromManifest: (suiteId: string, manifest: GeneratedManifest): TestCase[] => {
    // Delete existing auto-generated test cases for this suite
    const existing = testCaseStore.getAll();
    const toKeep = existing.filter(c => c.suiteId !== suiteId || c.origin !== 'auto');
    setStorage(STORAGE_KEYS.TEST_CASES, toKeep);

    // Create new test cases from manifest
    const newCases: TestCase[] = manifest.testCases.map(tc => ({
      id: generateId(),
      suiteId,
      externalCaseId: tc.caseId,
      name: tc.name,
      path: tc.path,
      origin: tc.origin,
      assertions: tc.assertions,
      createdAt: new Date(),
    }));

    setStorage(STORAGE_KEYS.TEST_CASES, [...toKeep, ...newCases]);
    return newCases;
  },

  delete: (id: string): boolean => {
    const cases = testCaseStore.getAll();
    const filtered = cases.filter(c => c.id !== id);
    if (filtered.length === cases.length) return false;
    setStorage(STORAGE_KEYS.TEST_CASES, filtered);
    return true;
  },

  deleteBySuite: (suiteId: string): void => {
    const cases = testCaseStore.getAll();
    setStorage(STORAGE_KEYS.TEST_CASES, cases.filter(c => c.suiteId !== suiteId));
  },
};

// ==================== Run Store ====================

export const runStore = {
  getAll: (): Run[] => {
    const runs = getStorage<Run[]>(STORAGE_KEYS.RUNS, []);
    return runs.map(r => ({
      ...r,
      startedAt: new Date(r.startedAt),
      finishedAt: r.finishedAt ? new Date(r.finishedAt) : undefined,
    }));
  },

  getBySuite: (suiteId: string): Run[] => {
    return runStore.getAll().filter(r => r.suiteId === suiteId);
  },

  getById: (id: string): Run | undefined => {
    return runStore.getAll().find(r => r.id === id);
  },

  create: (run: Omit<Run, 'id' | 'startedAt'>): Run => {
    const runs = runStore.getAll();
    const newRun: Run = {
      ...run,
      id: generateId(),
      startedAt: new Date(),
    };
    runs.push(newRun);
    setStorage(STORAGE_KEYS.RUNS, runs);
    return newRun;
  },

  update: (id: string, updates: Partial<Run>): Run | undefined => {
    const runs = runStore.getAll();
    const index = runs.findIndex(r => r.id === id);
    if (index === -1) return undefined;

    runs[index] = { ...runs[index], ...updates };
    setStorage(STORAGE_KEYS.RUNS, runs);
    return runs[index];
  },

  delete: (id: string): boolean => {
    const runs = runStore.getAll();
    const filtered = runs.filter(r => r.id !== id);
    if (filtered.length === runs.length) return false;

    setStorage(STORAGE_KEYS.RUNS, filtered);
    // Also delete related run cases and issues
    runCaseStore.deleteByRun(id);
    issueStore.deleteByRun(id);
    return true;
  },

  deleteBySuite: (suiteId: string): void => {
    const runs = runStore.getAll();
    const suiteRuns = runs.filter(r => r.suiteId === suiteId);
    suiteRuns.forEach(r => {
      runCaseStore.deleteByRun(r.id);
      issueStore.deleteByRun(r.id);
    });
    setStorage(STORAGE_KEYS.RUNS, runs.filter(r => r.suiteId !== suiteId));
  },
};

// ==================== Run Case Store ====================

export const runCaseStore = {
  getAll: (): RunCase[] => {
    const cases = getStorage<RunCase[]>(STORAGE_KEYS.RUN_CASES, []);
    return cases.map(c => ({
      ...c,
      startedAt: c.startedAt ? new Date(c.startedAt) : undefined,
      finishedAt: c.finishedAt ? new Date(c.finishedAt) : undefined,
    }));
  },

  getByRun: (runId: string): RunCase[] => {
    return runCaseStore.getAll().filter(rc => rc.runId === runId);
  },

  getById: (id: string): RunCase | undefined => {
    return runCaseStore.getAll().find(rc => rc.id === id);
  },

  create: (runCase: Omit<RunCase, 'id'>): RunCase => {
    const cases = runCaseStore.getAll();
    const newCase: RunCase = {
      ...runCase,
      id: generateId(),
    };
    cases.push(newCase);
    setStorage(STORAGE_KEYS.RUN_CASES, cases);
    return newCase;
  },

  createForRun: (runId: string, testCaseIds: string[], viewportKeys: string[]): RunCase[] => {
    const runCases: RunCase[] = [];
    testCaseIds.forEach(testCaseId => {
      viewportKeys.forEach(viewportKey => {
        runCases.push(runCaseStore.create({
          runId,
          testCaseId,
          viewportKey: viewportKey as 'desktop' | 'mobile',
          status: 'pending',
        }));
      });
    });
    return runCases;
  },

  update: (id: string, updates: Partial<RunCase>): RunCase | undefined => {
    const cases = runCaseStore.getAll();
    const index = cases.findIndex(rc => rc.id === id);
    if (index === -1) return undefined;

    cases[index] = { ...cases[index], ...updates };
    setStorage(STORAGE_KEYS.RUN_CASES, cases);
    return cases[index];
  },

  delete: (id: string): boolean => {
    const cases = runCaseStore.getAll();
    const filtered = cases.filter(rc => rc.id !== id);
    if (filtered.length === cases.length) return false;
    setStorage(STORAGE_KEYS.RUN_CASES, filtered);
    return true;
  },

  deleteByRun: (runId: string): void => {
    const cases = runCaseStore.getAll();
    setStorage(STORAGE_KEYS.RUN_CASES, cases.filter(rc => rc.runId !== runId));
  },
};

// ==================== Issue Store ====================

export const issueStore = {
  getAll: (): Issue[] => {
    const issues = getStorage<Issue[]>(STORAGE_KEYS.ISSUES, []);
    return issues.map(i => ({
      ...i,
      createdAt: new Date(i.createdAt),
    }));
  },

  getByRun: (runId: string): Issue[] => {
    return issueStore.getAll().filter(i => i.runId === runId);
  },

  getByRunCase: (runCaseId: string): Issue[] => {
    return issueStore.getAll().filter(i => i.runCaseId === runCaseId);
  },

  getById: (id: string): Issue | undefined => {
    return issueStore.getAll().find(i => i.id === id);
  },

  create: (issue: Omit<Issue, 'id' | 'createdAt'>): Issue => {
    const issues = issueStore.getAll();
    const newIssue: Issue = {
      ...issue,
      id: generateId(),
      createdAt: new Date(),
    };
    issues.push(newIssue);
    setStorage(STORAGE_KEYS.ISSUES, issues);
    return newIssue;
  },

  createMany: (issues: Omit<Issue, 'id' | 'createdAt'>[]): Issue[] => {
    const allIssues = issueStore.getAll();
    const newIssues: Issue[] = issues.map(i => ({
      ...i,
      id: generateId(),
      createdAt: new Date(),
    }));
    setStorage(STORAGE_KEYS.ISSUES, [...allIssues, ...newIssues]);
    return newIssues;
  },

  delete: (id: string): boolean => {
    const issues = issueStore.getAll();
    const filtered = issues.filter(i => i.id !== id);
    if (filtered.length === issues.length) return false;
    setStorage(STORAGE_KEYS.ISSUES, filtered);
    return true;
  },

  deleteByRun: (runId: string): void => {
    const issues = issueStore.getAll();
    setStorage(STORAGE_KEYS.ISSUES, issues.filter(i => i.runId !== runId));
  },
};

// ==================== Artifact Store ====================

export const artifactStore = {
  getAll: (): Artifact[] => {
    return getStorage<Artifact[]>(STORAGE_KEYS.ARTIFACTS, []);
  },

  getByRunCase: (runCaseId: string): Artifact[] => {
    return artifactStore.getAll().filter(a => a.runCaseId === runCaseId);
  },

  create: (artifact: Omit<Artifact, 'id'>): Artifact => {
    const artifacts = artifactStore.getAll();
    const newArtifact: Artifact = {
      ...artifact,
      id: generateId(),
    };
    artifacts.push(newArtifact);
    setStorage(STORAGE_KEYS.ARTIFACTS, artifacts);
    return newArtifact;
  },

  delete: (id: string): boolean => {
    const artifacts = artifactStore.getAll();
    const filtered = artifacts.filter(a => a.id !== id);
    if (filtered.length === artifacts.length) return false;
    setStorage(STORAGE_KEYS.ARTIFACTS, filtered);
    return true;
  },

  deleteByRunCase: (runCaseId: string): void => {
    const artifacts = artifactStore.getAll();
    setStorage(STORAGE_KEYS.ARTIFACTS, artifacts.filter(a => a.runCaseId !== runCaseId));
  },
};

// ==================== Utility Functions ====================

export const getSuiteStats = (suiteId: string) => {
  const testCases = testCaseStore.getBySuite(suiteId);
  const runs = runStore.getBySuite(suiteId);
  const lastRun = runs.sort((a, b) =>
    new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  )[0];

  // Calculate pass rate from all runs
  let totalPassed = 0;
  let totalFailed = 0;
  runs.forEach(run => {
    const runCases = runCaseStore.getByRun(run.id);
    runCases.forEach(rc => {
      if (rc.status === 'passed') totalPassed++;
      else if (rc.status === 'failed') totalFailed++;
    });
  });

  const total = totalPassed + totalFailed;
  const passRate = total > 0 ? Math.round((totalPassed / total) * 100) : 0;

  return {
    testCaseCount: testCases.length,
    runCount: runs.length,
    lastRunStatus: lastRun?.status,
    lastRunAt: lastRun?.startedAt,
    passRate,
  };
};

export const getDashboardStats = () => {
  const suites = suiteStore.getAll();
  const runs = runStore.getAll();
  const testCases = testCaseStore.getAll();

  let totalPassed = 0;
  let totalFailed = 0;

  runs.forEach(run => {
    const runCases = runCaseStore.getByRun(run.id);
    runCases.forEach(rc => {
      if (rc.status === 'passed') totalPassed++;
      else if (rc.status === 'failed') totalFailed++;
    });
  });

  const total = totalPassed + totalFailed;
  const passRate = total > 0 ? Math.round((totalPassed / total) * 100) : 0;

  const recentRuns = runs
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, 10);

  return {
    totalSuites: suites.length,
    totalRuns: runs.length,
    totalTestCases: testCases.length,
    passRate,
    recentRuns,
  };
};

// ==================== Demo Data Generator ====================

export const generateDemoData = () => {
  // Check if data already exists
  if (suiteStore.getAll().length > 0) return;

  // Create demo suite
  const suite = suiteStore.create({
    name: 'E-Commerce Demo',
    projectPath: '/workspace/ecommerce-app',
    baseUrl: 'http://localhost:3000',
    guidelinePath: '/workspace/guidelines/qa.md',
  });

  // Create demo test cases
  const demoTestCases: Omit<TestCase, 'id' | 'createdAt'>[] = [
    {
      suiteId: suite.id,
      externalCaseId: 'TC001',
      name: 'Homepage loads successfully',
      path: '/',
      origin: 'auto',
      assertions: [
        { kind: 'text_present', value: 'Welcome' },
        { kind: 'title_contains', value: 'E-Commerce' },
      ],
    },
    {
      suiteId: suite.id,
      externalCaseId: 'TC002',
      name: 'Product listing displays',
      path: '/products',
      origin: 'auto',
      assertions: [
        { kind: 'text_present', value: 'Products' },
        { kind: 'url_path_equals', value: '/products' },
      ],
    },
    {
      suiteId: suite.id,
      externalCaseId: 'TC003',
      name: 'Shopping cart functionality',
      path: '/cart',
      origin: 'guideline',
      assertions: [
        { kind: 'text_present', value: 'Cart' },
        { kind: 'text_absent', value: 'Error' },
      ],
    },
    {
      suiteId: suite.id,
      externalCaseId: 'TC004',
      name: 'User login page',
      path: '/login',
      origin: 'auto',
      assertions: [
        { kind: 'text_present', value: 'Login' },
        { kind: 'title_contains', value: 'Sign In' },
      ],
    },
    {
      suiteId: suite.id,
      externalCaseId: 'TC005',
      name: 'Checkout process',
      path: '/checkout',
      origin: 'guideline',
      assertions: [
        { kind: 'text_present', value: 'Checkout' },
        { kind: 'url_path_equals', value: '/checkout' },
      ],
    },
  ];

  testCaseStore.createMany(demoTestCases);

  // Create demo run with results
  const run = runStore.create({
    suiteId: suite.id,
    status: 'passed',
    trigger: 'manual',
  });

  // Complete the run
  runStore.update(run.id, {
    status: 'passed',
    finishedAt: new Date(Date.now() - 3600000), // 1 hour ago
  });

  // Create run cases
  const testCases = testCaseStore.getBySuite(suite.id);
  const viewports = ['desktop', 'mobile'] as const;

  testCases.forEach(tc => {
    viewports.forEach(vp => {
      runCaseStore.create({
        runId: run.id,
        testCaseId: tc.id,
        viewportKey: vp,
        status: Math.random() > 0.2 ? 'passed' : 'failed',
        liveUrl: `https://live.browseruse.com/${run.id}/${tc.id}`,
        publicShareUrl: `https://share.browseruse.com/${run.id}/${tc.id}`,
        startedAt: new Date(Date.now() - 4000000),
        finishedAt: new Date(Date.now() - 3600000),
        assertionResults: tc.assertions.map(a => ({
          assertionKind: a.kind,
          expected: a.value,
          actual: a.value,
          passed: Math.random() > 0.2,
          message: a.kind === 'text_present' ? 'Text found on page' : 'Assertion passed',
        })),
      });
    });
  });

  // Create a failed run
  const failedRun = runStore.create({
    suiteId: suite.id,
    status: 'failed',
    trigger: 'manual',
  });

  runStore.update(failedRun.id, {
    status: 'failed',
    finishedAt: new Date(Date.now() - 7200000), // 2 hours ago
  });

  testCases.slice(0, 2).forEach(tc => {
    viewports.forEach(vp => {
      const rc = runCaseStore.create({
        runId: failedRun.id,
        testCaseId: tc.id,
        viewportKey: vp,
        status: 'failed',
        error: vp === 'mobile' ? 'Element not found: Submit button' : undefined,
        startedAt: new Date(Date.now() - 8000000),
        finishedAt: new Date(Date.now() - 7200000),
        assertionResults: tc.assertions.map((a, i) => ({
          assertionKind: a.kind,
          expected: a.value,
          actual: i === 0 ? 'Different text' : a.value,
          passed: i === 0,
          message: i === 0 ? 'Text not found on page' : 'Assertion passed',
          source: a.source,
        })),
      });

      // Create issues for failed assertions
      if (rc.assertionResults?.some(r => !r.passed)) {
        issueStore.create({
          runId: failedRun.id,
          runCaseId: rc.id,
          severity: vp === 'mobile' ? 'critical' : 'major',
          title: `Test "${tc.name}" failed on ${vp} viewport`,
          symptom: 'Expected text was not found on the page',
          expected: tc.assertions[0].value,
          actual: 'Different text found',
          reproStepsJson: JSON.stringify([
            '1. Navigate to ' + tc.path,
            '2. Wait for page load',
            '3. Check for element',
          ]),
          fileHintsJson: JSON.stringify([{ file: 'src/pages' + tc.path + '.tsx', line: 42 }]),
          fixGuidance: 'Verify the element exists and is visible on the page',
        });
      }
    });
  });

  console.log('Demo data generated successfully!');
};

// Export all stores
export const store = {
  suite: suiteStore,
  testCase: testCaseStore,
  run: runStore,
  runCase: runCaseStore,
  issue: issueStore,
  artifact: artifactStore,
  viewport: viewportStore,
  getSuiteStats,
  getDashboardStats,
  generateDemoData,
};

export default store;
