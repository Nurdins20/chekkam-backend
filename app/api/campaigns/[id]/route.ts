import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireUser, requireRole } from "@/lib/auth";
import { campaignUpdateSchema } from "@/lib/validation/schemas";
import { parseBody } from "@/lib/validation/parse";
import { toErrorResponse, jsonError } from "@/lib/errors";

/** GET /api/campaigns/:id — campaign detail with its linked reports (SRS 6.2). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const admin = getSupabaseAdmin();

    const { data: campaign, error } = await admin
      .from("campaigns")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!campaign) return jsonError("NOT_FOUND", "Campaign not found.", 404);

    const { data: reports } = await admin
      .from("reports")
      .select("id, content_type, raw_content, risk_level, status, created_at")
      .eq("campaign_id", id)
      .order("created_at", { ascending: false });

    return NextResponse.json({ ...campaign, reports: reports ?? [] });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** PATCH /api/campaigns/:id — analyst confirm/merge/split/dismiss (SRS FR-032, 6.2). */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const profile = await requireUser(req);
    requireRole(profile, ["analyst", "admin", "super_admin"]);

    const body = parseBody(campaignUpdateSchema, await req.json());
    const admin = getSupabaseAdmin();

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.action === "confirm") update.status = "confirmed";
    if (body.action === "dismiss") update.status = "dismissed";
    if (body.action === "split") update.status = "open";
    if (body.action === "merge") {
      if (!body.merged_into) {
        return jsonError("VALIDATION_ERROR", "merged_into is required for a merge action.", 400, "merged_into");
      }
      update.status = "merged";
      update.merged_into = body.merged_into;
    }

    const { data, error } = await admin
      .from("campaigns")
      .update(update)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;

    await admin.from("audit_logs").insert({
      actor_id: profile.id,
      action: `campaign.${body.action}`,
      target_table: "campaigns",
      target_id: id,
    });

    return NextResponse.json(data);
  } catch (err) {
    return toErrorResponse(err);
  }
}
