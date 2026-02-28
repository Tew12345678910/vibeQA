import type { User } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";

/**
 * Returns the authenticated Supabase user from a bearer token.
 * Suitable for server-side API route guards.
 */
export async function getUserFromToken(
  accessToken: string,
): Promise<User | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) return null;

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return data.user;
}
