/**
 * Outbound send helpers for WhatsApp Cloud API and Telegram Bot API. Every
 * function checks its own required env vars first and no-ops (logging why)
 * rather than throwing — a channel with no token configured is simply
 * inactive, never a crash (Phase 2 spec "works once I add keys" bar).
 */

export type SendResult = { sent: boolean; reason?: string };

function missingConfig(reason: string): SendResult {
  console.warn(`[channels/send] skipped: ${reason}`);
  return { sent: false, reason };
}

/** Sends a plain text WhatsApp message via the Cloud API. */
export async function sendWhatsAppText(to: string, body: string): Promise<SendResult> {
  const token = process.env.WHATSAPP_CLOUD_API_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    return missingConfig("WHATSAPP_CLOUD_API_TOKEN/WHATSAPP_PHONE_NUMBER_ID not set");
  }

  const response = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("[channels/send] WhatsApp text send failed:", response.status, text);
    return { sent: false, reason: `HTTP ${response.status}` };
  }
  return { sent: true };
}

/**
 * Sends a PNG image (e.g. a signed document's QR code) as a WhatsApp image
 * message. WhatsApp requires media to be uploaded first to get a media id,
 * then referenced in the message — a hosted URL isn't available for a
 * just-generated QR data URL, so we upload the bytes directly.
 */
export async function sendWhatsAppImage(
  to: string,
  imageBuffer: Buffer,
  caption?: string
): Promise<SendResult> {
  const token = process.env.WHATSAPP_CLOUD_API_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    return missingConfig("WHATSAPP_CLOUD_API_TOKEN/WHATSAPP_PHONE_NUMBER_ID not set");
  }

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", new Blob([new Uint8Array(imageBuffer)], { type: "image/png" }), "qr.png");

  const uploadResponse = await fetch(
    `https://graph.facebook.com/v20.0/${phoneNumberId}/media`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form }
  );

  if (!uploadResponse.ok) {
    const text = await uploadResponse.text();
    console.error("[channels/send] WhatsApp media upload failed:", uploadResponse.status, text);
    return { sent: false, reason: `upload HTTP ${uploadResponse.status}` };
  }

  const { id: mediaId } = await uploadResponse.json();

  const sendResponse = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "image",
      image: { id: mediaId, caption },
    }),
  });

  if (!sendResponse.ok) {
    const text = await sendResponse.text();
    console.error("[channels/send] WhatsApp image send failed:", sendResponse.status, text);
    return { sent: false, reason: `HTTP ${sendResponse.status}` };
  }
  return { sent: true };
}

/** Sends a plain text Telegram message. */
export async function sendTelegramText(chatId: string, text: string): Promise<SendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return missingConfig("TELEGRAM_BOT_TOKEN not set");

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error("[channels/send] Telegram text send failed:", response.status, body);
    return { sent: false, reason: `HTTP ${response.status}` };
  }
  return { sent: true };
}

/** Sends a PNG image (e.g. a signed document's QR code) as a Telegram photo. */
export async function sendTelegramPhoto(
  chatId: string,
  photoBuffer: Buffer,
  caption?: string
): Promise<SendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return missingConfig("TELEGRAM_BOT_TOKEN not set");

  const form = new FormData();
  form.append("chat_id", chatId);
  if (caption) form.append("caption", caption);
  form.append("photo", new Blob([new Uint8Array(photoBuffer)], { type: "image/png" }), "qr.png");

  const response = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const body = await response.text();
    console.error("[channels/send] Telegram photo send failed:", response.status, body);
    return { sent: false, reason: `HTTP ${response.status}` };
  }
  return { sent: true };
}

/** Sends a verification code through the given channel, for channel-identity linking (P2-02). */
export async function sendVerificationCode(
  channel: "whatsapp" | "telegram",
  externalId: string,
  code: string
): Promise<SendResult> {
  const message = `Your Chekkam verification code is: ${code}\nEnter this in the dashboard to link this number for document signing.`;
  return channel === "whatsapp"
    ? sendWhatsAppText(externalId, message)
    : sendTelegramText(externalId, message);
}
