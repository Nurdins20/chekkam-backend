import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireUser, requireRole, requireInstitutionMember } from "@/lib/auth";
import { documentSignSchema } from "@/lib/validation/schemas";
import { parseBody } from "@/lib/validation/parse";
import { ValidationError, toErrorResponse } from "@/lib/errors";
import { hashDocument, getInstitutionPrivateKey, signHash } from "@/lib/crypto/sign";
import { generateVerificationId, generatePinCode } from "@/lib/crypto/ids";
import { buildVerificationUrl, generateQrDataUrl } from "@/lib/crypto/qrcode";

/**
 * POST /api/documents/sign — institution officer signs a document.
 * SRS 6.4, 10.1. Requires multipart/form-data with fields:
 * file, institution_id, document_type, recipient_name?
 */
export async function POST(req: NextRequest) {
  try {
    const profile = await requireUser(req);
    requireRole(profile, ["institution_officer", "admin", "super_admin"]);

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ValidationError("file is required (multipart/form-data).", "file");
    }

    const parsed = parseBody(documentSignSchema, {
      institution_id: form.get("institution_id"),
      document_type: form.get("document_type"),
      recipient_name: form.get("recipient_name") || undefined,
    });

    await requireInstitutionMember(profile, parsed.institution_id);

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileHash = hashDocument(buffer);
    const privateKey = getInstitutionPrivateKey(parsed.institution_id);
    const signature = signHash(fileHash, privateKey);

    const verificationId = generateVerificationId();
    const pinCode = generatePinCode();
    const qrPayload = buildVerificationUrl(verificationId);
    const qrImage = await generateQrDataUrl(qrPayload);

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("documents")
      .insert({
        institution_id: parsed.institution_id,
        document_type: parsed.document_type,
        recipient_name: parsed.recipient_name,
        file_hash: fileHash,
        signature,
        verification_id: verificationId,
        qr_payload: qrPayload,
        pin_code: pinCode,
      })
      .select("id, verification_id, pin_code, qr_payload, status")
      .single();

    if (error) throw error;

    await admin.from("audit_logs").insert({
      actor_id: profile.id,
      action: "document.sign",
      target_table: "documents",
      target_id: data.id,
      metadata: { institution_id: parsed.institution_id, document_type: parsed.document_type },
    });

    return NextResponse.json(
      {
        id: data.id,
        verification_id: data.verification_id,
        pin_code: data.pin_code,
        qr_payload: data.qr_payload,
        qr_image: qrImage,
        status: data.status,
      },
      { status: 201 }
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
