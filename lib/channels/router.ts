import { SupabaseClient } from "@supabase/supabase-js";
import { analyzeContent } from "@/lib/ai/risk-analysis";
import { extractFingerprint } from "@/lib/campaigns/fingerprint";
import {
  matchCampaign,
  findMatchingUnlinkedReport,
  attachToCampaign,
  createCampaignFromReports,
} from "@/lib/campaigns/matcher";
import { verifyByIdOrPin, verifyByUpload } from "@/lib/documents/verify";
import { signDocumentCore } from "@/lib/documents/sign-document";
import { requireVerifiedOfficerIdentity } from "@/lib/channels/identity";
import { downloadWhatsAppMedia, downloadTelegramFile, decodeVerificationIdFromImage } from "@/lib/channels/media";
import { parseIntent } from "@/lib/channels/intent";
import { hashExternalId } from "@/lib/privacy/hash";
import {
  riskReply,
  verifyReply,
  signSuccessReply,
  signRefusedReply,
  reportConfirmationReply,
  mediaErrorReply,
  helpReply,
} from "@/lib/channels/replies";
import { ConfigError } from "@/lib/errors";

export type ChatChannel = "whatsapp" | "telegram";

export type InboundMessage = {
  channel: ChatChannel;
  /** Raw phone number (WhatsApp) or user ID (Telegram) — never persisted raw, only hashed. */
  senderId: string;
  text?: string;
  /** Platform-specific media reference: WhatsApp media ID or Telegram file_id. */
  mediaRef?: string;
  mediaKind?: "image" | "document";
};

export type ChannelReply = {
  text: string;
  imageBuffer?: Buffer;
  imageCaption?: string;
};

async function logMessage(
  admin: SupabaseClient,
  channel: ChatChannel,
  senderId: string,
  direction: "in" | "out",
  intent: string | null,
  reportId?: string | null,
  documentId?: string | null
) {
  await admin.from("channel_messages").insert({
    channel,
    external_id_hash: hashExternalId(senderId),
    direction,
    intent,
    report_id: reportId ?? null,
    document_id: documentId ?? null,
  });
}

async function downloadMedia(channel: ChatChannel, mediaRef: string) {
  return channel === "whatsapp" ? downloadWhatsAppMedia(mediaRef) : downloadTelegramFile(mediaRef);
}

async function handleCheckMessage(
  admin: SupabaseClient,
  message: InboundMessage,
  content: string
): Promise<ChannelReply> {
  const analysis = await analyzeContent(content);
  const fingerprint = extractFingerprint(content);

  const { data: inserted } = await admin
    .from("reports")
    .insert({
      channel: message.channel,
      content_type: "text",
      raw_content: content,
      reporter_external_hash: hashExternalId(message.senderId),
      status: "analyzed",
      risk_level: analysis.risk_level,
      risk_score: analysis.risk_score,
      category: analysis.category,
      ai_reasons: analysis.reasons,
      ai_indicators: { ...analysis.indicators, fingerprint, source: analysis.source },
      recommended_action: analysis.recommended_action,
      needs_human_review: true,
      confidence: analysis.confidence,
      language: analysis.language,
    })
    .select("id")
    .single();

  if (inserted) {
    const reportId = inserted.id as string;
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
    await logMessage(admin, message.channel, message.senderId, "in", "check_message", reportId);
  }

  return { text: riskReply(analysis, analysis.language === "fr" ? "fr" : "en") };
}

async function handleVerifyById(
  admin: SupabaseClient,
  message: InboundMessage,
  verificationId: string
): Promise<ChannelReply> {
  const result = await verifyByIdOrPin(admin, verificationId, message.channel);
  await logMessage(admin, message.channel, message.senderId, "in", "verify_document");
  return { text: verifyReply(result) };
}

async function handleVerifyMedia(admin: SupabaseClient, message: InboundMessage): Promise<ChannelReply> {
  if (!message.mediaRef) return { text: mediaErrorReply() };

  const media = await downloadMedia(message.channel, message.mediaRef);
  if (!media) {
    await logMessage(admin, message.channel, message.senderId, "in", "verify_document");
    return { text: mediaErrorReply() };
  }

  const decodedId = await decodeVerificationIdFromImage(media.buffer);
  const result = decodedId
    ? await verifyByIdOrPin(admin, decodedId, message.channel)
    : await verifyByUpload(admin, media.buffer, null, message.channel);

  await logMessage(admin, message.channel, message.senderId, "in", "verify_document");
  return { text: verifyReply(result) };
}

async function handleSign(
  admin: SupabaseClient,
  message: InboundMessage,
  documentType: string,
  recipientName: string | undefined
): Promise<ChannelReply> {
  const identity = await requireVerifiedOfficerIdentity(admin, message.channel, message.senderId);
  if (!identity) {
    await logMessage(admin, message.channel, message.senderId, "in", "sign");
    return { text: signRefusedReply() };
  }

  if (!message.mediaRef) {
    return {
      text: "Attach the document file with your SIGN command as the caption, e.g. `SIGN certificate | Jane Doe`.",
    };
  }

  const media = await downloadMedia(message.channel, message.mediaRef);
  if (!media) {
    return { text: mediaErrorReply() };
  }

  try {
    const result = await signDocumentCore(admin, {
      institutionId: identity.institutionId,
      documentType,
      recipientName,
      fileBuffer: media.buffer,
      actorId: identity.profileId,
      auditAction: `document.sign.${message.channel}`,
    });

    await logMessage(admin, message.channel, message.senderId, "in", "sign", null, result.id);

    const base64 = result.qr_image.split(",")[1];
    return {
      text: signSuccessReply(result),
      imageBuffer: base64 ? Buffer.from(base64, "base64") : undefined,
      imageCaption: `Verification ID: ${result.verification_id}`,
    };
  } catch (err) {
    if (err instanceof ConfigError) {
      return {
        text:
          "This institution doesn't have a signing key configured yet. " +
          "Ask an admin to set it up in the dashboard before signing over chat.",
      };
    }
    throw err;
  }
}

async function handleReport(
  admin: SupabaseClient,
  message: InboundMessage,
  description: string
): Promise<ChannelReply> {
  const identity = await requireVerifiedOfficerIdentity(admin, message.channel, message.senderId).catch(
    () => null
  );

  await admin.from("safety_alerts").insert({
    reporter_id: identity?.profileId ?? null,
    category: "other",
    description,
    status: "pending",
  });

  await logMessage(admin, message.channel, message.senderId, "in", "report");
  return { text: reportConfirmationReply() };
}

/**
 * Decides intent (verify/check/sign/report/help) for an inbound message and
 * returns a normalized reply. Both the WhatsApp and Telegram webhooks are
 * thin platform-I/O adapters around this single function (Phase 2 spec §2.1
 * "one engine, many doors" — this is the "many doors" dispatcher).
 */
export async function routeInboundMessage(
  admin: SupabaseClient,
  message: InboundMessage
): Promise<ChannelReply> {
  // Media present: either a verify-by-scan/upload, or a SIGN command with a caption.
  if (message.mediaRef) {
    const intent = message.text ? parseIntent(message.text) : { type: "check_message" as const, content: "" };
    if (intent.type === "sign") {
      return handleSign(admin, message, intent.documentType, intent.recipientName);
    }
    return handleVerifyMedia(admin, message);
  }

  if (!message.text || message.text.trim().length === 0) {
    return { text: helpReply() };
  }

  const intent = parseIntent(message.text);
  switch (intent.type) {
    case "help":
      return { text: helpReply() };
    case "verify_document":
      return handleVerifyById(admin, message, intent.verificationId);
    case "sign":
      // SIGN without an attached file in this same message — no file to sign yet.
      return {
        text: "Attach the document file with your SIGN command as the caption, e.g. `SIGN certificate | Jane Doe`.",
      };
    case "report":
      return handleReport(admin, message, intent.description);
    case "check_message":
      return handleCheckMessage(admin, message, intent.content);
    default:
      return { text: helpReply() };
  }
}
