import { createClient } from "@supabase/supabase-js";
import { ConfigError } from "@/lib/errors";

/**
 * Anon-key Supabase client that respects Row Level Security. Pass the
 * caller's access token (from the Authorization header) to act as that user;
 * omit it for anonymous/public reads (e.g. published public_alerts).
 */
export function getSupabaseAnon(accessToken?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new ConfigError(
      "Supabase is not configured yet. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local (see docs/ENVIRONMENT.md)."
    );
  }

  return createClient(url, anonKey, {
    auth: { persistSession: false },
    global: accessToken
      ? { headers: { Authorization: `Bearer ${accessToken}` } }
      : undefined,
  });
}

/** Reads a bearer token from a Next.js Request's Authorization header, if present. */
export function bearerTokenFrom(req: Request): string | undefined {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return undefined;
  return header.slice("Bearer ".length).trim() || undefined;
}
