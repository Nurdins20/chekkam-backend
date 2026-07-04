import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireUser, requireRole } from "@/lib/auth";
import { apiKeyIssueSchema } from "@/lib/validation/schemas";
import { parseBody } from "@/lib/validation/parse";
import { toErrorResponse } from "@/lib/errors";
import { generateApiKey } from "@/lib/partner-auth";

/**
 * POST /api/admin/api-keys — admin issues a partner/extension API key (P2-01).
 * Closes the gap where generateApiKey() existed but nothing inserted a row.
 * Admin-issued only — no self-serve signup (Phase 2 spec §1.2 eligibility guardrail).
 * Returns the plaintext key exactly once; only key_hash/key_prefix are stored.
 */
export async function POST(req: NextRequest) {
  try {
    const profile = await requireUser(req);
    requireRole(profile, ["admin", "super_admin"]);

    const body = parseBody(apiKeyIssueSchema, await req.json());
    const admin = getSupabaseAdmin();
    const { plainKey, keyHash, keyPrefix } = generateApiKey();

    const { data, error } = await admin
      .from("api_keys")
      .insert({
        organization_name: body.organization_name,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        scopes: body.scopes,
        rate_limit_per_minute: body.rate_limit_per_minute ?? 60,
      })
      .select("id, organization_name, key_prefix, scopes, rate_limit_per_minute, status, created_at")
      .single();

    if (error) throw error;

    await admin.from("audit_logs").insert({
      actor_id: profile.id,
      action: "api_key.issue",
      target_table: "api_keys",
      target_id: data.id,
      metadata: { organization_name: body.organization_name },
    });

    return NextResponse.json(
      {
        ...data,
        api_key: plainKey,
        setup_note: "This is the only time the plaintext key is returned. Store it now.",
      },
      { status: 201 }
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** GET /api/admin/api-keys — admin list (no key material returned). */
export async function GET(req: NextRequest) {
  try {
    const profile = await requireUser(req);
    requireRole(profile, ["admin", "super_admin"]);

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("api_keys")
      .select("id, organization_name, key_prefix, scopes, rate_limit_per_minute, status, created_at, revoked_at")
      .order("created_at", { ascending: false });
    if (error) throw error;

    return NextResponse.json({ api_keys: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}
