import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { AuthError } from "@/lib/errors";

export type ApiKeyRecord = {
  id: string;
  organization_name: string;
  scopes: string[];
  rate_limit_per_minute: number;
};

function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

/** Validates the X-Api-Key header against api_keys and enforces its per-minute rate limit. FR-060-062. */
export async function requireApiKey(req: Request): Promise<ApiKeyRecord> {
  const header = req.headers.get("x-api-key");
  if (!header) throw new AuthError("Missing X-Api-Key header.", 401);

  const admin = getSupabaseAdmin();
  const keyHash = hashKey(header);
  const { data, error } = await admin
    .from("api_keys")
    .select("id, organization_name, scopes, rate_limit_per_minute, status")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (error || !data || data.status !== "active") {
    throw new AuthError("Invalid or revoked API key.", 401);
  }

  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
  const { count } = await admin
    .from("api_usage_logs")
    .select("id", { count: "exact", head: true })
    .eq("api_key_id", data.id)
    .gte("created_at", oneMinuteAgo);

  if ((count ?? 0) >= data.rate_limit_per_minute) {
    throw new AuthError("Rate limit exceeded for this API key.", 403);
  }

  return data;
}

/** Logs one partner API call for usage/billing visibility (FR-062). */
export async function logApiUsage(
  apiKeyId: string,
  endpoint: string,
  statusCode: number,
  responseTimeMs: number
) {
  const admin = getSupabaseAdmin();
  await admin.from("api_usage_logs").insert({
    api_key_id: apiKeyId,
    endpoint,
    status_code: statusCode,
    response_time_ms: responseTimeMs,
  });
}

/** Generates a new partner API key; only key_hash/key_prefix are ever persisted. */
export function generateApiKey(): { plainKey: string; keyHash: string; keyPrefix: string } {
  const plainKey = `chk_live_${crypto.randomBytes(24).toString("hex")}`;
  return { plainKey, keyHash: hashKey(plainKey), keyPrefix: plainKey.slice(0, 12) };
}
