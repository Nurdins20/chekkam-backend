import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireUser, requireRole } from "@/lib/auth";
import { channelIdentityCreateSchema } from "@/lib/validation/schemas";
import { parseBody } from "@/lib/validation/parse";
import { toErrorResponse } from "@/lib/errors";
import { sendVerificationCode } from "@/lib/channels/send";

function generateSixDigitCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/**
 * POST /api/channel-identities — an officer links their own WhatsApp/Telegram
 * identity so they can sign documents over chat (Phase 2 spec P2-02).
 * Creates an unverified row and sends a 6-digit code through that channel;
 * confirm with POST /api/channel-identities/verify.
 */
export async function POST(req: NextRequest) {
  try {
    const profile = await requireUser(req);
    requireRole(profile, ["institution_officer", "admin", "super_admin"]);

    const body = parseBody(channelIdentityCreateSchema, await req.json());
    const admin = getSupabaseAdmin();

    // Auto-derive institution_id from the caller's own membership, if any —
    // this endpoint always links the CALLER's own identity, never someone else's.
    const { data: membership } = await admin
      .from("institution_members")
      .select("institution_id")
      .eq("user_id", profile.id)
      .maybeSingle();

    const code = generateSixDigitCode();

    const { data, error } = await admin
      .from("channel_identities")
      .upsert(
        {
          profile_id: profile.id,
          institution_id: membership?.institution_id ?? null,
          channel: body.channel,
          external_id: body.external_id,
          verified: false,
          verify_code: code,
        },
        { onConflict: "channel,external_id" }
      )
      .select("id, channel, external_id, verified")
      .single();

    if (error) throw error;

    const sendResult = await sendVerificationCode(body.channel, body.external_id, code);
    if (!sendResult.sent) {
      // Dev/testing convenience only — never returned in the API response.
      console.log(
        `[channel-identities] ${body.channel} not configured; verification code for ` +
          `${body.external_id} is ${code} (use this to test /verify manually).`
      );
    }

    await admin.from("audit_logs").insert({
      actor_id: profile.id,
      action: "channel_identity.link_requested",
      target_table: "channel_identities",
      target_id: data.id,
      metadata: { channel: body.channel, code_sent: sendResult.sent },
    });

    return NextResponse.json(
      {
        id: data.id,
        channel: data.channel,
        verified: data.verified,
        code_sent: sendResult.sent,
        code_send_note: sendResult.sent
          ? "A confirmation code was sent through that channel."
          : `Could not send the code automatically (${sendResult.reason}). ` +
            "Check server logs for the code in development, or configure the channel's credentials.",
      },
      { status: 201 }
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
