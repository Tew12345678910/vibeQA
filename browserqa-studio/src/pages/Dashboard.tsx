/**
 * Dashboard Page
 * Main overview page with statistics and recent activity
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FolderKanban,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  Plus,
} from 'lucide-react';
import StatsCard from '../components/ui/StatsCard';
import StatusBadge from '../components/ui/Badge';
import { getDashboardStats, generateDemoData, runStore, suiteStore } from '../lib/store';
import { Run, Suite } from '../types/schema';

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState({
    totalSuites: 0,
    totalRuns: 0,
    totalTestCases: 0,
    passRate: 0,
    recentRuns: [] as Run[],
  });

  const [suites, setSuites] = useState<Suite[]>([]);

  useEffect(() => {
    // Generate demo data if needed
    generateDemoData();

    // Load stats
    const dashboardStats = getDashboardStats();
    setStats(dashboardStats);

    // Load suites
    setSuites(suiteStore.getAll());
  }, []);

  const formatDate = (date: Date) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
  };

  const getSuiteForRun = (suiteId: string) => {
    return suites.find((s) => s.id === suiteId);
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Dashboard</h1>
        <p className="text-slate-400 mt-2">
          Monitor your QA testing progress and results
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatsCard
          title="Total Suites"
          value={stats.totalSuites}
          icon={FolderKanban}
          color="blue"
        />
        <StatsCard
          title="Total Runs"
          value={stats.totalRuns}
          icon={Play}
          color="purple"
        />
        <StatsCard
          title="Test Cases"
          value={stats.totalTestCases}
          icon={CheckCircle2}
          color="green"
        />
        <StatsCard
          title="Pass Rate"
          value={`${stats.passRate}%`}
          icon={XCircle}
          color={stats.passRate >= 80 ? 'green' : stats.passRate >= 50 ? 'yellow' : 'red'}
        />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Create New Suite */}
        <Link
          to="/suites/new"
          className="bg-slate-800 rounded-xl p-6 border border-slate-700 hover:border-blue-500 transition-colors group"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white group-hover:text-blue-400 transition-colors">
                Create New Suite
              </h3>
              <p className="text-slate-400 text-sm mt-1">
                Set up a new test suite for your project
              </p>
            </div>
            <div className="p-3 bg-blue-500/20 rounded-xl group-hover:bg-blue-500/30 transition-colors">
              <Plus className="text-blue-400" size={24} />
            </div>
          </div>
        </Link>

        {/* Run All Suites */}
        <Link
          to="/suites"
          className="bg-slate-800 rounded-xl p-6 border border-slate-700 hover:border-green-500 transition-colors group"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white group-hover:text-green-400 transition-colors">
                Run All Suites
              </h3>
              <p className="text-slate-400 text-sm mt-1">
                Execute all test suites and view results
              </p>
            </div>
            <div className="p-3 bg-green-500/20 rounded-xl group-hover:bg-green-500/30 transition-colors">
              <Play className="text-green-400" size={24} />
            </div>
          </div>
        </Link>
      </div>

      {/* Recent Runs & Suites */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Runs */}
        <div className="bg-slate-800 rounded-xl border border-slate-700">
          <div className="p-4 border-b border-slate-700 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Recent Runs</h3>
            <Link
              to="/runs"
              className="text-blue-400 text-sm hover:text-blue-300 flex items-center gap-1"
            >
              View all <ArrowRight size={14} />
            </Link>
          </div>
          <div className="p-4">
            {stats.recentRuns.length === 0 ? (
              <p className="text-slate-500 text-center py-8">No runs yet</p>
            ) : (
              <div className="space-y-3">
                {stats.recentRuns.slice(0, 5).map((run) => {
                  const suite = getSuiteForRun(run.suiteId);
                  return (
                    <Link
                      key={run.id}
                      to={`/runs/${run.id}`}
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-700/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-2 rounded-lg ${
                            run.status === 'passed'
                              ? 'bg-green-500/20'
                              : run.status === 'failed'
                              ? 'bg-red-500/20'
                              : run.status === 'running'
                              ? 'bg-blue-500/20'
                              : 'bg-slate-500/20'
                          }`}
                        >
                          {run.status === 'passed' ? (
                            <CheckCircle2 className="text-green-400" size={16} />
                          ) : run.status === 'failed' ? (
                            <XCircle className="text-red-400" size={16} />
                          ) : run.status === 'running' ? (
                            <Play className="text-blue-400" size={16} />
                          ) : (
                            <Clock className="text-slate-400" size={16} />
                          )}
                        </div>
                        <div>
                          <p className="text-white font-medium">
                            {suite?.name || 'Unknown Suite'}
                          </p>
                          <p className="text-slate-500 text-xs">
                            {formatDate(run.startedAt)}
                          </p>
                        </div>
                      </div>
                      <StatusBadge status={run.status} size="sm" />
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Suites Overview */}
        <div className="bg-slate-800 rounded-xl border border-slate-700">
          <div className="p-4 border-b border-slate-700 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Suites</h3>
            <Link
              to="/suites"
              className="text-blue-400 text-sm hover:text-blue-300 flex items-center gap-1"
            >
              View all <ArrowRight size={14} />
            </Link>
          </div>
          <div className="p-4">
            {suites.length === 0 ? (
              <p className="text-slate-500 text-center py-8">
                No suites yet. Create your first suite!
              </p>
            ) : (
              <div className="space-y-3">
                {suites.slice(0, 5).map((suite) => (
                  <Link
                    key={suite.id}
                    to={`/suites/${suite.id}`}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-700/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-500/20 rounded-lg">
                        <FolderKanban className="text-blue-400" size={16} />
                      </div>
                      <div>
                        <p className="text-white font-medium">{suite.name}</p>
                        <p className="text-slate-500 text-xs">{suite.baseUrl}</p>
                      </div>
                    </div>
                    <ArrowRight className="text-slate-500" size={16} />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
