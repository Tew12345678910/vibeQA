/**
 * Suite Form Page
 * Create or edit a test suite
 */

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Save, Folder, ExternalLink, FileText } from 'lucide-react';
import { suiteStore } from '../lib/store';

const SuiteForm: React.FC = () => {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [projectPath, setProjectPath] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [guidelinePath, setGuidelinePath] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!projectPath.trim()) {
      newErrors.projectPath = 'Project path is required';
    }

    if (!baseUrl.trim()) {
      newErrors.baseUrl = 'Base URL is required';
    } else {
      try {
        new URL(baseUrl);
      } catch {
        newErrors.baseUrl = 'Invalid URL format';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    const suite = suiteStore.create({
      name: name.trim(),
      projectPath: projectPath.trim(),
      baseUrl: baseUrl.trim(),
      guidelinePath: guidelinePath.trim() || undefined,
    });

    navigate(`/suites/${suite.id}`);
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link
          to="/suites"
          className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-white">Create Test Suite</h1>
          <p className="text-slate-400 mt-2">
            Set up a new QA test suite for your project
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-slate-800 rounded-xl border border-slate-700 p-6">
        <div className="space-y-6">
          {/* Name */}
          <div>
            <label className="block text-slate-400 text-sm mb-2">
              Suite Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., E-Commerce Tests"
              className={`w-full bg-slate-700 border rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 ${
                errors.name ? 'border-red-500' : 'border-slate-600'
              }`}
            />
            {errors.name && <p className="text-red-400 text-sm mt-1">{errors.name}</p>}
          </div>

          {/* Project Path */}
          <div>
            <label className="block text-slate-400 text-sm mb-2">
              Project Path <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <Folder className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <input
                type="text"
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                placeholder="/workspace/my-project"
                className={`w-full bg-slate-700 border rounded-lg pl-10 pr-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 ${
                  errors.projectPath ? 'border-red-500' : 'border-slate-600'
                }`}
              />
            </div>
            {errors.projectPath && <p className="text-red-400 text-sm mt-1">{errors.projectPath}</p>}
            <p className="text-slate-500 text-xs mt-1">
              Absolute path to your project directory
            </p>
          </div>

          {/* Base URL */}
          <div>
            <label className="block text-slate-400 text-sm mb-2">
              Base URL <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <ExternalLink className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:3000 or https://example.com"
                className={`w-full bg-slate-700 border rounded-lg pl-10 pr-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 ${
                  errors.baseUrl ? 'border-red-500' : 'border-slate-600'
                }`}
              />
            </div>
            {errors.baseUrl && <p className="text-red-400 text-sm mt-1">{errors.baseUrl}</p>}
            <p className="text-slate-500 text-xs mt-1">
              The base URL where your application is running
            </p>
          </div>

          {/* Guideline Path (Optional) */}
          <div>
            <label className="block text-slate-400 text-sm mb-2">
              Guideline Path <span className="text-slate-500">(optional)</span>
            </label>
            <div className="relative">
              <FileText className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <input
                type="text"
                value={guidelinePath}
                onChange={(e) => setGuidelinePath(e.target.value)}
                placeholder="/workspace/guidelines/qa.md"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg pl-10 pr-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <p className="text-slate-500 text-xs mt-1">
              Path to a markdown file with QA guidelines and test requirements
            </p>
          </div>

          {/* Info Box */}
          <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <h4 className="text-blue-400 font-medium mb-2">What's next?</h4>
            <ul className="text-slate-400 text-sm space-y-1">
              <li>• After creating the suite, click "Sync Tests" to generate test cases from your code</li>
              <li>• Configure viewports for desktop and mobile testing</li>
              <li>• Run your suite to see AI-powered QA testing in action</li>
            </ul>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 mt-8 pt-6 border-t border-slate-700">
          <Link
            to="/suites"
            className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-center transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="flex-1 flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg py-2.5 transition-colors"
          >
            <Save size={18} />
            <span className="font-medium">Create Suite</span>
          </button>
        </div>
      </form>
    </div>
  );
};

export default SuiteForm;
