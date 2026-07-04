import QRCode from "qrcode";

/** Builds the public verification URL encoded into a document's QR code. SRS 10.1 step 5. */
export function buildVerificationUrl(verificationId: string): string {
  const base = process.env.APP_BASE_URL ?? "https://chekkam.cm";
  return `${base.replace(/\/$/, "")}/verify/${verificationId}`;
}

/** Renders a QR code as a base64 PNG data URL, generated server-side. SRS 10.1 step 6. */
export async function generateQrDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
  });
}
