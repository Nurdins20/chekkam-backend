import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { analyzeContent } from "@/lib/ai/risk-analysis";
import { extractFingerprint } from "@/lib/campaigns/fingerprint";
import {
  matchCampaign,
  findMatchingUnlinkedReport,
  attachToCampaign,
  createCampaignFromReports,
} from "@/lib/campaigns/matcher";

/**
 * GET /api/webhooks/whatsapp — Meta's webhook verification handshake.
 * Configure WHATSAPP_VERIFY_TOKEN to match what you set in the Meta app dashboard.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

type WhatsAppWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{ from?: string; text?: { body?: string } }>;
      };
    }>;
  }>;
};

/**
 * POST /api/webhooks/whatsapp — Phase 2 stub (SRS 6.6, 12.2 acceptance
 * criterion: "WhatsApp webhook reporting creates a reports row
 * indistinguishable in structure from an app-submitted report").
 * Text messages are turned into reports with channel: 'whatsapp' and run
 * through the same AI analysis + campaign matching as the mobile app.
 * TODO (Phase 2): send the analysis result back to the sender via the
 * WhatsApp Cloud API (WHATSAPP_CLOUD_API_TOKEN) once a business account is set up.
 */
export async function POST(req: NextRequest) {
  const payload = (await req.json()) as WhatsAppWebhookPayload;
  const admin = getSupabaseAdmin();

  const messages = payload.entry?.flatMap((e) => e.changes?.flatMap((c) => c.value?.messages ?? []) ?? []) ?? [];

  for (const message of messages) {
    const text = message.text?.body;
    if (!text) continue;

    const { data: inserted } = await admin
      .from("reports")
      .insert({
        channel: "whatsapp",
        content_type: "text",
        raw_content: text,
        status: "pending",
      })
      .select("id")
      .single();

    if (!inserted) continue;
    const reportId = inserted.id as string;

    const analysis = await analyzeContent(text);
    const fingerprint = extractFingerprint(text);

    let campaignId = await matchCampaign(admin, fingerprint);
    if (campaignId) {
      await attachToCampaign(admin, campaignId, reportId);
    } else {
      const matchingReportId = await findMatchingUnlinkedReport(admin, fingerprint, reportId);
      if (matchingReportId) {
        campaignId = await createCampaignFromReports(
          admin,
          [matchingReportId, reportId],
          fingerprint,
          analysis.category,
          analysis.risk_level
        );
      }
    }

    await admin
      .from("reports")
      .update({
        status: "analyzed",
        risk_level: analysis.risk_level,
        risk_score: analysis.risk_score,
        category: analysis.category,
        ai_reasons: analysis.reasons,
        ai_indicators: { ...analysis.indicators, fingerprint, source: analysis.source },
        recommended_action: analysis.recommended_action,
        needs_human_review: true,
        confidence: analysis.confidence,
      })
      .eq("id", reportId);
  }

  return NextResponse.json({ received: messages.length });
}
