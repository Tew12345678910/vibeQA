"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Handles GitHub OAuth callback and redirects to /projects/new.
 */
function GitHubCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const code = searchParams.get("code");
    const errorParam = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    if (errorParam) {
      const message = encodeURIComponent(errorDescription ?? errorParam);
      router.replace(`/projects/new?github_error=${message}`);
      return;
    }

    if (!code) {
      void supabase.auth.getSession().then(({ data: { session }, error }) => {
        if (error || !session) {
          router.replace("/projects/new?github_error=no_session");
          return;
        }
        if (session.provider_token) {
          sessionStorage.setItem(
            "github_provider_token",
            session.provider_token,
          );
        }
        router.replace("/projects/new?github_connected=true");
      });
      return;
    }

    void supabase.auth
      .exchangeCodeForSession(code)
      .then(({ data: { session }, error }) => {
        if (error || !session) {
          const message = encodeURIComponent(
            error?.message ?? "code_exchange_failed",
          );
          router.replace(`/projects/new?github_error=${message}`);
          return;
        }

        if (session.provider_token) {
          sessionStorage.setItem(
            "github_provider_token",
            session.provider_token,
          );
        }

        router.replace("/projects/new?github_connected=true");
      });
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950">
      <p className="text-sm text-slate-300">
        Connecting your GitHub account...
      </p>
    </div>
  );
}

export default function GitHubCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-950">
          <p className="text-sm text-slate-300">
            Connecting your GitHub account...
          </p>
        </div>
      }
    >
      <GitHubCallbackInner />
    </Suspense>
  );
}
