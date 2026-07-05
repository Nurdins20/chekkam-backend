import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireUser, requireRole } from "@/lib/auth";
import { publicAlertFromReportSchema } from "@/lib/validation/schemas";
import { parseBody } from "@/lib/validation/parse";
import { jsonError, toErrorResponse } from "@/lib/errors";
import { redactSensitiveIndicators } from "@/lib/privacy/redact";

type Severity = "info" | "warning" | "critical";
type AlertType = "scam_campaign" | "document_fraud" | "safety_incident" | "general_advisory";

function severityFromRiskLevel(riskLevel: string | null): Severity {
  switch (riskLevel) {
    case "critical":
      return "critical";
    case "high":
    case "medium":
      return "warning";
    default:
      return "info";
  }
}

function alertTypeFromCategory(category: string | null): AlertType {
  if (category === "leaked_document") return "document_fraud";
  if (!category || category === "none" || category === "other") return "general_advisory";
  return "scam_campaign";
}

function titleFromCategory(category: string | null, fallback: string): string {
  return category && category !== "none"
    ? `Suspected ${category.replace(/_/g, " ")}`
    : fallback;
}

/**
 * POST /api/public-alerts/from-report — pre-fills a public_alerts draft
 * (published=false) from a report or campaign, with sensitive indicators
 * redacted (Phase 2 spec P2-42). The analyst edits the draft, then calls the
 * existing POST /api/public-alerts/:id/publish — this route never publishes
 * anything itself.
 */
export async function POST(req: NextRequest) {
  try {
    const profile = await requireUser(req);
    requireRole(profile, ["analyst", "admin", "super_admin"]);

    const body = parseBody(publicAlertFromReportSchema, await req.json());
    const admin = getSupabaseAdmin();

    let title: string;
    let alertBody: string;
    let alertType: AlertType;
    let severity: Severity;
    let relatedCampaignId: string | null = null;

    if (body.report_id) {
      const { data: report } = await admin
        .from("reports")
        .select("id, raw_content, category, risk_level, campaign_id")
        .eq("id", body.report_id)
        .maybeSingle();

      if (!report) return jsonError("NOT_FOUND", "Report not found.", 404);

      title = titleFromCategory(report.category, "Suspicious content reported to Chekkam");
      alertBody = report.raw_content
        ? redactSensitiveIndicators(report.raw_content)
        : "A suspicious report was submitted and reviewed by a Chekkam analyst.";
      alertType = alertTypeFromCategory(report.category);
      severity = severityFromRiskLevel(report.risk_level);
      relatedCampaignId = report.campaign_id;
    } else {
      const { data: campaign } = await admin
        .from("campaigns")
        .select("id, title, category, risk_level, report_count")
        .eq("id", body.campaign_id)
        .maybeSingle();

      if (!campaign) return jsonError("NOT_FOUND", "Campaign not found.", 404);

      title = campaign.title ?? titleFromCategory(campaign.category, "Suspected scam campaign");
      alertBody =
        `Chekkam has received ${campaign.report_count} report(s) describing a suspected ` +
        `${(campaign.category ?? "scam").replace(/_/g, " ")} pattern. ` +
        "Do not send money or share personal information in response to this kind of message.";
      alertType = alertTypeFromCategory(campaign.category);
      severity = severityFromRiskLevel(campaign.risk_level);
      relatedCampaignId = campaign.id;
    }

    const { data: draft, error } = await admin
      .from("public_alerts")
      .insert({
        title,
        body: alertBody,
        alert_type: alertType,
        severity,
        related_campaign_id: relatedCampaignId,
        created_by: profile.id,
        published: false,
      })
      .select("*")
      .single();

    if (error) throw error;

    await admin.from("audit_logs").insert({
      actor_id: profile.id,
      action: "public_alert.promote_from_report",
      target_table: "public_alerts",
      target_id: draft.id,
      metadata: { report_id: body.report_id ?? null, campaign_id: body.campaign_id ?? null },
    });

    return NextResponse.json(draft, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
