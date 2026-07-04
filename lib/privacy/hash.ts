import crypto from "node:crypto";

/**
 * Salted hash for phone numbers / chat IDs at rest (Phase 2 spec §13, Law
 * 2024/017). Used for reports.reporter_external_hash and
 * channel_messages.external_id_hash — the raw number/ID lives only
 * transiently in memory during a request, never at rest in those columns.
 *
 * If CHANNEL_ID_SALT isn't set yet, this still produces a deterministic hash
 * (so dedupe/logging keep working during setup) but is not safe to rely on
 * for real privacy guarantees — set the env var before going live.
 */
export function hashExternalId(externalId: string): string {
  const salt = process.env.CHANNEL_ID_SALT ?? "unsalted-dev-only";
  return crypto.createHash("sha256").update(`${salt}:${externalId}`).digest("hex");
}
