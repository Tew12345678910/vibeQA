"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Returns `{ Authorization: "Bearer <access_token>" }` for the current session,
 * or an empty object if there is no active session.
 * Use this to authenticate requests to Next.js API routes from client components.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

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
