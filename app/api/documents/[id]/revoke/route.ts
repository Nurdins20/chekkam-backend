import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireUser, requireRole } from "@/lib/auth";
import { documentRevokeSchema } from "@/lib/validation/schemas";
import { parseBody } from "@/lib/validation/parse";
import { AuthError, toErrorResponse } from "@/lib/errors";

/**
 * POST /api/documents/:id/revoke — institution officer revokes a signed document.
 * SRS FR-046, 6.4. After this, verification returns "revoked" with the stated reason.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const profile = await requireUser(req);
    requireRole(profile, ["institution_officer", "admin", "super_admin"]);

    const body = parseBody(documentRevokeSchema, await req.json());
    const admin = getSupabaseAdmin();

    const { data: doc } = await admin
      .from("documents")
      .select("id, institution_id, status")
      .eq("id", id)
      .maybeSingle();

    if (!doc) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Document not found." } },
        { status: 404 }
      );
    }

    if (profile.role === "institution_officer") {
      const { data: membership } = await admin
        .from("institution_members")
        .select("id")
        .eq("institution_id", doc.institution_id)
        .eq("user_id", profile.id)
        .maybeSingle();
      if (!membership) {
        throw new AuthError("You are not a member of this document's institution.", 403);
      }
    }

    const { data: updated, error } = await admin
      .from("documents")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
        revocation_reason: body.reason,
      })
      .eq("id", id)
      .select("id, status, revoked_at, revocation_reason")
      .single();

    if (error) throw error;

    await admin.from("audit_logs").insert({
      actor_id: profile.id,
      action: "document.revoke",
      target_table: "documents",
      target_id: id,
      metadata: { reason: body.reason },
    });

    return NextResponse.json(updated);
  } catch (err) {
    return toErrorResponse(err);
  }
}
