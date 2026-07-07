import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { routeInboundMessage, InboundMessage } from "@/lib/channels/router";
import { sendWhatsAppText, sendWhatsAppImage } from "@/lib/channels/send";

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

type WhatsAppMediaObject = { id: string; mime_type?: string; caption?: string };
type WhatsAppMessage = {
  from: string;
  id: string;
  type: string;
  text?: { body: string };
  image?: WhatsAppMediaObject;
  document?: WhatsAppMediaObject;
};
type WhatsAppWebhookPayload = {
  entry?: Array<{
    changes?: Array<{ value?: { messages?: WhatsAppMessage[] } }>;
  }>;
};

function isValidSignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expectedHex = signatureHeader.slice("sha256=".length);
  const computedHex = crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(computedHex, "hex"), Buffer.from(expectedHex, "hex"));
  } catch {
    return false; // length mismatch etc. -> definitely invalid
  }
}

function normalizeMessage(message: WhatsAppMessage): InboundMessage | null {
  const media = message.image ?? message.document;
  const text = message.text?.body ?? media?.caption;
  const mediaRef = media?.id;
  const mediaKind: "image" | "document" | undefined = message.image
    ? "image"
    : message.document
      ? "document"
      : undefined;

  if (!text && !mediaRef) return null;

  return { channel: "whatsapp", senderId: message.from, text, mediaRef, mediaKind };
}

/**
 * POST /api/webhooks/whatsapp — WhatsApp Cloud API webhook (Phase 2 spec
 * P2-10…P2-16). Validates X-Hub-Signature-256 against WHATSAPP_APP_SECRET
 * (rejects unsigned requests once configured), normalizes each message into
 * the shared InboundMessage shape, and delegates to routeInboundMessage —
 * the exact same dispatcher Telegram uses (one engine, many doors).
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const appSecret = process.env.WHATSAPP_APP_SECRET;

  if (appSecret) {
    const signature = req.headers.get("x-hub-signature-256");
    if (!isValidSignature(rawBody, signature, appSecret)) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  } else {
    console.warn("[webhooks/whatsapp] WHATSAPP_APP_SECRET not set — skipping signature validation.");
  }

  let payload: WhatsAppWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ received: 0 });
  }

  const messages =
    payload.entry?.flatMap((e) => e.changes?.flatMap((c) => c.value?.messages ?? []) ?? []) ?? [];
  if (messages.length === 0) {
    return NextResponse.json({ received: 0 });
  }

  let admin;
  try {
    admin = getSupabaseAdmin();
  } catch (err) {
    console.error("[webhooks/whatsapp] Supabase not configured; cannot process messages:", err);
    return NextResponse.json({ received: 0 });
  }

  for (const message of messages) {
    try {
      const inbound = normalizeMessage(message);
      if (!inbound) continue;

      const reply = await routeInboundMessage(admin, inbound);
      if (reply.imageBuffer) {
        await sendWhatsAppImage(message.from, reply.imageBuffer, reply.text);
      } else {
        await sendWhatsAppText(message.from, reply.text);
      }
    } catch (err) {
      console.error("[webhooks/whatsapp] failed to process message:", err);
      await sendWhatsAppText(
        message.from,
        "Sorry, something went wrong processing that. Please try again in a moment."
      ).catch(() => undefined);
    }
  }

  return NextResponse.json({ received: messages.length });
}
