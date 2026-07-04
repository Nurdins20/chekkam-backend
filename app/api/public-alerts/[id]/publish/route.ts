import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireUser, requireRole } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";

/**
 * POST /api/public-alerts/:id/publish — the human-approval gate before an
 * alert becomes visible to the public (SRS Section 14 "nothing is published
 * ... without human analyst approval").
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
    const { data, error } = await admin
      .from("public_alerts")
      .update({ published: true, published_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;

    await admin.from("audit_logs").insert({
      actor_id: profile.id,
      action: "public_alert.publish",
      target_table: "public_alerts",
      target_id: id,
    });

    return NextResponse.json(data);
  } catch (err) {
    return toErrorResponse(err);
  }
}
