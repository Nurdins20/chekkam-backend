#!/usr/bin/env node
// CLI fallback for POST /api/admin/api-keys — issues a partner/extension API
// key without needing the dashboard UI (Phase 2 spec P2-01).
// Usage: node scripts/issue-api-key.mjs <organization_name> [rate_limit_per_minute]
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { loadEnv, requireEnv } from "./lib/load-env.mjs";

loadEnv();
requireEnv(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);

const organizationName = process.argv[2];
const rateLimit = process.argv[3] ? Number(process.argv[3]) : 60;

if (!organizationName) {
  console.error("Usage: node scripts/issue-api-key.mjs <organization_name> [rate_limit_per_minute]");
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

function generateApiKey() {
  const plainKey = `chk_live_${crypto.randomBytes(24).toString("hex")}`;
  const keyHash = crypto.createHash("sha256").update(plainKey).digest("hex");
  const keyPrefix = plainKey.slice(0, 12);
  return { plainKey, keyHash, keyPrefix };
}

const { plainKey, keyHash, keyPrefix } = generateApiKey();

const { data, error } = await supabase
  .from("api_keys")
  .insert({
    organization_name: organizationName,
    key_hash: keyHash,
    key_prefix: keyPrefix,
    rate_limit_per_minute: rateLimit,
  })
  .select("id")
  .single();

if (error) {
  console.error("Failed to insert API key:", error.message);
  process.exit(1);
}

await supabase.from("audit_logs").insert({
  actor_type: "system",
  action: "api_key.issue",
  target_table: "api_keys",
  target_id: data.id,
  metadata: { organization_name: organizationName, via: "issue-api-key.mjs" },
});

console.log(`API key issued for "${organizationName}" (id: ${data.id})`);
console.log("Plaintext key — store this now, it will not be shown again:\n");
console.log(plainKey);
console.log(`\nKey prefix (safe to log): ${keyPrefix}`);
