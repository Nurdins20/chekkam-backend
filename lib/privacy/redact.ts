// Loose match for Cameroonian mobile numbers, with or without +237 — mirrors
// lib/campaigns/fingerprint.ts's PHONE_PATTERN so the same numbers that feed
// campaign matching are also what gets redacted from public-facing text.
const PHONE_PATTERN = /(?:\+?237)?[\s.-]?6\d(?:[\s.-]?\d){7}/g;

/**
 * Strips phone numbers from report/campaign text before it's used as a
 * public_alerts draft body (Phase 2 spec P2-42: "sensitive indicators
 * redacted — no phone numbers, no reporter identity").
 */
export function redactSensitiveIndicators(text: string): string {
  return text.replace(PHONE_PATTERN, "[redacted number]");
}
