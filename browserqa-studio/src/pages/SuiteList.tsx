/**
 * Suite List Page
 * Displays all test suites with filtering and search
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  FolderKanban,
  Search,
  Plus,
  MoreVertical,
  Play,
  Edit,
  Trash2,
  ExternalLink,
  Clock,
} from 'lucide-react';
import StatusBadge from '../components/ui/Badge';
import { suiteStore, getSuiteStats } from '../lib/store';
import { Suite } from '../types/schema';

const SuiteList: React.FC = () => {
  const [suites, setSuites] = useState<Suite[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  useEffect(() => {
    setSuites(suiteStore.getAll());
  }, []);

  const filteredSuites = suites.filter(
    (suite) =>
      suite.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      suite.baseUrl.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this suite?')) {
      suiteStore.delete(id);
      setSuites(suiteStore.getAll());
    }
    setMenuOpen(null);
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Test Suites</h1>
          <p className="text-slate-400 mt-2">
            Manage and organize your QA test suites
          </p>
        </div>
        <Link
          to="/suites/new"
          className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg py-2.5 px-4 transition-colors"
        >
          <Plus size={18} />
          <span className="font-medium">New Suite</span>
        </Link>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={18}
          />
          <input
            type="text"
            placeholder="Search suites..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Suite Grid */}
      {filteredSuites.length === 0 ? (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-12 text-center">
          <FolderKanban className="mx-auto text-slate-600 mb-4" size={48} />
          <h3 className="text-xl font-semibold text-white mb-2">No suites found</h3>
          <p className="text-slate-400 mb-6">
            {searchQuery
              ? 'Try adjusting your search query'
              : 'Create your first test suite to get started'}
          </p>
          <Link
            to="/suites/new"
            className="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg py-2.5 px-4 transition-colors"
          >
            <Plus size={18} />
            <span className="font-medium">Create Suite</span>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredSuites.map((suite) => {
            const stats = getSuiteStats(suite.id);
            return (
              <div
                key={suite.id}
                className="bg-slate-800 rounded-xl border border-slate-700 hover:border-slate-600 transition-colors group"
              >
                <div className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-500/20 rounded-lg">
                        <FolderKanban className="text-blue-400" size={20} />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-white group-hover:text-blue-400 transition-colors">
                          {suite.name}
                        </h3>
                        <p className="text-slate-500 text-sm flex items-center gap-1">
                          <ExternalLink size={12} />
                          {suite.baseUrl}
                        </p>
                      </div>
                    </div>
                    <div className="relative">
                      <button
                        onClick={() =>
                          setMenuOpen(menuOpen === suite.id ? null : suite.id)
                        }
                        className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                      >
                        <MoreVertical size={18} />
                      </button>
                      {menuOpen === suite.id && (
                        <div className="absolute right-0 top-8 bg-slate-700 rounded-lg shadow-xl py-1 min-w-[160px] z-10">
                          <Link
                            to={`/suites/${suite.id}`}
                            className="flex items-center gap-2 px-4 py-2 text-slate-300 hover:bg-slate-600 hover:text-white w-full"
                          >
                            <Edit size={14} />
                            Edit
                          </Link>
                          <Link
                            to={`/suites/${suite.id}/run`}
                            className="flex items-center gap-2 px-4 py-2 text-slate-300 hover:bg-slate-600 hover:text-white w-full"
                          >
                            <Play size={14} />
                            Run
                          </Link>
                          <button
                            onClick={() => handleDelete(suite.id)}
                            className="flex items-center gap-2 px-4 py-2 text-red-400 hover:bg-slate-600 hover:text-red-300 w-full"
                          >
                            <Trash2 size={14} />
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="text-center p-2 bg-slate-700/50 rounded-lg">
                      <p className="text-xl font-bold text-white">
                        {stats.testCaseCount}
                      </p>
                      <p className="text-xs text-slate-500">Tests</p>
                    </div>
                    <div className="text-center p-2 bg-slate-700/50 rounded-lg">
                      <p className="text-xl font-bold text-white">{stats.runCount}</p>
                      <p className="text-xs text-slate-500">Runs</p>
                    </div>
                    <div className="text-center p-2 bg-slate-700/50 rounded-lg">
                      <p
                        className={`text-xl font-bold ${
                          stats.passRate >= 80
                            ? 'text-green-400'
                            : stats.passRate >= 50
                            ? 'text-yellow-400'
                            : 'text-red-400'
                        }`}
                      >
                        {stats.passRate}%
                      </p>
                      <p className="text-xs text-slate-500">Pass</p>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-4 border-t border-slate-700">
                    {stats.lastRunStatus ? (
                      <StatusBadge status={stats.lastRunStatus} size="sm" />
                    ) : (
                      <span className="text-slate-500 text-sm">No runs yet</span>
                    )}
                    <span className="text-slate-500 text-sm flex items-center gap-1">
                      <Clock size={12} />
                      {formatDate(suite.updatedAt)}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="px-5 pb-5 flex gap-2">
                  <Link
                    to={`/suites/${suite.id}`}
                    className="flex-1 text-center py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors text-sm font-medium"
                  >
                    View Details
                  </Link>
                  <Link
                    to={`/suites/${suite.id}/run`}
                    className="flex items-center justify-center gap-1 px-4 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
                  >
                    <Play size={14} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Click outside to close menu */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setMenuOpen(null)}
        />
      )}
    </div>
  );
};

export default SuiteList;
