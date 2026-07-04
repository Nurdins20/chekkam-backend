import { Jimp } from "jimp";
import jsQR from "jsqr";

export type DownloadedMedia = { buffer: Buffer; mimeType: string };

/**
 * Downloads a WhatsApp media object by ID (WhatsApp sends media as an ID,
 * not a URL — the URL itself must be resolved first via the Graph API, and
 * both calls need the same bearer token).
 */
export async function downloadWhatsAppMedia(mediaId: string): Promise<DownloadedMedia | null> {
  const token = process.env.WHATSAPP_CLOUD_API_TOKEN;
  if (!token) {
    console.warn("[channels/media] WHATSAPP_CLOUD_API_TOKEN not set; cannot download media");
    return null;
  }

  const metaResponse = await fetch(`https://graph.facebook.com/v20.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!metaResponse.ok) return null;
  const meta = await metaResponse.json();
  if (!meta.url) return null;

  const fileResponse = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } });
  if (!fileResponse.ok) return null;

  const buffer = Buffer.from(await fileResponse.arrayBuffer());
  return { buffer, mimeType: meta.mime_type ?? "application/octet-stream" };
}

/**
 * Downloads a Telegram file by file_id: getFile resolves file_path, then the
 * actual bytes are fetched from the file endpoint (not the bot API endpoint).
 */
export async function downloadTelegramFile(fileId: string): Promise<DownloadedMedia | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn("[channels/media] TELEGRAM_BOT_TOKEN not set; cannot download file");
    return null;
  }

  const metaResponse = await fetch(
    `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`
  );
  if (!metaResponse.ok) return null;
  const meta = await metaResponse.json();
  const filePath = meta?.result?.file_path;
  if (!filePath) return null;

  const fileResponse = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
  if (!fileResponse.ok) return null;

  const buffer = Buffer.from(await fileResponse.arrayBuffer());
  const ext = filePath.split(".").pop()?.toLowerCase();
  const mimeType = ext === "pdf" ? "application/pdf" : `image/${ext === "jpg" ? "jpeg" : ext}`;
  return { buffer, mimeType };
}

/**
 * Tries to decode a QR code from an image buffer (SRS/Phase 2 §4.4: "Try to
 * decode a QR from the image"). Returns the verification ID extracted from
 * the payload URL if found, else null — callers fall back to hash-only
 * lookup. Non-image buffers (e.g. a PDF) simply fail to decode and return null.
 */
export async function decodeVerificationIdFromImage(buffer: Buffer): Promise<string | null> {
  try {
    const image = await Jimp.read(buffer);
    const decoded = jsQR(
      new Uint8ClampedArray(image.bitmap.data),
      image.bitmap.width,
      image.bitmap.height
    );
    if (!decoded) return null;

    const uri = URL.canParse(decoded.data) ? new URL(decoded.data) : null;
    if (uri && uri.pathname.split("/").filter(Boolean).length > 0) {
      const segments = uri.pathname.split("/").filter(Boolean);
      return segments[segments.length - 1];
    }
    return decoded.data;
  } catch {
    return null;
  }
}
