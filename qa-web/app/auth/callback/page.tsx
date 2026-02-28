"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Landing page for the Supabase GitHub OAuth PKCE callback.
 * The browser Supabase client (detectSessionInUrl: true) exchanges the code
 * automatically once it is initialised on this page.
 */
export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    // The onAuthStateChange fires once the code has been exchanged
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        subscription.unsubscribe();
        router.replace("/profile");
      } else if (event === "SIGNED_OUT" || !session) {
        subscription.unsubscribe();
        router.replace("/login?error=auth_failed");
      }
    });

    // Fallback: if already signed in just redirect
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        subscription.unsubscribe();
        router.replace("/profile");
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950">
      <p className="text-sm text-slate-400">Completing sign-in…</p>
    </div>
  );
}
