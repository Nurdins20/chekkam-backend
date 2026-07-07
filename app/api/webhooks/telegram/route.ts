import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { routeInboundMessage, InboundMessage } from "@/lib/channels/router";
import { sendTelegramText, sendTelegramPhoto } from "@/lib/channels/send";

type TelegramPhotoSize = { file_id: string; file_size?: number; width: number; height: number };
type TelegramDocument = { file_id: string; file_name?: string; mime_type?: string };
type TelegramMessage = {
  message_id: number;
  from?: { id: number };
  chat: { id: number };
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
  reply_to_message?: TelegramMessage;
};
type TelegramUpdate = { update_id: number; message?: TelegramMessage };

function largestPhoto(photos: TelegramPhotoSize[]): TelegramPhotoSize {
  return photos.reduce((a, b) => (b.width > a.width ? b : a));
}

function extractMedia(message: TelegramMessage): {
  mediaRef?: string;
  mediaKind?: "image" | "document";
} {
  if (message.photo && message.photo.length > 0) {
    return { mediaRef: largestPhoto(message.photo).file_id, mediaKind: "image" };
  }
  if (message.document) {
    return { mediaRef: message.document.file_id, mediaKind: "document" };
  }
  return {};
}

/**
 * POST /api/webhooks/telegram — Telegram Bot API webhook (Phase 2 spec P2-20).
 * Validates X-Telegram-Bot-Api-Secret-Token, normalizes the update into the
 * shared InboundMessage shape, and delegates everything to routeInboundMessage
 * — the same dispatcher WhatsApp uses (one engine, many doors).
 *
 * Telegram's /sign flow: the officer replies to the message containing the
 * document with "/sign <type> | <name>" — the file lives on reply_to_message,
 * not the reply itself, so that's resolved here before handing off.
 */
export async function POST(req: NextRequest) {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expectedSecret) {
    const secretHeader = req.headers.get("x-telegram-bot-api-secret-token");
    if (secretHeader !== expectedSecret) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  } else {
    console.warn("[webhooks/telegram] TELEGRAM_WEBHOOK_SECRET not set — skipping signature validation.");
  }

  let update: TelegramUpdate;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true }); // malformed payload — nothing to do, ack anyway
  }

  const message = update.message;
  if (!message || !message.from) {
    return NextResponse.json({ ok: true });
  }

  const chatId = String(message.chat.id);

  try {
    const text = message.text ?? message.caption;
    let media = extractMedia(message);

    if (!media.mediaRef && message.reply_to_message && text && /^\/?sign\b/i.test(text.trim())) {
      media = extractMedia(message.reply_to_message);
    }

    const inbound: InboundMessage = {
      channel: "telegram",
      senderId: chatId,
      text,
      mediaRef: media.mediaRef,
      mediaKind: media.mediaKind,
    };

    const admin = getSupabaseAdmin();
    const reply = await routeInboundMessage(admin, inbound);

    if (reply.imageBuffer) {
      await sendTelegramPhoto(chatId, reply.imageBuffer, reply.text);
    } else {
      await sendTelegramText(chatId, reply.text);
    }
  } catch (err) {
    console.error("[webhooks/telegram] failed to process update:", err);
    await sendTelegramText(
      chatId,
      "Sorry, something went wrong processing that. Please try again in a moment."
    ).catch(() => undefined);
  }

  return NextResponse.json({ ok: true });
}
