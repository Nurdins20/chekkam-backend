import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ValidationError, toErrorResponse } from "@/lib/errors";
import { hashDocument } from "@/lib/crypto/sign";

type VerifierChannel = "mobile" | "web" | "api";

async function logAttempt(
  documentId: string | null,
  attempted: string,
  result: "genuine" | "tampered" | "revoked" | "not_found",
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
 * POST /api/documents/verify-upload — verify by uploaded file, optionally
 * scoped to a known verification_id/PIN. SRS 6.4, 10.2.
 *
 * multipart/form-data fields: file (required), verification_id (optional).
 * - With verification_id: recompute hash and compare against that document
 *   (match -> genuine, mismatch -> tampered). SRS 10.2 step 4.
 * - Without verification_id: search all documents by file_hash. SRS 10.2 "given only an uploaded file".
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ValidationError("file is required (multipart/form-data).", "file");
    }
    const verificationIdField = form.get("verification_id");
    const channel = (form.get("channel") as VerifierChannel) || "web";

    const buffer = Buffer.from(await file.arrayBuffer());
    const computedHash = hashDocument(buffer);
    const admin = getSupabaseAdmin();

    if (typeof verificationIdField === "string" && verificationIdField.length > 0) {
      const { data: doc } = await admin
        .from("documents")
        .select(
          "id, file_hash, document_type, recipient_name, status, revoked_at, revocation_reason, institutions(name)"
        )
        .or(`verification_id.eq.${verificationIdField},pin_code.eq.${verificationIdField}`)
        .maybeSingle();

      if (!doc) {
        await logAttempt(null, verificationIdField, "not_found", channel);
        return NextResponse.json({ status: "not_found", verification_id: verificationIdField });
      }

      const institution = Array.isArray(doc.institutions) ? doc.institutions[0] : doc.institutions;

      if (doc.status === "revoked") {
        await logAttempt(doc.id, verificationIdField, "revoked", channel);
        return NextResponse.json({
          status: "revoked",
          institution: institution?.name ?? null,
          document_type: doc.document_type,
          verification_id: verificationIdField,
          reason: doc.revocation_reason,
        });
      }

      const matches = doc.file_hash === computedHash;
      await logAttempt(doc.id, verificationIdField, matches ? "genuine" : "tampered", channel);
      return NextResponse.json({
        status: matches ? "genuine" : "tampered",
        institution: institution?.name ?? null,
        document_type: doc.document_type,
        recipient_name: doc.recipient_name,
        verification_id: verificationIdField,
      });
    }

    // No verification_id given: search by hash alone.
    const { data: doc } = await admin
      .from("documents")
      .select("id, verification_id, document_type, status, revocation_reason, institutions(name)")
      .eq("file_hash", computedHash)
      .maybeSingle();

    if (!doc) {
      await logAttempt(null, "(hash-only lookup)", "not_found", channel);
      return NextResponse.json({ status: "not_found" });
    }

    const institution = Array.isArray(doc.institutions) ? doc.institutions[0] : doc.institutions;
    const result = doc.status === "revoked" ? "revoked" : "genuine";
    await logAttempt(doc.id, doc.verification_id, result, channel);
    return NextResponse.json({
      status: result,
      institution: institution?.name ?? null,
      document_type: doc.document_type,
      verification_id: doc.verification_id,
      reason: doc.status === "revoked" ? doc.revocation_reason : undefined,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
