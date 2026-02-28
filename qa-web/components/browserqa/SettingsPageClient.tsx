"use client";

import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Globe,
  Key,
  Monitor,
  Save,
  Server,
  Smartphone,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const URL_KEY = "browserqa_browser_use_url";
const API_KEY = "browserqa_browser_use_api_key";

export function SettingsPageClient() {
  const [browserUseUrl, setBrowserUseUrl] = useState(() => {
    if (typeof window === "undefined") return "http://localhost:8000";
    return window.localStorage.getItem(URL_KEY) ?? "http://localhost:8000";
  });
  const [browserUseApiKey, setBrowserUseApiKey] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(API_KEY) ?? "";
  });
  const [saved, setSaved] = useState(false);

  const onSave = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (typeof window === "undefined") return;

    window.localStorage.setItem(URL_KEY, browserUseUrl);
    window.localStorage.setItem(API_KEY, browserUseApiKey);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section>
        <h1 className="text-3xl font-bold text-slate-100">Settings</h1>
        <p className="mt-2 text-slate-400">Configure your BrowserQA Studio preferences</p>
      </section>

      <form onSubmit={onSave} className="space-y-6">
        <Card className="border-slate-800 bg-slate-900/70">
          <CardContent className="space-y-6 p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-2 text-blue-300">
                <Server className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-100">Browser-Use Configuration</h3>
                <p className="text-sm text-slate-400">Configure your Browser-Use API endpoint</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="browser-use-url" className="text-slate-300">Browser-Use Base URL</Label>
              <div className="relative">
                <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  id="browser-use-url"
                  value={browserUseUrl}
                  onChange={(event) => setBrowserUseUrl(event.target.value)}
                  placeholder="http://localhost:8000"
                  className="border-slate-700 bg-slate-900 pl-10 text-slate-100"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="browser-use-key" className="text-slate-300">API Key (optional)</Label>
              <div className="relative">
                <Key className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  id="browser-use-key"
                  type="password"
                  value={browserUseApiKey}
                  onChange={(event) => setBrowserUseApiKey(event.target.value)}
                  placeholder="Enter your API key"
                  className="border-slate-700 bg-slate-900 pl-10 text-slate-100"
                />
              </div>
            </div>

            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-4 w-4 text-amber-300" />
                <div className="text-sm">
                  <p className="font-medium text-amber-300">Localhost Support</p>
                  <p className="mt-1 text-slate-400">
                    These values are UI preferences only. Server-side API settings still come from environment variables.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/70">
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg border border-purple-500/30 bg-purple-500/10 p-2 text-purple-300">
                <Monitor className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-100">Default Viewports</h3>
                <p className="text-sm text-slate-400">Viewports used for testing by default</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-slate-800 bg-slate-800/30 p-3">
                <div className="mb-1 flex items-center gap-2 text-slate-300">
                  <Monitor className="h-4 w-4" /> Desktop
                </div>
                <p className="text-sm text-slate-500">1440 x 900</p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-800/30 p-3">
                <div className="mb-1 flex items-center gap-2 text-slate-300">
                  <Smartphone className="h-4 w-4" /> Mobile
                </div>
                <p className="text-sm text-slate-500">390 x 844</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-3">
          {saved ? (
            <span className="inline-flex items-center gap-1 text-sm text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
              Settings saved
            </span>
          ) : null}

          <Button type="submit" className="bg-blue-500 text-slate-950 hover:bg-blue-400">
            <Save className="mr-2 h-4 w-4" />
            Save Settings
          </Button>
        </div>
      </form>
    </div>
  );
}
