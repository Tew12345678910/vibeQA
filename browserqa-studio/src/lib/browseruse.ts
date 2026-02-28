/**
 * Browser-Use Client Simulation
 * Simulates Browser-Use API for demo purposes
 */

import {
  RunCase,
  RunCaseResult,
  TestCase,
  Viewport,
  Assertion,
  AssertionResult,
  DEFAULT_VIEWPORTS,
} from '../types/schema';

// Simulated task states
type TaskStatus = 'created' | 'running' | 'finished' | 'failed' | 'stopped' | 'paused';

interface BrowserUseTask {
  id: string;
  status: TaskStatus;
  viewport: { width: number; height: number };
  liveUrl?: string;
  publicShareUrl?: string;
  result?: RunCaseResult;
}

// Simulated task storage
const tasks = new Map<string, BrowserUseTask>();

// Generate unique task ID
const generateTaskId = () => 'task_' + Math.random().toString(36).substring(2, 15);

// Simulate network delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ==================== Browser-Use Client API ====================

export const browserUseClient = {
  /**
   * Create a new Browser-Use task
   */
  createTask: async (params: {
    task: string;
    testCase: TestCase;
    viewport: Viewport;
    baseUrl: string;
  }): Promise<{ taskId: string; liveUrl: string }> => {
    const { task, testCase, viewport, baseUrl } = params;

    // Simulate API call delay
    await delay(500 + Math.random() * 1000);

    const taskId = generateTaskId();
    const liveUrl = `https://live.browseruse.com/${taskId}`;

    tasks.set(taskId, {
      id: taskId,
      status: 'created',
      viewport: { width: viewport.width, height: viewport.height },
      liveUrl,
      publicShareUrl: `https://share.browseruse.com/${taskId}`,
    });

    // Simulate task execution in background
    simulateTaskExecution(taskId, testCase, baseUrl);

    return { taskId, liveUrl };
  },

  /**
   * Get task status
   */
  getTaskStatus: async (taskId: string): Promise<{
    status: TaskStatus;
    liveUrl?: string;
    publicShareUrl?: string;
  }> => {
    await delay(200);

    const task = tasks.get(taskId);
    if (!task) {
      return { status: 'failed' };
    }

    return {
      status: task.status,
      liveUrl: task.liveUrl,
      publicShareUrl: task.publicShareUrl,
    };
  },

  /**
   * Get task result
   */
  getTaskResult: async (taskId: string): Promise<RunCaseResult | null> => {
    await delay(200);

    const task = tasks.get(taskId);
    if (!task || task.status !== 'finished') {
      return null;
    }

    return task.result || null;
  },

  /**
   * Stop a running task
   */
  stopTask: async (taskId: string): Promise<boolean> => {
    await delay(300);

    const task = tasks.get(taskId);
    if (!task) return false;

    task.status = 'stopped';
    tasks.set(taskId, task);
    return true;
  },

  /**
   * Preflight check - verify URL is reachable
   */
  preflightCheck: async (url: string): Promise<{
    reachable: boolean;
    error?: string;
  }> => {
    await delay(1000);

    // Simulate connectivity check
    const isLocalhost = url.includes('localhost') || url.includes('127.0.0.1');

    if (isLocalhost) {
      // Randomly fail localhost checks for demo
      if (Math.random() > 0.7) {
        return {
          reachable: false,
          error: 'Cannot connect to localhost. Make sure Browser-Use is self-hosted and reachable.',
        };
      }
    }

    return { reachable: true };
  },
};

// ==================== Task Execution Simulation ====================

async function simulateTaskExecution(
  taskId: string,
  testCase: TestCase,
  baseUrl: string
) {
  const task = tasks.get(taskId);
  if (!task) return;

  // Update status to running
  task.status = 'running';
  tasks.set(taskId, task);

  // Simulate execution time (2-5 seconds)
  const executionTime = 2000 + Math.random() * 3000;
  await delay(executionTime);

  // Determine if task passes or fails (80% pass rate for demo)
  const passed = Math.random() > 0.2;

  // Generate assertion results
  const assertionResults: AssertionResult[] = testCase.assertions.map(assertion => {
    const assertionPassed = passed || Math.random() > 0.3;

    return {
      assertionKind: assertion.kind,
      expected: assertion.value,
      actual: assertionPassed ? assertion.value : `Different: ${assertion.value}`,
      passed: assertionPassed,
      message: assertionPassed
        ? `Assertion "${assertion.kind}" passed`
        : `Assertion "${assertion.kind}" failed: expected "${assertion.value}"`,
      source: assertion.source,
    };
  });

  // Create run case result
  const viewportConfig = DEFAULT_VIEWPORTS.find(v => v.key === 'desktop')!;
  const result: RunCaseResult = {
    runCaseId: taskId,
    status: passed ? 'passed' : 'failed',
    viewport: {
      key: 'desktop',
      width: viewportConfig.width,
      height: viewportConfig.height,
    },
    browserUseTaskId: taskId,
    liveUrl: task.liveUrl,
    publicShareUrl: task.publicShareUrl,
    assertionResults,
    error: passed ? undefined : 'Test assertion failed',
  };

  // Update task with result
  task.status = passed ? 'finished' : 'failed';
  task.result = result;
  tasks.set(taskId, task);
}

// ==================== Test Case Prompt Builder ====================

export const promptBuilder = {
  /**
   * Build Browser-Use task prompt from test case
   */
  buildTaskPrompt: (testCase: TestCase, baseUrl: string): string => {
    const assertionsText = testCase.assertions
      .map((a, i) => {
        switch (a.kind) {
          case 'url_path_equals':
            return `${i + 1}. Verify URL path equals "${a.value}"`;
          case 'text_present':
            return `${i + 1}. Verify text "${a.value}" is present on the page`;
          case 'text_absent':
            return `${i + 1}. Verify text "${a.value}" is NOT present on the page`;
          case 'title_contains':
            return `${i + 1}. Verify page title contains "${a.value}"`;
          default:
            return `${i + 1}. Check ${a.kind}: ${a.value}`;
        }
      })
      .join('\n');

    return `
Please perform the following test on ${baseUrl}${testCase.path}:

Test Name: ${testCase.name}

Assertions to verify:
${assertionsText}

Please navigate to the page, perform the necessary actions, and report the results of each assertion.
`.trim();
  },

  /**
   * Extract issues from failed assertions
   */
  extractIssues: (testCase: TestCase, runCase: RunCase): {
    severity: 'critical' | 'major' | 'minor';
    title: string;
    symptom: string;
    expected: string;
    actual: string;
    fixGuidance: string;
  }[] => {
    const failedAssertions = runCase.assertionResults?.filter(a => !a.passed) || [];

    if (failedAssertions.length === 0) {
      return [];
    }

    return failedAssertions.map(assertion => {
      let severity: 'critical' | 'major' | 'minor' = 'major';
      let guidance = 'Review the test assertion and fix the issue.';

      switch (assertion.assertionKind) {
        case 'text_present':
          severity = 'major';
          guidance = 'Add the expected text to the page or update the test assertion.';
          break;
        case 'text_absent':
          severity = 'minor';
          guidance = 'Verify the text should not appear or update test expectations.';
          break;
        case 'url_path_equals':
          severity = 'critical';
          guidance = 'Fix routing or URL configuration.';
          break;
        case 'title_contains':
          severity = 'major';
          guidance = 'Update the page title to include the expected text.';
          break;
      }

      return {
        severity,
        title: `${testCase.name} - ${assertion.assertionKind.replace(/_/g, ' ')} failed`,
        symptom: assertion.message,
        expected: assertion.expected,
        actual: assertion.actual,
        fixGuidance: guidance,
      };
    });
  },
};

// ==================== Export ====================

export default {
  client: browserUseClient,
  promptBuilder,
};
