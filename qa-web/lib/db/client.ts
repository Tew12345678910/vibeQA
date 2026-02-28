import { createClient, type SupabaseClient } from "@supabase/supabase-js";

declare global {
  var __qaSupabaseAdmin: SupabaseClient | undefined;
}

function requireSupabaseEnv(): { url: string; serviceRoleKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is required");
  }

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) is required for server DB access",
    );
  }

  return { url, serviceRoleKey };
}

export function getDbClient(): SupabaseClient {
  if (globalThis.__qaSupabaseAdmin) {
    return globalThis.__qaSupabaseAdmin;
  }

  const { url, serviceRoleKey } = requireSupabaseEnv();

  globalThis.__qaSupabaseAdmin = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return globalThis.__qaSupabaseAdmin;
}
