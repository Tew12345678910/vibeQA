"use client";

import { useCallback, useEffect, useState } from "react";
import { GitBranch, Github, Lock, Search, Unlock } from "lucide-react";

import type { GitHubRepoItem } from "@/app/api/github/repos/route";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  /** Called when the user selects a repo. */
  onSelect: (repo: GitHubRepoItem) => void;
  /** If provided, the picker highlights this repo as selected. */
  selectedFullName?: string;
  /** Force a refresh (e.g. after GitHub connects). */
  triggerRefresh?: number;
}

type Status = "idle" | "loading" | "ready" | "error" | "no-token";

export function GitHubRepoPicker({ onSelect, selectedFullName, triggerRefresh }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [repos, setRepos] = useState<GitHubRepoItem[]>([]);
  const [query, setQuery] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [connecting, setConnecting] = useState(false);

  const load = useCallback(async () => {
    const token = sessionStorage.getItem("github_provider_token");
    if (!token) {
      setStatus("no-token");
      return;
    }

    setStatus("loading");
    try {
      const res = await fetch("/api/github/repos", {
        headers: { "x-github-token": token },
      });
      const json = (await res.json()) as { data?: GitHubRepoItem[]; error?: string };
      if (!res.ok || !json.data) {
        throw new Error(json.error ?? "Failed to fetch repos");
      }
      setRepos(json.data);
      setStatus("ready");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Unknown error");
      setStatus("error");
    }
  }, []);

  // Load on mount and whenever triggerRefresh changes
  useEffect(() => {
    void load();
  }, [load, triggerRefresh]);

  async function connectGitHub() {
    setConnecting(true);
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signInWithOAuth({
        provider: "github",
        options: {
          redirectTo: `${window.location.origin}/auth/github-callback`,
          scopes: "read:user user:email repo",
        },
      });
    } catch {
      setConnecting(false);
    }
  }

  const filtered = repos.filter(
    (r) =>
      r.fullName.toLowerCase().includes(query.toLowerCase()) ||
      (r.description ?? "").toLowerCase().includes(query.toLowerCase()),
  );

  // ── States ────────────────────────────────────────────────────────────────

  if (status === "idle" || status === "loading") {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-slate-400">
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-600 border-t-blue-400" />
        Loading your repositories…
      </div>
    );
  }

  if (status === "no-token") {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-6 text-center">
        <Github className="mx-auto mb-3 h-8 w-8 text-slate-400" />
        <p className="mb-1 text-sm font-medium text-slate-200">Connect your GitHub account</p>
        <p className="mb-4 text-xs text-slate-400">
          Authorize the app once to browse and select your repositories.
        </p>
        <Button
          onClick={() => void connectGitHub()}
          disabled={connecting}
          className="bg-slate-100 text-slate-950 hover:bg-white"
        >
          <Github className="mr-2 h-4 w-4" />
          {connecting ? "Redirecting…" : "Connect GitHub"}
        </Button>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-4 text-sm text-red-300">
        {errorMsg}{" "}
        <button
          className="underline hover:text-red-100"
          onClick={() => void load()}
        >
          Retry
        </button>
      </div>
    );
  }

  // ── Ready ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <Input
          placeholder="Search repositories…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-8"
        />
      </div>

      <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900/60">
        {filtered.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-400">No repositories found.</p>
        ) : (
          <ul>
            {filtered.map((repo) => {
              const isSelected = repo.fullName === selectedFullName;
              return (
                <li key={repo.fullName}>
                  <button
                    type="button"
                    onClick={() => onSelect(repo)}
                    className={[
                      "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors",
                      "hover:bg-slate-800/60",
                      isSelected ? "bg-blue-500/10 ring-1 ring-inset ring-blue-500/40" : "",
                    ].join(" ")}
                  >
                    {/* Lock / Unlock */}
                    <span className="mt-0.5 shrink-0 text-slate-500">
                      {repo.isPrivate ? (
                        <Lock className="h-3.5 w-3.5" />
                      ) : (
                        <Unlock className="h-3.5 w-3.5" />
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-slate-100">
                          {repo.fullName}
                        </span>
                        {repo.isPrivate && (
                          <span className="shrink-0 rounded border border-slate-600 px-1 py-0.5 text-[10px] text-slate-400">
                            private
                          </span>
                        )}
                      </div>
                      {repo.description && (
                        <p className="mt-0.5 truncate text-xs text-slate-400">{repo.description}</p>
                      )}
                      <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-500">
                        {repo.language && <span>{repo.language}</span>}
                        <span className="flex items-center gap-1">
                          <GitBranch className="h-3 w-3" />
                          {repo.defaultBranch}
                        </span>
                      </div>
                    </div>

                    {isSelected && (
                      <span className="mt-1 shrink-0 text-xs font-medium text-blue-400">
                        Selected
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-right text-xs text-slate-500">
        {filtered.length} of {repos.length} repositories
      </p>
    </div>
  );
}
