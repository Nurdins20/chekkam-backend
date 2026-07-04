import { SupabaseClient } from "@supabase/supabase-js";
import { hashDocument } from "@/lib/crypto/sign";

/**
 * The one and only document verification path (SRS 10.2). Extracted from
 * app/api/documents/verify/[verificationId]/route.ts and verify-upload/route.ts
 * so WhatsApp, Telegram, and any future channel call the exact same logic
 * instead of a re-implementation. The two HTTP routes are now thin wrappers
 * around these functions — behavior is unchanged.
 */
export type VerifierChannel = "mobile" | "web" | "api" | "whatsapp" | "telegram" | "extension";

export type VerifyResult = {
  status: "genuine" | "tampered" | "revoked" | "not_found";
  institution?: string | null;
  document_type?: string;
  recipient_name?: string | null;
  verification_id?: string;
  issued_at?: string;
  revoked_at?: string;
  reason?: string | null;
};

async function logAttempt(
  admin: SupabaseClient,
  documentId: string | null,
  attempted: string,
  result: VerifyResult["status"],
  channel: VerifierChannel
) {
  await admin.from("document_verification_logs").insert({
    document_id: documentId,
    verification_id_attempted: attempted,
    result,
    verifier_channel: channel,
  });
}

/** Look up by verification ID or PIN — no file to compare, so no tamper detection (SRS 10.2 steps 1-3). */
export async function verifyByIdOrPin(
  admin: SupabaseClient,
  verificationId: string,
  channel: VerifierChannel
): Promise<VerifyResult> {
  const { data: doc } = await admin
    .from("documents")
    .select(
      "id, document_type, recipient_name, status, issued_at, revoked_at, revocation_reason, institutions(name)"
    )
    .or(`verification_id.eq.${verificationId},pin_code.eq.${verificationId}`)
    .maybeSingle();

  if (!doc) {
    await logAttempt(admin, null, verificationId, "not_found", channel);
    return { status: "not_found", verification_id: verificationId };
  }

  const institution = Array.isArray(doc.institutions) ? doc.institutions[0] : doc.institutions;

  if (doc.status === "revoked") {
    await logAttempt(admin, doc.id, verificationId, "revoked", channel);
    return {
      status: "revoked",
      institution: institution?.name ?? null,
      document_type: doc.document_type,
      verification_id: verificationId,
      revoked_at: doc.revoked_at,
      reason: doc.revocation_reason,
    };
  }

  await logAttempt(admin, doc.id, verificationId, "genuine", channel);
  return {
    status: "genuine",
    institution: institution?.name ?? null,
    document_type: doc.document_type,
    recipient_name: doc.recipient_name,
    verification_id: verificationId,
    issued_at: doc.issued_at,
  };
}

/**
 * Verify by uploaded file bytes, optionally scoped to a known verification
 * ID/PIN (hash comparison -> genuine/tampered), or by hash-only search when
 * no ID is given (SRS 10.2 step 4 + "given only an uploaded file").
 */
export async function verifyByUpload(
  admin: SupabaseClient,
  fileBuffer: Buffer,
  verificationId: string | null | undefined,
  channel: VerifierChannel
): Promise<VerifyResult> {
  const computedHash = hashDocument(fileBuffer);

  if (verificationId) {
    const { data: doc } = await admin
      .from("documents")
      .select(
        "id, file_hash, document_type, recipient_name, status, revoked_at, revocation_reason, institutions(name)"
      )
      .or(`verification_id.eq.${verificationId},pin_code.eq.${verificationId}`)
      .maybeSingle();

    if (!doc) {
      await logAttempt(admin, null, verificationId, "not_found", channel);
      return { status: "not_found", verification_id: verificationId };
    }

    const institution = Array.isArray(doc.institutions) ? doc.institutions[0] : doc.institutions;

    if (doc.status === "revoked") {
      await logAttempt(admin, doc.id, verificationId, "revoked", channel);
      return {
        status: "revoked",
        institution: institution?.name ?? null,
        document_type: doc.document_type,
        verification_id: verificationId,
        reason: doc.revocation_reason,
      };
    }

    const matches = doc.file_hash === computedHash;
    await logAttempt(admin, doc.id, verificationId, matches ? "genuine" : "tampered", channel);
    return {
      status: matches ? "genuine" : "tampered",
      institution: institution?.name ?? null,
      document_type: doc.document_type,
      recipient_name: doc.recipient_name,
      verification_id: verificationId,
    };
  }

  // No verification_id given: search by hash alone.
  const { data: doc } = await admin
    .from("documents")
    .select("id, verification_id, document_type, status, revocation_reason, institutions(name)")
    .eq("file_hash", computedHash)
    .maybeSingle();

  if (!doc) {
    await logAttempt(admin, null, "(hash-only lookup)", "not_found", channel);
    return { status: "not_found" };
  }

  const institution = Array.isArray(doc.institutions) ? doc.institutions[0] : doc.institutions;
  const result = doc.status === "revoked" ? "revoked" : "genuine";
  await logAttempt(admin, doc.id, doc.verification_id, result, channel);
  return {
    status: result,
    institution: institution?.name ?? null,
    document_type: doc.document_type,
    verification_id: doc.verification_id,
    reason: doc.status === "revoked" ? doc.revocation_reason : undefined,
  };
}
