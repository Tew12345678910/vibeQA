/**
 * Issues Page
 * Shows all issues across all runs
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Search,
  Filter,
  ArrowRight,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { issueStore, runStore, runCaseStore, suiteStore } from '../lib/store';
import { Issue, Run } from '../types/schema';

const Issues: React.FC = () => {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'major' | 'minor'>('all');

  useEffect(() => {
    setIssues(issueStore.getAll());
  }, []);

  const filteredIssues = issues.filter((issue) => {
    const matchesSearch =
      issue.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      issue.symptom.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSeverity = severityFilter === 'all' || issue.severity === severityFilter;
    return matchesSearch && matchesSeverity;
  });

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getRunInfo = (runId: string) => {
    const run = runStore.getById(runId);
    if (!run) return { suiteName: 'Unknown', runDate: '' };
    const suite = suiteStore.getById(run.suiteId);
    return {
      suiteName: suite?.name || 'Unknown',
      runDate: formatDate(run.startedAt),
    };
  };

  const getRunCaseInfo = (runCaseId: string) => {
    const runCase = runCaseStore.getById(runCaseId);
    return runCase?.viewportKey || 'unknown';
  };

  const severityCounts = {
    all: issues.length,
    critical: issues.filter((i) => i.severity === 'critical').length,
    major: issues.filter((i) => i.severity === 'major').length,
    minor: issues.filter((i) => i.severity === 'minor').length,
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Issues</h1>
        <p className="text-slate-400 mt-2">
          View and track all detected issues across your test runs
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={18}
          />
          <input
            type="text"
            placeholder="Search issues..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="text-slate-400" size={18} />
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as any)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Severity ({severityCounts.all})</option>
            <option value="critical">Critical ({severityCounts.critical})</option>
            <option value="major">Major ({severityCounts.major})</option>
            <option value="minor">Minor ({severityCounts.minor})</option>
          </select>
        </div>
      </div>

      {/* Issues List */}
      {filteredIssues.length === 0 ? (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-12 text-center">
          <AlertTriangle className="mx-auto text-slate-600 mb-4" size={48} />
          <h3 className="text-xl font-semibold text-white mb-2">No issues found</h3>
          <p className="text-slate-400">
            {searchQuery || severityFilter !== 'all'
              ? 'Try adjusting your filters'
              : 'All tests are passing. Great job!'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredIssues.map((issue) => {
            const { suiteName, runDate } = getRunInfo(issue.runId);
            const viewport = getRunCaseInfo(issue.runCaseId);

            return (
              <div
                key={issue.id}
                className="bg-slate-800 rounded-xl border border-slate-700 hover:border-slate-600 transition-colors"
              >
                <div className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                          issue.severity === 'critical'
                            ? 'bg-red-500/20 text-red-400'
                            : issue.severity === 'major'
                            ? 'bg-orange-500/20 text-orange-400'
                            : 'bg-yellow-500/20 text-yellow-400'
                        }`}
                      >
                        <AlertTriangle size={12} />
                        {issue.severity.toUpperCase()}
                      </span>
                      <span className="text-slate-500 text-sm">{suiteName}</span>
                      <span className="text-slate-600">•</span>
                      <span className="text-slate-500 text-sm capitalize">{viewport}</span>
                    </div>
                    <Link
                      to={`/runs/${issue.runId}`}
                      className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1"
                    >
                      View Run <ArrowRight size={14} />
                    </Link>
                  </div>

                  <h3 className="text-lg font-semibold text-white mb-2">{issue.title}</h3>
                  <p className="text-slate-400 text-sm mb-4">{issue.symptom}</p>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <p className="text-slate-500 text-xs mb-1">Expected</p>
                      <p className="text-white text-sm truncate">{issue.expected}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-xs mb-1">Actual</p>
                      <p className="text-red-400 text-sm truncate">{issue.actual}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-xs mb-1">Run Date</p>
                      <p className="text-white text-sm flex items-center gap-1">
                        <Clock size={12} />
                        {runDate}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-xs mb-1">Recommended Fix</p>
                      <p className="text-green-400 text-sm truncate">{issue.fixGuidance}</p>
                    </div>
                  </div>

                  {/* Source Files */}
                  {issue.fileHintsJson && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-slate-500 text-xs">Source:</span>
                      {(() => {
                        try {
                          const hints = JSON.parse(issue.fileHintsJson);
                          return hints.map((hint: { file: string; line: number }, i: number) => (
                            <code
                              key={i}
                              className="text-blue-400 text-xs bg-slate-900 px-2 py-0.5 rounded"
                            >
                              {hint.file}:{hint.line}
                            </code>
                          ));
                        } catch {
                          return null;
                        }
                      })()}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Issues;
