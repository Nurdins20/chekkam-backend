import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireUser, requireRole } from "@/lib/auth";
import { publicAlertUpdateSchema } from "@/lib/validation/schemas";
import { parseBody } from "@/lib/validation/parse";
import { jsonError, toErrorResponse } from "@/lib/errors";

/** GET /api/public-alerts/:id — analyst/admin fetch, including unpublished drafts. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const profile = await requireUser(req);
    requireRole(profile, ["analyst", "admin", "super_admin"]);

    const admin = getSupabaseAdmin();
    const { data, error } = await admin.from("public_alerts").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return jsonError("NOT_FOUND", "Public alert not found.", 404);

    return NextResponse.json(data);
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * PATCH /api/public-alerts/:id — analyst edits a draft (title/body/type/severity)
 * before publishing it (Phase 2 spec §7.3). Does not publish — that's the
 * separate, deliberate POST /api/public-alerts/:id/publish step.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const profile = await requireUser(req);
    requireRole(profile, ["analyst", "admin", "super_admin"]);

    const body = parseBody(publicAlertUpdateSchema, await req.json());
    const admin = getSupabaseAdmin();

    const { data, error } = await admin
      .from("public_alerts")
      .update(body)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) return jsonError("NOT_FOUND", "Public alert not found.", 404);

    await admin.from("audit_logs").insert({
      actor_id: profile.id,
      action: "public_alert.edit",
      target_table: "public_alerts",
      target_id: id,
      metadata: { fields: Object.keys(body) },
    });

    return NextResponse.json(data);
  } catch (err) {
    return toErrorResponse(err);
  }
}
