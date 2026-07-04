import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth";
import { pushRegisterSchema } from "@/lib/validation/schemas";
import { parseBody } from "@/lib/validation/parse";
import { toErrorResponse } from "@/lib/errors";

/**
 * POST /api/push/register-token — mobile app registers an FCM device token
 * after the user explicitly opts into notifications (FR-050, SRS Section 7:
 * never pre-checked or silent).
 */
export async function POST(req: NextRequest) {
  try {
    const profile = await requireUser(req);
    const body = parseBody(pushRegisterSchema, await req.json());
    const admin = getSupabaseAdmin();

    const { data, error } = await admin
      .from("device_tokens")
      .upsert(
        { user_id: profile.id, fcm_token: body.fcm_token, platform: body.platform, consent_given: true },
        { onConflict: "user_id,fcm_token" }
      )
      .select("id")
      .single();
    if (error) throw error;

    return NextResponse.json({ id: data.id, status: "registered" }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
