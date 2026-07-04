import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireUser, requireRole } from "@/lib/auth";
import { jsonError, toErrorResponse } from "@/lib/errors";

/** POST /api/admin/api-keys/:id/revoke — admin revokes a partner/extension key (P2-01). */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const profile = await requireUser(req);
    requireRole(profile, ["admin", "super_admin"]);

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("api_keys")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("id", id)
      .select("id, organization_name, status, revoked_at")
      .maybeSingle();

    if (error) throw error;
    if (!data) return jsonError("NOT_FOUND", "API key not found.", 404);

    await admin.from("audit_logs").insert({
      actor_id: profile.id,
      action: "api_key.revoke",
      target_table: "api_keys",
      target_id: id,
    });

    return NextResponse.json(data);
  } catch (err) {
    return toErrorResponse(err);
  }
}
