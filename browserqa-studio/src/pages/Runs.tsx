/**
 * Runs List Page
 * Shows all test runs with filtering
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Play,
  Search,
  Filter,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import StatusBadge from '../components/ui/Badge';
import { runStore, suiteStore, runCaseStore } from '../lib/store';
import { Run } from '../types/schema';

const Runs: React.FC = () => {
  const [runs, setRuns] = useState<Run[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'passed' | 'failed' | 'running' | 'pending'>('all');

  useEffect(() => {
    setRuns(runStore.getAll().sort((a, b) =>
      new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    ));
  }, []);

  const filteredRuns = runs.filter((run) => {
    const suite = suiteStore.getById(run.suiteId);
    const matchesSearch =
      suite?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      run.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || run.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getSuiteName = (suiteId: string) => {
    const suite = suiteStore.getById(suiteId);
    return suite?.name || 'Unknown Suite';
  };

  const getRunStats = (runId: string) => {
    const runCases = runCaseStore.getByRun(runId);
    return {
      passed: runCases.filter((rc) => rc.status === 'passed').length,
      failed: runCases.filter((rc) => rc.status === 'failed').length,
      total: runCases.length,
    };
  };

  const statusCounts = {
    all: runs.length,
    passed: runs.filter((r) => r.status === 'passed').length,
    failed: runs.filter((r) => r.status === 'failed').length,
    running: runs.filter((r) => r.status === 'running').length,
    pending: runs.filter((r) => r.status === 'pending').length,
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Test Runs</h1>
        <p className="text-slate-400 mt-2">
          View and manage all test execution runs
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
            placeholder="Search runs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="text-slate-400" size={18} />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Status ({statusCounts.all})</option>
            <option value="passed">Passed ({statusCounts.passed})</option>
            <option value="failed">Failed ({statusCounts.failed})</option>
            <option value="running">Running ({statusCounts.running})</option>
            <option value="pending">Pending ({statusCounts.pending})</option>
          </select>
        </div>
      </div>

      {/* Runs List */}
      {filteredRuns.length === 0 ? (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-12 text-center">
          <Play className="mx-auto text-slate-600 mb-4" size={48} />
          <h3 className="text-xl font-semibold text-white mb-2">No runs found</h3>
          <p className="text-slate-400">
            {searchQuery || statusFilter !== 'all'
              ? 'Try adjusting your filters'
              : 'Run a test suite to see results here'}
          </p>
        </div>
      ) : (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left p-4 text-slate-400 font-medium text-sm">Run</th>
                <th className="text-left p-4 text-slate-400 font-medium text-sm">Suite</th>
                <th className="text-left p-4 text-slate-400 font-medium text-sm">Status</th>
                <th className="text-left p-4 text-slate-400 font-medium text-sm">Results</th>
                <th className="text-left p-4 text-slate-400 font-medium text-sm">Trigger</th>
                <th className="text-left p-4 text-slate-400 font-medium text-sm">Date</th>
                <th className="text-right p-4 text-slate-400 font-medium text-sm">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRuns.map((run) => {
                const stats = getRunStats(run.id);
                return (
                  <tr
                    key={run.id}
                    className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors"
                  >
                    <td className="p-4">
                      <Link
                        to={`/runs/${run.id}`}
                        className="text-blue-400 hover:text-blue-300 font-medium"
                      >
                        {run.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="p-4 text-white">{getSuiteName(run.suiteId)}</td>
                    <td className="p-4">
                      <StatusBadge status={run.status} />
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <span className="text-green-400 text-sm">
                          {stats.passed} passed
                        </span>
                        <span className="text-slate-600">/</span>
                        <span className="text-red-400 text-sm">
                          {stats.failed} failed
                        </span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="text-slate-400 text-sm capitalize">{run.trigger}</span>
                    </td>
                    <td className="p-4">
                      <span className="text-slate-400 text-sm flex items-center gap-1">
                        <Clock size={12} />
                        {formatDate(run.startedAt)}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <Link
                        to={`/runs/${run.id}`}
                        className="text-blue-400 hover:text-blue-300 text-sm inline-flex items-center gap-1"
                      >
                        View <ArrowRight size={14} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Runs;
