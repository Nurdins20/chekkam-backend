import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireUser, requireRole } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";
import { sendPushToTokens } from "@/lib/push/fcm";

/**
 * POST /api/safety-alerts/:id/approve — analyst approval gate (FR-072).
 *
 * KNOWN LIMITATION (tracked for Phase 2): true proximity targeting needs a
 * per-device approximate area/geohash on device_tokens, which the schema
 * deliberately keeps coarse (device_tokens.last_known_area, "never exact
 * coordinates at rest" — SRS 5.12). Until that area-tagging pipeline exists,
 * this sends to all opted-in device tokens rather than a true radius filter.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const profile = await requireUser(req);
    requireRole(profile, ["analyst", "admin", "super_admin"]);

    const admin = getSupabaseAdmin();
    const { data: alert, error } = await admin
      .from("safety_alerts")
      .update({ status: "approved", analyst_id: profile.id, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;

    await admin.from("audit_logs").insert({
      actor_id: profile.id,
      action: "safety_alert.approve",
      target_table: "safety_alerts",
      target_id: id,
    });

    const { data: tokens } = await admin
      .from("device_tokens")
      .select("fcm_token")
      .eq("consent_given", true);

    let pushResult = { sent: 0, configured: false };
    if (tokens?.length) {
      pushResult = await sendPushToTokens(
        tokens.map((t) => t.fcm_token),
        "Community safety alert nearby",
        `${alert.category.replace(/_/g, " ")}: ${alert.description}. This is a community information channel — contact official emergency numbers for immediate danger.`
      );
    }

    return NextResponse.json({ ...alert, push: pushResult });
  } catch (err) {
    return toErrorResponse(err);
  }
}
