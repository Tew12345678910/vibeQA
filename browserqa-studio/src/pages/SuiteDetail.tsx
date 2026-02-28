/**
 * Suite Detail Page
 * Shows suite configuration, test cases, runs, and allows running tests
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Play,
  RefreshCw,
  Settings,
  FileText,
  History,
  AlertCircle,
  Download,
  ExternalLink,
  Folder,
  Clock,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import StatusBadge from '../components/ui/Badge';
import { suiteStore, testCaseStore, runStore, runCaseStore, viewportStore, getSuiteStats } from '../lib/store';
import { reportBuilder } from '../lib/reporting';
import { Suite, TestCase as TestCaseType, Run, Viewport } from '../types/schema';

type TabType = 'config' | 'tests' | 'runs' | 'reports';

const SuiteDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [suite, setSuite] = useState<Suite | null>(null);
  const [testCases, setTestCases] = useState<TestCaseType[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [viewports, setViewports] = useState<Viewport[]>([]);
  const [stats, setStats] = useState({ testCaseCount: 0, runCount: 0, lastRunStatus: '', lastRunAt: new Date(), passRate: 0 });
  const [activeTab, setActiveTab] = useState<TabType>('config');
  const [isRunning, setIsRunning] = useState(false);
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!id) return;

    const suiteData = suiteStore.getById(id);
    if (!suiteData) {
      navigate('/suites');
      return;
    }

    setSuite(suiteData);
    setTestCases(testCaseStore.getBySuite(id));
    setRuns(runStore.getBySuite(id).sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()));
    setViewports(viewportStore.getBySuite(id));
    setStats(getSuiteStats(id));
  }, [id, navigate]);

  const handleRun = async () => {
    if (!suite || isRunning) return;

    setIsRunning(true);

    // Create a new run
    const run = runStore.create({
      suiteId: suite.id,
      status: 'running',
      trigger: 'manual',
    });

    // Get enabled viewports
    const enabledViewports = viewports.filter(v => v.enabled).map(v => v.key);

    // Create run cases for each test case and viewport
    const runCases = runCaseStore.createForRun(
      run.id,
      testCases.map(tc => tc.id),
      enabledViewports
    );

    // Simulate running each test case
    for (const runCase of runCases) {
      // Update to running
      runCaseStore.update(runCase.id, { status: 'running', startedAt: new Date() });

      // Simulate test execution (1-3 seconds)
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

      // Random pass/fail (80% pass rate)
      const passed = Math.random() > 0.2;

      // Update run case result
      runCaseStore.update(runCase.id, {
        status: passed ? 'passed' : 'failed',
        finishedAt: new Date(),
        liveUrl: `https://live.browseruse.com/${run.id}/${runCase.id}`,
        publicShareUrl: `https://share.browseruse.com/${run.id}/${runCase.id}`,
        assertionResults: testCases
          .find(tc => tc.id === runCase.testCaseId)
          ?.assertions.map((assertion, i) => ({
            assertionKind: assertion.kind,
            expected: assertion.value,
            actual: passed ? assertion.value : 'Different value',
            passed,
            message: passed ? 'Assertion passed' : 'Assertion failed',
            source: assertion.source,
          })),
        error: passed ? undefined : 'Test assertion failed',
      });
    }

    // Update run status
    const allRunCases = runCaseStore.getByRun(run.id);
    const allPassed = allRunCases.every(rc => rc.status === 'passed');
    const anyFailed = allRunCases.some(rc => rc.status === 'failed');

    runStore.update(run.id, {
      status: anyFailed ? 'failed' : allPassed ? 'passed' : 'running',
      finishedAt: new Date(),
    });

    // Refresh data
    setRuns(runStore.getBySuite(suite.id));
    setStats(getSuiteStats(suite.id));
    setIsRunning(false);

    // Navigate to run details
    navigate(`/runs/${run.id}`);
  };

  const handleSync = () => {
    if (!suite) return;

    // Simulate manifest generation
    const manifest = {
      analysisSummary: {
        scannedFiles: 42,
        routesFound: ['/', '/products', '/cart', '/checkout', '/login'],
        expectedTextCount: 15,
        expectedTitleCount: 5,
      },
      testCases: [
        {
          caseId: 'TC001',
          name: 'Homepage loads',
          path: '/',
          origin: 'auto' as const,
          assertions: [
            { kind: 'text_present' as const, value: 'Welcome' },
            { kind: 'title_contains' as const, value: 'Home' },
          ],
        },
        {
          caseId: 'TC002',
          name: 'Products page',
          path: '/products',
          origin: 'auto' as const,
          assertions: [
            { kind: 'url_path_equals' as const, value: '/products' },
            { kind: 'text_present' as const, value: 'Products' },
          ],
        },
      ],
    };

    testCaseStore.upsertFromManifest(suite.id, manifest);
    setTestCases(testCaseStore.getBySuite(suite.id));
    setStats(getSuiteStats(suite.id));
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const toggleRunExpanded = (runId: string) => {
    const newExpanded = new Set(expandedRuns);
    if (newExpanded.has(runId)) {
      newExpanded.delete(runId);
    } else {
      newExpanded.add(runId);
    }
    setExpandedRuns(newExpanded);
  };

  if (!suite) {
    return (
      <div className="p-8 flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const tabs = [
    { key: 'config', label: 'Configuration', icon: Settings },
    { key: 'tests', label: 'Test Cases', icon: FileText },
    { key: 'runs', label: 'Runs', icon: History },
    { key: 'reports', label: 'Reports', icon: AlertCircle },
  ] as const;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/suites')}
          className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-white">{suite.name}</h1>
          <p className="text-slate-400 mt-1 flex items-center gap-2">
            <ExternalLink size={14} />
            {suite.baseUrl}
          </p>
        </div>
        <button
          onClick={handleSync}
          className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg py-2.5 px-4 transition-colors"
        >
          <RefreshCw size={18} />
          <span className="font-medium">Sync Tests</span>
        </button>
        <button
          onClick={handleRun}
          disabled={isRunning || testCases.length === 0}
          className={`flex items-center gap-2 rounded-lg py-2.5 px-4 transition-colors ${
            isRunning || testCases.length === 0
              ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
              : 'bg-green-500 hover:bg-green-600 text-white'
          }`}
        >
          <Play size={18} className={isRunning ? 'animate-pulse' : ''} />
          <span className="font-medium">{isRunning ? 'Running...' : 'Run Suite'}</span>
        </button>
      </div>

      {/* Stats Bar */}
      <div className="flex items-center gap-6 mb-8 p-4 bg-slate-800 rounded-xl border border-slate-700">
        <div className="flex items-center gap-2">
          <FileText className="text-blue-400" size={18} />
          <span className="text-slate-400">Tests:</span>
          <span className="text-white font-semibold">{stats.testCaseCount}</span>
        </div>
        <div className="flex items-center gap-2">
          <History className="text-purple-400" size={18} />
          <span className="text-slate-400">Runs:</span>
          <span className="text-white font-semibold">{stats.runCount}</span>
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="text-green-400" size={18} />
          <span className="text-slate-400">Pass Rate:</span>
          <span className={`font-semibold ${
            stats.passRate >= 80 ? 'text-green-400' : stats.passRate >= 50 ? 'text-yellow-400' : 'text-red-400'
          }`}>{stats.passRate}%</span>
        </div>
        {stats.lastRunStatus && (
          <div className="ml-auto">
            <StatusBadge status={stats.lastRunStatus as any} />
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-slate-700">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'config' && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <h3 className="text-lg font-semibold text-white mb-6">Suite Configuration</h3>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-slate-400 text-sm mb-2">Project Path</label>
              <div className="flex items-center gap-2 p-3 bg-slate-700/50 rounded-lg">
                <Folder className="text-slate-500" size={16} />
                <span className="text-white">{suite.projectPath}</span>
              </div>
            </div>
            <div>
              <label className="block text-slate-400 text-sm mb-2">Base URL</label>
              <div className="flex items-center gap-2 p-3 bg-slate-700/50 rounded-lg">
                <ExternalLink className="text-slate-500" size={16} />
                <span className="text-white">{suite.baseUrl}</span>
              </div>
            </div>
            {suite.guidelinePath && (
              <div className="col-span-2">
                <label className="block text-slate-400 text-sm mb-2">Guideline Path</label>
                <div className="flex items-center gap-2 p-3 bg-slate-700/50 rounded-lg">
                  <Folder className="text-slate-500" size={16} />
                  <span className="text-white">{suite.guidelinePath}</span>
                </div>
              </div>
            )}
          </div>

          {/* Viewports */}
          <h4 className="text-md font-semibold text-white mt-8 mb-4">Viewports</h4>
          <div className="space-y-3">
            {viewports.map((viewport) => (
              <div
                key={viewport.id}
                className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-8 bg-slate-600 rounded flex items-center justify-center">
                    {viewport.key === 'desktop' ? (
                      <svg className="w-5 h-4 text-slate-400" fill="currentColor" viewBox="0 0 20 16">
                        <path d="M18 2H2a2 2 0 00-2 2v8a2 2 0 002 2h16a2 2 0 002-2V4a2 2 0 00-2-2zm0 10H2V5h16v7zM4 8h2v1H4V8z" />
                      </svg>
                    ) : (
                      <svg className="w-3 h-5 text-slate-400" fill="currentColor" viewBox="0 0 10 16">
                        <path d="M9 1H1a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1V2a1 1 0 00-1-1zM2 14V3h6v11H2zM3 5h4v1H3V5z" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <p className="text-white font-medium">{viewport.label}</p>
                    <p className="text-slate-500 text-sm">{viewport.width} x {viewport.height}</p>
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  viewport.enabled ? 'bg-green-500/20 text-green-400' : 'bg-slate-600 text-slate-400'
                }`}>
                  {viewport.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'tests' && (
        <div className="bg-slate-800 rounded-xl border border-slate-700">
          <div className="p-4 border-b border-slate-700 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Test Cases ({testCases.length})</h3>
          </div>
          {testCases.length === 0 ? (
            <div className="p-8 text-center">
              <FileText className="mx-auto text-slate-600 mb-4" size={32} />
              <p className="text-slate-400">No test cases yet. Sync to generate tests.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-700">
              {testCases.map((tc) => (
                <div key={tc.id} className="p-4 hover:bg-slate-700/30 transition-colors">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-white font-medium">{tc.name}</h4>
                      <p className="text-slate-500 text-sm mt-1">
                        <span className="text-blue-400">{tc.path}</span>
                        <span className="mx-2">•</span>
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          tc.origin === 'auto' ? 'bg-purple-500/20 text-purple-400' : 'bg-yellow-500/20 text-yellow-400'
                        }`}>
                          {tc.origin}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {tc.assertions.map((assertion, i) => (
                      <span
                        key={i}
                        className="px-2 py-1 bg-slate-700 rounded text-xs text-slate-300"
                      >
                        {assertion.kind}: {assertion.value}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'runs' && (
        <div className="bg-slate-800 rounded-xl border border-slate-700">
          <div className="p-4 border-b border-slate-700">
            <h3 className="text-lg font-semibold text-white">Run History ({runs.length})</h3>
          </div>
          {runs.length === 0 ? (
            <div className="p-8 text-center">
              <History className="mx-auto text-slate-600 mb-4" size={32} />
              <p className="text-slate-400">No runs yet. Run the suite to see results.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-700">
              {runs.map((run) => {
                const runCases = runCaseStore.getByRun(run.id);
                const isExpanded = expandedRuns.has(run.id);

                return (
                  <div key={run.id}>
                    <div
                      className="p-4 hover:bg-slate-700/30 transition-colors cursor-pointer"
                      onClick={() => toggleRunExpanded(run.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {isExpanded ? (
                            <ChevronDown className="text-slate-400" size={18} />
                          ) : (
                            <ChevronRight className="text-slate-400" size={18} />
                          )}
                          <div>
                            <p className="text-white font-medium flex items-center gap-2">
                              Run {run.id.slice(0, 8)}
                              <StatusBadge status={run.status} size="sm" />
                            </p>
                            <p className="text-slate-500 text-sm flex items-center gap-2">
                              <Clock size={12} />
                              {formatDate(run.startedAt)}
                              <span>•</span>
                              <span>{runCases.length} test cases</span>
                              <span>•</span>
                              <span>{run.trigger}</span>
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-4 text-sm">
                            <span className="text-green-400">
                              {runCases.filter(rc => rc.status === 'passed').length} passed
                            </span>
                            <span className="text-red-400">
                              {runCases.filter(rc => rc.status === 'failed').length} failed
                            </span>
                          </div>
                          <Link
                            to={`/runs/${run.id}`}
                            className="text-blue-400 hover:text-blue-300 text-sm"
                            onClick={(e) => e.stopPropagation()}
                          >
                            View Details →
                          </Link>
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="bg-slate-900/50 p-4 border-t border-slate-700">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {runCases.map((rc) => {
                            const testCase = testCases.find(tc => tc.id === rc.testCaseId);
                            return (
                              <div
                                key={rc.id}
                                className="p-3 bg-slate-800 rounded-lg"
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  {rc.status === 'passed' ? (
                                    <CheckCircle2 className="text-green-400" size={14} />
                                  ) : (
                                    <XCircle className="text-red-400" size={14} />
                                  )}
                                  <span className="text-white text-sm">{rc.viewportKey}</span>
                                </div>
                                <p className="text-slate-400 text-xs truncate">
                                  {testCase?.name || 'Unknown'}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'reports' && (
        <div className="bg-slate-800 rounded-xl border border-slate-700">
          <div className="p-4 border-b border-slate-700">
            <h3 className="text-lg font-semibold text-white">Reports</h3>
          </div>
          {runs.length === 0 ? (
            <div className="p-8 text-center">
              <AlertCircle className="mx-auto text-slate-600 mb-4" size={32} />
              <p className="text-slate-400">No reports available. Run the suite first.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-700">
              {runs.slice(0, 10).map((run) => (
                <div
                  key={run.id}
                  className="p-4 flex items-center justify-between hover:bg-slate-700/30 transition-colors"
                >
                  <div>
                    <p className="text-white font-medium">Run {run.id.slice(0, 8)}</p>
                    <p className="text-slate-500 text-sm">{formatDate(run.startedAt)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => reportBuilder.downloadReport(run.id, 'markdown')}
                      className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm transition-colors"
                    >
                      <Download size={14} />
                      MD
                    </button>
                    <button
                      onClick={() => reportBuilder.downloadReport(run.id, 'json')}
                      className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm transition-colors"
                    >
                      <Download size={14} />
                      JSON
                    </button>
                    <Link
                      to={`/runs/${run.id}`}
                      className="flex items-center gap-1 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm transition-colors"
                    >
                      View
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SuiteDetail;
