/**
 * Settings Page
 * Configure Browser-Use and application settings
 */

import React, { useState } from 'react';
import {
  Settings,
  Globe,
  Key,
  Save,
  AlertCircle,
  CheckCircle2,
  Server,
  Monitor,
  Smartphone,
} from 'lucide-react';

const SettingsPage: React.FC = () => {
  const [browserUseUrl, setBrowserUseUrl] = useState('http://localhost:8000');
  const [browserUseApiKey, setBrowserUseApiKey] = useState('');
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    // Save to localStorage
    localStorage.setItem('browserqa_browser_use_url', browserUseUrl);
    localStorage.setItem('browserqa_browser_use_api_key', browserUseApiKey);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Settings</h1>
        <p className="text-slate-400 mt-2">
          Configure your BrowserQA Studio preferences
        </p>
      </div>

      {/* Browser-Use Configuration */}
      <form onSubmit={handleSave}>
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Server className="text-blue-400" size={20} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Browser-Use Configuration</h3>
              <p className="text-slate-400 text-sm">Configure your Browser-Use API endpoint</p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Base URL */}
            <div>
              <label className="block text-slate-400 text-sm mb-2">
                Browser-Use Base URL
              </label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <input
                  type="text"
                  value={browserUseUrl}
                  onChange={(e) => setBrowserUseUrl(e.target.value)}
                  placeholder="http://localhost:8000"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg pl-10 pr-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
              <p className="text-slate-500 text-xs mt-1">
                For localhost/private URLs, use your self-hosted Browser-Use endpoint
              </p>
            </div>

            {/* API Key */}
            <div>
              <label className="block text-slate-400 text-sm mb-2">
                API Key <span className="text-slate-500">(optional)</span>
              </label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <input
                  type="password"
                  value={browserUseApiKey}
                  onChange={(e) => setBrowserUseApiKey(e.target.value)}
                  placeholder="Enter your API key"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg pl-10 pr-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
              <p className="text-slate-500 text-xs mt-1">
                Required for cloud Browser-Use, optional for self-hosted
              </p>
            </div>
          </div>

          {/* Info Box */}
          <div className="mt-6 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertCircle className="text-yellow-400 flex-shrink-0 mt-0.5" size={18} />
              <div className="text-sm">
                <p className="text-yellow-400 font-medium mb-1">Localhost Support</p>
                <p className="text-slate-400">
                  For testing localhost or private URLs, you must run Browser-Use in self-hosted mode.
                  Cloud Browser-Use cannot access private network addresses.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Default Viewports */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <Monitor className="text-purple-400" size={20} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Default Viewports</h3>
              <p className="text-slate-400 text-sm">Viewports used for testing by default</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-slate-700/50 rounded-lg">
              <div className="flex items-center gap-3 mb-2">
                <Monitor className="text-slate-400" size={18} />
                <span className="text-white font-medium">Desktop</span>
              </div>
              <p className="text-slate-400 text-sm">1440 x 900</p>
            </div>
            <div className="p-4 bg-slate-700/50 rounded-lg">
              <div className="flex items-center gap-3 mb-2">
                <Smartphone className="text-slate-400" size={18} />
                <span className="text-white font-medium">Mobile</span>
              </div>
              <p className="text-slate-400 text-sm">390 x 844</p>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex items-center justify-end gap-3">
          {saved && (
            <span className="text-green-400 text-sm flex items-center gap-1">
              <CheckCircle2 size={16} />
              Settings saved
            </span>
          )}
          <button
            type="submit"
            className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg py-2.5 px-4 transition-colors"
          >
            <Save size={18} />
            <span className="font-medium">Save Settings</span>
          </button>
        </div>
      </form>
    </div>
  );
};

export default SettingsPage;
