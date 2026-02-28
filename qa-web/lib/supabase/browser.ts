"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _browserClient: SupabaseClient | null = null;

/**
 * Returns a singleton Supabase browser client that handles GitHub OAuth and session management.
 * Uses the public anon key — safe to call from client components.
 */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (_browserClient) return _browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!anonKey)
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY) is not set",
    );

  _browserClient = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return _browserClient;
}
