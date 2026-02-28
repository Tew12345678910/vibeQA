/**
 * Run Detail Page
 * Shows detailed results of a test run including matrix view and issues
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Download,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Monitor,
  Smartphone,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Copy,
} from 'lucide-react';
import StatusBadge from '../components/ui/Badge';
import { runStore, suiteStore, testCaseStore, runCaseStore, issueStore } from '../lib/store';
import { reportBuilder } from '../lib/reporting';
import { Run, RunCase, TestCase, Issue, Viewport } from '../types/schema';

const RunDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [run, setRun] = useState<Run | null>(null);
  const [suite, setSuite] = useState<{ name: string; baseUrl: string } | null>(null);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [runCases, setRunCases] = useState<RunCase[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [expandedCase, setExpandedCase] = useState<string | null>(null);
  const [selectedViewport, setSelectedViewport] = useState<'all' | 'desktop' | 'mobile'>('all');

  useEffect(() => {
    if (!id) return;

    const runData = runStore.getById(id);
    if (!runData) {
      navigate('/runs');
      return;
    }

    setRun(runData);

    const suiteData = suiteStore.getById(runData.suiteId);
    if (suiteData) {
      setSuite({ name: suiteData.name, baseUrl: suiteData.baseUrl });
    }

    setTestCases(testCaseStore.getBySuite(runData.suiteId));
    setRunCases(runCaseStore.getByRun(id));
    setIssues(issueStore.getByRun(id));
  }, [id, navigate]);

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const calculateDuration = () => {
    if (!run) return 0;
    const start = new Date(run.startedAt).getTime();
    const end = run.finishedAt ? new Date(run.finishedAt).getTime() : Date.now();
    return Math.round((end - start) / 1000);
  };

  const getTestCase = (testCaseId: string) => {
    return testCases.find((tc) => tc.id === testCaseId);
  };

  const filteredRunCases = runCases.filter((rc) => {
    if (selectedViewport === 'all') return true;
    return rc.viewportKey === selectedViewport;
  });

  const summary = {
    total: filteredRunCases.length,
    passed: filteredRunCases.filter((rc) => rc.status === 'passed').length,
    failed: filteredRunCases.filter((rc) => rc.status === 'failed').length,
    passRate: filteredRunCases.length > 0
      ? Math.round(
          (filteredRunCases.filter((rc) => rc.status === 'passed').length /
            filteredRunCases.length) *
            100
        )
      : 0,
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (!run || !suite) {
    return (
      <div className="p-8 flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-white">Run Details</h1>
            <StatusBadge status={run.status} size="lg" />
          </div>
          <p className="text-slate-400 mt-1">
            {suite.name} • {formatDate(run.startedAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => reportBuilder.downloadReport(run.id, 'markdown')}
            className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg py-2 px-4 transition-colors"
          >
            <Download size={16} />
            Export
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <p className="text-slate-400 text-sm">Total Tests</p>
          <p className="text-2xl font-bold text-white mt-1">{summary.total}</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <p className="text-slate-400 text-sm">Passed</p>
          <p className="text-2xl font-bold text-green-400 mt-1">{summary.passed}</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <p className="text-slate-400 text-sm">Failed</p>
          <p className="text-2xl font-bold text-red-400 mt-1">{summary.failed}</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <p className="text-slate-400 text-sm">Pass Rate</p>
          <p
            className={`text-2xl font-bold mt-1 ${
              summary.passRate >= 80
                ? 'text-green-400'
                : summary.passRate >= 50
                ? 'text-yellow-400'
                : 'text-red-400'
            }`}
          >
            {summary.passRate}%
          </p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-4 mb-6">
        <span className="text-slate-400 text-sm">Filter by viewport:</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedViewport('all')}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              selectedViewport === 'all'
                ? 'bg-blue-500 text-white'
                : 'bg-slate-700 text-slate-400 hover:text-white'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setSelectedViewport('desktop')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
              selectedViewport === 'desktop'
                ? 'bg-blue-500 text-white'
                : 'bg-slate-700 text-slate-400 hover:text-white'
            }`}
          >
            <Monitor size={14} />
            Desktop
          </button>
          <button
            onClick={() => setSelectedViewport('mobile')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
              selectedViewport === 'mobile'
                ? 'bg-blue-500 text-white'
                : 'bg-slate-700 text-slate-400 hover:text-white'
            }`}
          >
            <Smartphone size={14} />
            Mobile
          </button>
        </div>
      </div>

      {/* Test Results Matrix */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 mb-8">
        <div className="p-4 border-b border-slate-700">
          <h3 className="text-lg font-semibold text-white">Test Results Matrix</h3>
        </div>
        <div className="divide-y divide-slate-700">
          {filteredRunCases.map((rc) => {
            const testCase = getTestCase(rc.testCaseId);
            const isExpanded = expandedCase === rc.id;

            return (
              <div key={rc.id}>
                <div
                  className="p-4 hover:bg-slate-700/30 transition-colors cursor-pointer"
                  onClick={() => setExpandedCase(isExpanded ? null : rc.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown className="text-slate-400" size={18} />
                      ) : (
                        <ChevronRight className="text-slate-400" size={18} />
                      )}
                      <div
                        className={`p-2 rounded-lg ${
                          rc.status === 'passed'
                            ? 'bg-green-500/20'
                            : rc.status === 'failed'
                            ? 'bg-red-500/20'
                            : rc.status === 'running'
                            ? 'bg-blue-500/20'
                            : 'bg-slate-500/20'
                        }`}
                      >
                        {rc.status === 'passed' ? (
                          <CheckCircle2 className="text-green-400" size={18} />
                        ) : rc.status === 'failed' ? (
                          <XCircle className="text-red-400" size={18} />
                        ) : (
                          <Clock className="text-slate-400" size={18} />
                        )}
                      </div>
                      <div>
                        <p className="text-white font-medium">
                          {testCase?.name || 'Unknown Test'}
                        </p>
                        <p className="text-slate-500 text-sm">
                          {testCase?.path} • {rc.viewportKey}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {rc.liveUrl && (
                        <a
                          href={rc.liveUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Live <ExternalLink size={12} />
                        </a>
                      )}
                      {rc.publicShareUrl && (
                        <a
                          href={rc.publicShareUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-purple-400 hover:text-purple-300 text-sm flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Share <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="bg-slate-900/50 p-4 border-t border-slate-700">
                    {/* Assertion Results */}
                    <div className="mb-4">
                      <h4 className="text-slate-400 text-sm font-medium mb-3">
                        Assertion Results
                      </h4>
                      <div className="space-y-2">
                        {rc.assertionResults?.map((result, i) => (
                          <div
                            key={i}
                            className={`p-3 rounded-lg flex items-start gap-3 ${
                              result.passed
                                ? 'bg-green-500/10 border border-green-500/20'
                                : 'bg-red-500/10 border border-red-500/20'
                            }`}
                          >
                            {result.passed ? (
                              <CheckCircle2 className="text-green-400 mt-0.5" size={16} />
                            ) : (
                              <XCircle className="text-red-400 mt-0.5" size={16} />
                            )}
                            <div className="flex-1">
                              <p className="text-white text-sm font-medium">
                                {result.assertionKind.replace(/_/g, ' ')}
                              </p>
                              <p className="text-slate-400 text-xs mt-1">
                                Expected: <span className="text-white">{result.expected}</span>
                              </p>
                              {!result.passed && (
                                <p className="text-slate-400 text-xs">
                                  Actual: <span className="text-red-400">{result.actual}</span>
                                </p>
                              )}
                              <p className="text-slate-500 text-xs mt-1">{result.message}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Error */}
                    {rc.error && (
                      <div className="mb-4">
                        <h4 className="text-slate-400 text-sm font-medium mb-2">Error</h4>
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                          <p className="text-red-400 text-sm">{rc.error}</p>
                        </div>
                      </div>
                    )}

                    {/* Source */}
                    {testCase?.sourceRefsJson && (
                      <div>
                        <h4 className="text-slate-400 text-sm font-medium mb-2">Source</h4>
                        <div className="flex items-center gap-2">
                          <code className="text-blue-400 text-sm bg-slate-800 px-2 py-1 rounded">
                            {testCase.sourceRefsJson}
                          </code>
                          <button
                            onClick={() => copyToClipboard(testCase.sourceRefsJson || '')}
                            className="p-1 hover:bg-slate-700 rounded"
                          >
                            <Copy size={14} className="text-slate-400" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Issues */}
      {issues.length > 0 && (
        <div className="bg-slate-800 rounded-xl border border-slate-700">
          <div className="p-4 border-b border-slate-700 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <AlertTriangle className="text-yellow-400" size={20} />
              Issues Found ({issues.length})
            </h3>
          </div>
          <div className="divide-y divide-slate-700">
            {issues.map((issue) => (
              <div key={issue.id} className="p-4 hover:bg-slate-700/30 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium mb-2 ${
                        issue.severity === 'critical'
                          ? 'bg-red-500/20 text-red-400'
                          : issue.severity === 'major'
                          ? 'bg-orange-500/20 text-orange-400'
                          : 'bg-yellow-500/20 text-yellow-400'
                      }`}
                    >
                      {issue.severity.toUpperCase()}
                    </span>
                    <h4 className="text-white font-medium">{issue.title}</h4>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-slate-500 text-xs mb-1">Expected</p>
                    <p className="text-white text-sm">{issue.expected}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs mb-1">Actual</p>
                    <p className="text-red-400 text-sm">{issue.actual}</p>
                  </div>
                </div>

                <div className="mb-3">
                  <p className="text-slate-500 text-xs mb-1">Symptom</p>
                  <p className="text-slate-300 text-sm">{issue.symptom}</p>
                </div>

                <div className="mb-3">
                  <p className="text-slate-500 text-xs mb-1">Reproduction Steps</p>
                  <div className="bg-slate-900 p-3 rounded-lg">
                    <pre className="text-slate-300 text-xs whitespace-pre-wrap">
                      {(() => {
                        try {
                          const steps = JSON.parse(issue.reproStepsJson);
                          return steps.join('\n');
                        } catch {
                          return issue.reproStepsJson;
                        }
                      })()}
                    </pre>
                  </div>
                </div>

                <div className="mb-3">
                  <p className="text-slate-500 text-xs mb-1">Recommended Fix</p>
                  <p className="text-green-400 text-sm">{issue.fixGuidance}</p>
                </div>

                {issue.fileHintsJson && (
                  <div>
                    <p className="text-slate-500 text-xs mb-1">Likely Source Files</p>
                    <div className="flex flex-wrap gap-2">
                      {(() => {
                        try {
                          const hints = JSON.parse(issue.fileHintsJson);
                          return hints.map((hint: { file: string; line: number }, i: number) => (
                            <code
                              key={i}
                              className="text-blue-400 text-xs bg-slate-800 px-2 py-1 rounded"
                            >
                              {hint.file}:{hint.line}
                            </code>
                          ));
                        } catch {
                          return null;
                        }
                      })()}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default RunDetail;
