import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireUser, requireRole } from "@/lib/auth";
import { institutionCreateSchema } from "@/lib/validation/schemas";
import { parseBody } from "@/lib/validation/parse";
import { generateSigningKeyPair } from "@/lib/crypto/sign";
import { toErrorResponse } from "@/lib/errors";

/**
 * POST /api/institutions — admin onboards a new institution (SRS FR-080, 6.3).
 * Generates an ECDSA key pair; the public key is stored, the private key is
 * returned once so the admin can store it as DOCUMENT_SIGNING_KEY_<id> in the
 * environment/secrets manager — it is never persisted server-side.
 */
export async function POST(req: NextRequest) {
  try {
    const profile = await requireUser(req);
    requireRole(profile, ["admin", "super_admin"]);

    const body = parseBody(institutionCreateSchema, await req.json());
    const admin = getSupabaseAdmin();
    const { publicKey, privateKey } = generateSigningKeyPair();

    const { data, error } = await admin
      .from("institutions")
      .insert({
        name: body.name,
        type: body.type,
        contact_email: body.contact_email,
        contact_phone: body.contact_phone,
        signing_public_key: publicKey,
        signing_key_ref: `DOCUMENT_SIGNING_KEY_${"<set after insert>"}`,
        status: "pending",
      })
      .select("id, name, status")
      .single();

    if (error) throw error;

    const envVarName = `DOCUMENT_SIGNING_KEY_${data.id.replace(/-/g, "_").toUpperCase()}`;
    await admin
      .from("institutions")
      .update({ signing_key_ref: envVarName })
      .eq("id", data.id);

    await admin.from("audit_logs").insert({
      actor_id: profile.id,
      action: "institution.create",
      target_table: "institutions",
      target_id: data.id,
    });

    return NextResponse.json(
      {
        id: data.id,
        name: data.name,
        status: data.status,
        signing_public_key: publicKey,
        signing_private_key_pem: privateKey,
        env_var_to_set: envVarName,
        setup_note:
          "Store signing_private_key_pem as the environment variable named in env_var_to_set. " +
          "This is the only time the private key is returned by the API.",
      },
      { status: 201 }
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** GET /api/institutions — public list of active institutions. */
export async function GET() {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("institutions")
      .select("id, name, type, verified, status")
      .eq("status", "active")
      .order("name");
    if (error) throw error;
    return NextResponse.json({ institutions: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}
