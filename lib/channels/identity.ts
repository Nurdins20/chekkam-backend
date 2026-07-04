import { SupabaseClient } from "@supabase/supabase-js";

export type VerifiedOfficerIdentity = {
  profileId: string;
  institutionId: string;
};

/**
 * THE signing-security gate for chat channels (Phase 2 spec §3.2, §4.5,
 * §5.4 — hard requirement, never weaken). Returns the linked profile +
 * institution ONLY if channel_identities has a row for this
 * (channel, external_id) that is verified = true AND institution_id is
 * non-null. Any other case — no row, unverified, or verified with no
 * institution — returns null, and callers MUST refuse the sign request.
 */
export async function requireVerifiedOfficerIdentity(
  admin: SupabaseClient,
  channel: "whatsapp" | "telegram",
  externalId: string
): Promise<VerifiedOfficerIdentity | null> {
  const { data } = await admin
    .from("channel_identities")
    .select("profile_id, institution_id, verified")
    .eq("channel", channel)
    .eq("external_id", externalId)
    .maybeSingle();

  if (!data || !data.verified || !data.institution_id || !data.profile_id) {
    return null;
  }

  return { profileId: data.profile_id, institutionId: data.institution_id };
}
