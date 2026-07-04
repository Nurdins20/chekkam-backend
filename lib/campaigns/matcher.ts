import { SupabaseClient } from "@supabase/supabase-js";
import { Fingerprint } from "@/lib/campaigns/fingerprint";

const MATCH_THRESHOLD = 0.6;
const TEXT_SIMILARITY_THRESHOLD = 0.75;

type StoredFingerprint = {
  urls?: string[];
  phoneNumbers?: string[];
  normalizedText?: string;
};

/** Jaccard similarity over normalized-text word sets. SRS Section 9. */
function textSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const setA = new Set(a.split(" ").filter(Boolean));
  const setB = new Set(b.split(" ").filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) if (setB.has(token)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Weighted combined score per SRS Section 9 step 2. */
function similarityScore(a: Fingerprint, b: StoredFingerprint): number {
  let score = 0;
  if (a.urls.some((u) => b.urls?.includes(u))) score = Math.max(score, 0.9);
  if (a.phoneNumbers.some((p) => b.phoneNumbers?.includes(p))) score = Math.max(score, 0.85);
  if (textSimilarity(a.normalizedText, b.normalizedText ?? "") > TEXT_SIMILARITY_THRESHOLD) {
    score = Math.max(score, 0.6);
  }
  return score;
}

/** Finds the best-matching open/confirmed campaign for a new report's fingerprint. */
export async function matchCampaign(
  admin: SupabaseClient,
  fingerprint: Fingerprint
): Promise<string | null> {
  const { data: campaigns } = await admin
    .from("campaigns")
    .select("id, fingerprint")
    .in("status", ["open", "confirmed"]);

  let best: { id: string; score: number } | null = null;
  for (const campaign of campaigns ?? []) {
    const score = similarityScore(fingerprint, (campaign.fingerprint ?? {}) as StoredFingerprint);
    if (score >= MATCH_THRESHOLD && (!best || score > best.score)) {
      best = { id: campaign.id, score };
    }
  }
  return best?.id ?? null;
}

/**
 * Finds a recent, not-yet-campaigned report whose fingerprint matches closely
 * enough to justify creating a new campaign (SRS 9: "create a new campaign
 * once a second matching report appears"). Fingerprints are stored inline on
 * reports.ai_indicators.fingerprint at submission time.
 */
export async function findMatchingUnlinkedReport(
  admin: SupabaseClient,
  fingerprint: Fingerprint,
  excludeReportId: string
): Promise<string | null> {
  const { data: reports } = await admin
    .from("reports")
    .select("id, ai_indicators")
    .is("campaign_id", null)
    .neq("id", excludeReportId)
    .order("created_at", { ascending: false })
    .limit(200);

  for (const report of reports ?? []) {
    const other = (report.ai_indicators as { fingerprint?: StoredFingerprint } | null)?.fingerprint;
    if (!other) continue;
    if (similarityScore(fingerprint, other) >= MATCH_THRESHOLD) {
      return report.id as string;
    }
  }
  return null;
}

/** Attaches a report to an existing campaign and increments its report_count. */
export async function attachToCampaign(
  admin: SupabaseClient,
  campaignId: string,
  reportId: string
) {
  await admin.from("reports").update({ campaign_id: campaignId }).eq("id", reportId);

  const { data: campaign } = await admin
    .from("campaigns")
    .select("report_count")
    .eq("id", campaignId)
    .single();

  await admin
    .from("campaigns")
    .update({
      report_count: (campaign?.report_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaignId);
}

/** Creates a new open campaign from two matching reports and attaches both. */
export async function createCampaignFromReports(
  admin: SupabaseClient,
  reportIds: [string, string],
  fingerprint: Fingerprint,
  category: string | null,
  riskLevel: string | null
): Promise<string> {
  const { data: campaign, error } = await admin
    .from("campaigns")
    .insert({
      title: category
        ? `Suspected ${category.replace(/_/g, " ")} campaign`
        : "Unlabeled suspicious-content campaign",
      fingerprint,
      category,
      risk_level: riskLevel,
      report_count: reportIds.length,
    })
    .select("id")
    .single();

  if (error) throw error;

  await admin.from("reports").update({ campaign_id: campaign.id }).in("id", reportIds);
  return campaign.id as string;
}
