#!/usr/bin/env node
// One-command demo setup (Phase 2 spec §8.1). Idempotent — safe to re-run;
// re-running skips anything that already exists rather than duplicating it.
//
// Seeds:
//   - one active institution ("Lycée Bilingue de Yaoundé") with a generated
//     ECDSA signing key (the private key is printed ONCE, on first creation —
//     matching the same "shown only once" rule as the real /api/institutions route)
//   - one super_admin login + one institution_officer login
//   - one verified channel_identities row (WhatsApp + Telegram) for the demo sender
//   - the sample fake-scholarship public_alerts row (SRS Appendix), published
//   - one partner/extension API key
//
// Usage: node scripts/seed-demo.mjs
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { loadEnv, requireEnv } from "./lib/load-env.mjs";

loadEnv();
requireEnv(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const ADMIN_EMAIL = "admin@chekkam.demo";
const OFFICER_EMAIL = "officer@chekkam.demo";
const DEMO_PASSWORD = "ChekkamDemo123!";
const INSTITUTION_NAME = "Lycée Bilingue de Yaoundé";
const DEMO_WHATSAPP_NUMBER = process.env.DEMO_WHATSAPP_NUMBER || "237600000001";
const DEMO_TELEGRAM_ID = process.env.DEMO_TELEGRAM_ID || "000000001";
const PARTNER_ORG_NAME = "Chekkam Demo Partner";

const log = (...args) => console.log("→", ...args);
const section = (title) => console.log(`\n=== ${title} ===`);

/** Mirrors lib/crypto/sign.ts's generateSigningKeyPair() — this script runs
 * outside the Next.js TS build, so the tiny keygen call is duplicated here
 * rather than imported; it is NOT a second signing/verification engine. */
function generateSigningKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { publicKey, privateKey };
}

function envVarNameFor(institutionId) {
  return `DOCUMENT_SIGNING_KEY_${institutionId.replace(/-/g, "_").toUpperCase()}`;
}

async function getOrCreateAuthUser(email, password) {
  const { data: created, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (!error) {
    log(`Created auth user ${email}`);
    return created.user;
  }

  const { data: list, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw new Error(`Could not create or find user ${email}: ${error.message}`);
  const existing = list.users.find((u) => u.email === email);
  if (!existing) throw new Error(`Could not create or find user ${email}: ${error.message}`);
  log(`Auth user ${email} already exists`);
  return existing;
}

async function upsertProfile(userId, role, displayName) {
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: userId, role, display_name: displayName }, { onConflict: "id" });
  if (error) throw error;
}

async function ensureInstitution() {
  const { data: existing } = await supabase
    .from("institutions")
    .select("id, name")
    .eq("name", INSTITUTION_NAME)
    .maybeSingle();

  if (existing) {
    log(`Institution "${INSTITUTION_NAME}" already exists (id: ${existing.id})`);
    log(`Signing key env var (if you don't already have it set): ${envVarNameFor(existing.id)}`);
    return { id: existing.id, envLine: null };
  }

  const { publicKey, privateKey } = generateSigningKeyPair();
  const { data: inserted, error } = await supabase
    .from("institutions")
    .insert({
      name: INSTITUTION_NAME,
      type: "school",
      verified: true,
      status: "active",
      signing_public_key: publicKey,
      contact_email: "admin@example.cm",
    })
    .select("id")
    .single();
  if (error) throw error;

  const envVarName = envVarNameFor(inserted.id);
  await supabase.from("institutions").update({ signing_key_ref: envVarName }).eq("id", inserted.id);

  log(`Created institution "${INSTITUTION_NAME}" (id: ${inserted.id})`);
  const oneLine = privateKey.replace(/\n/g, "\\n");
  return { id: inserted.id, envLine: `${envVarName}=${oneLine}` };
}

async function ensureInstitutionMember(institutionId, userId) {
  const { error } = await supabase
    .from("institution_members")
    .upsert(
      { institution_id: institutionId, user_id: userId, role: "officer" },
      { onConflict: "institution_id,user_id" }
    );
  if (error) throw error;
}

async function ensureChannelIdentity(channel, externalId, profileId, institutionId) {
  const { error } = await supabase.from("channel_identities").upsert(
    {
      channel,
      external_id: externalId,
      profile_id: profileId,
      institution_id: institutionId,
      verified: true,
      verify_code: null,
    },
    { onConflict: "channel,external_id" }
  );
  if (error) throw error;
  log(`Verified ${channel} identity ${externalId} -> officer (can sign for this institution)`);
}

async function ensureSampleAlert(createdBy) {
  const title = "Fake scholarship offer circulating on WhatsApp";
  const { data: existing } = await supabase
    .from("public_alerts")
    .select("id")
    .eq("title", title)
    .maybeSingle();
  if (existing) {
    log(`Sample public alert already exists (id: ${existing.id})`);
    return existing.id;
  }

  const { data, error } = await supabase
    .from("public_alerts")
    .insert({
      title,
      body:
        "A message claiming to offer a government scholarship requiring an upfront " +
        "\"processing fee\" is circulating. This is not a legitimate government process. " +
        "Do not send payment.",
      alert_type: "scam_campaign",
      severity: "warning",
      published: true,
      published_at: new Date().toISOString(),
      created_by: createdBy,
    })
    .select("id")
    .single();
  if (error) throw error;
  log(`Created and published sample alert (id: ${data.id})`);
  return data.id;
}

async function ensurePartnerApiKey() {
  const { data: existing } = await supabase
    .from("api_keys")
    .select("id, key_prefix")
    .eq("organization_name", PARTNER_ORG_NAME)
    .maybeSingle();
  if (existing) {
    log(`Partner API key already exists (prefix: ${existing.key_prefix}) — not reprinting the secret.`);
    return null;
  }

  const plainKey = `chk_live_${crypto.randomBytes(24).toString("hex")}`;
  const keyHash = crypto.createHash("sha256").update(plainKey).digest("hex");
  const keyPrefix = plainKey.slice(0, 12);

  const { error } = await supabase.from("api_keys").insert({
    organization_name: PARTNER_ORG_NAME,
    key_hash: keyHash,
    key_prefix: keyPrefix,
  });
  if (error) throw error;
  log(`Created partner API key (prefix: ${keyPrefix})`);
  return plainKey;
}

async function main() {
  section("Auth users");
  const admin = await getOrCreateAuthUser(ADMIN_EMAIL, DEMO_PASSWORD);
  const officer = await getOrCreateAuthUser(OFFICER_EMAIL, DEMO_PASSWORD);
  await upsertProfile(admin.id, "super_admin", "Chekkam Demo Admin");
  await upsertProfile(officer.id, "institution_officer", "Chekkam Demo Officer");

  section("Institution");
  const { id: institutionId, envLine } = await ensureInstitution();
  await ensureInstitutionMember(institutionId, officer.id);

  section("Channel identities (enables SIGN over chat)");
  await ensureChannelIdentity("whatsapp", DEMO_WHATSAPP_NUMBER, officer.id, institutionId);
  await ensureChannelIdentity("telegram", DEMO_TELEGRAM_ID, officer.id, institutionId);

  section("Sample public alert");
  await ensureSampleAlert(admin.id);

  section("Partner/extension API key");
  const partnerKey = await ensurePartnerApiKey();

  section("Done — demo setup summary");
  console.log(`
Logins (web dashboard /login):
  Super admin:         ${ADMIN_EMAIL} / ${DEMO_PASSWORD}
  Institution officer: ${OFFICER_EMAIL} / ${DEMO_PASSWORD}

Institution: "${INSTITUTION_NAME}" (id: ${institutionId})
${envLine ? `  Add this to .env.local, then restart the dev server:\n  ${envLine}` : "  (signing key was generated on a previous run — reuse the env var you saved then)"}

Demo channel identities (edit DEMO_WHATSAPP_NUMBER / DEMO_TELEGRAM_ID env vars
and re-run this script to match your real test phone/Telegram account):
  WhatsApp: ${DEMO_WHATSAPP_NUMBER}
  Telegram: ${DEMO_TELEGRAM_ID}

Sample public alert: published and visible at /api/public-alerts, the web
alert page, and the Flutter app's public alerts screen.

Partner/extension API key: ${partnerKey ? `${partnerKey}\n  (store this now, it will not be shown again)` : "already issued on a previous run"}
`);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
