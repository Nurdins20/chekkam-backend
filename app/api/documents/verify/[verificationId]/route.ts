import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { toErrorResponse } from "@/lib/errors";

type VerifierChannel = "mobile" | "web" | "api";

async function logAttempt(
  documentId: string | null,
  attempted: string,
  result: "genuine" | "revoked" | "not_found",
  channel: VerifierChannel
) {
  const admin = getSupabaseAdmin();
  await admin.from("document_verification_logs").insert({
    document_id: documentId,
    verification_id_attempted: attempted,
    result,
    verifier_channel: channel,
  });
}

/**
 * GET /api/documents/verify/:verificationId — look up by verification ID or PIN.
 * SRS 6.4, 10.2 steps 1-3 (no file provided, so no hash comparison here).
 * ?channel=mobile|web|api tags the verification log entry.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ verificationId: string }> }
) {
  try {
    const { verificationId } = await params;
    const channel = (req.nextUrl.searchParams.get("channel") as VerifierChannel) || "web";
    const admin = getSupabaseAdmin();

    const { data: doc } = await admin
      .from("documents")
      .select(
        "id, document_type, recipient_name, status, issued_at, revoked_at, revocation_reason, institutions(name)"
      )
      .or(`verification_id.eq.${verificationId},pin_code.eq.${verificationId}`)
      .maybeSingle();

    if (!doc) {
      await logAttempt(null, verificationId, "not_found", channel);
      return NextResponse.json({ status: "not_found", verification_id: verificationId });
    }

    const institution = Array.isArray(doc.institutions)
      ? doc.institutions[0]
      : doc.institutions;

    if (doc.status === "revoked") {
      await logAttempt(doc.id, verificationId, "revoked", channel);
      return NextResponse.json({
        status: "revoked",
        institution: institution?.name ?? null,
        document_type: doc.document_type,
        verification_id: verificationId,
        revoked_at: doc.revoked_at,
        reason: doc.revocation_reason,
      });
    }

    await logAttempt(doc.id, verificationId, "genuine", channel);
    return NextResponse.json({
      status: "genuine",
      institution: institution?.name ?? null,
      document_type: doc.document_type,
      recipient_name: doc.recipient_name,
      verification_id: verificationId,
      issued_at: doc.issued_at,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
