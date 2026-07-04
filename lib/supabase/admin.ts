import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { ConfigError } from "@/lib/errors";

let cached: SupabaseClient | null = null;

/**
 * Service-role Supabase client. Bypasses Row Level Security entirely, so it
 * must only ever be used from server-side code (API routes), never sent to
 * a client. See SRS 14: SUPABASE_SERVICE_ROLE_KEY is backend-only.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new ConfigError(
      "Supabase is not configured yet. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local (see docs/ENVIRONMENT.md)."
    );
  }

  cached = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
