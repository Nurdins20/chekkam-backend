import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { channelIdentityVerifySchema } from "@/lib/validation/schemas";
import { parseBody } from "@/lib/validation/parse";
import { jsonError, toErrorResponse } from "@/lib/errors";

/**
 * POST /api/channel-identities/verify — confirm the 6-digit code sent to a
 * WhatsApp/Telegram identity (Phase 2 spec P2-02). No session required: the
 * code itself, sent only to that channel, is the proof of possession.
 */
export async function POST(req: NextRequest) {
  try {
    const body = parseBody(channelIdentityVerifySchema, await req.json());
    const admin = getSupabaseAdmin();

    const { data: identity } = await admin
      .from("channel_identities")
      .select("id, verify_code, verified")
      .eq("channel", body.channel)
      .eq("external_id", body.external_id)
      .maybeSingle();

    if (!identity) {
      return jsonError("NOT_FOUND", "No pending link request for this channel/identity.", 404);
    }
    if (identity.verified) {
      return NextResponse.json({ verified: true, already_verified: true });
    }
    if (identity.verify_code !== body.code) {
      return jsonError("INVALID_CODE", "That code doesn't match. Double-check and try again.", 400);
    }

    const { error } = await admin
      .from("channel_identities")
      .update({ verified: true, verify_code: null })
      .eq("id", identity.id);
    if (error) throw error;

    await admin.from("audit_logs").insert({
      actor_type: "user",
      action: "channel_identity.verified",
      target_table: "channel_identities",
      target_id: identity.id,
      metadata: { channel: body.channel },
    });

    return NextResponse.json({ verified: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
