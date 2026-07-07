import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ValidationError, toErrorResponse } from "@/lib/errors";
import { verifyByUpload, VerifierChannel } from "@/lib/documents/verify";

/**
 * POST /api/documents/verify-upload — verify by uploaded file, optionally
 * scoped to a known verification_id/PIN. SRS 6.4, 10.2.
 *
 * multipart/form-data fields: file (required), verification_id (optional).
 * Thin wrapper over lib/documents/verify.ts — the shared logic also used by
 * the WhatsApp/Telegram bots, so there is exactly one verification path.
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
    const admin = getSupabaseAdmin();
    const result = await verifyByUpload(
      admin,
      buffer,
      typeof verificationIdField === "string" ? verificationIdField : null,
      channel
    );
    return NextResponse.json(result);
  } catch (err) {
    return toErrorResponse(err);
  }
}
