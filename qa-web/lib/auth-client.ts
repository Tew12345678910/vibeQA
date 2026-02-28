"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

/** React hook — mirrors the better-auth useSession() shape. */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [isPending, setIsPending] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    // Hydrate immediately from local storage
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsPending(false);
    });

    // Keep in sync with auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setIsPending(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return { session, isPending };
}

export async function signOut(): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  await supabase.auth.signOut();
}

export async function signInWithGitHub(): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      scopes: "read:user user:email",
    },
  });
}
