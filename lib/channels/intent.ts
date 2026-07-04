export type ParsedIntent =
  | { type: "verify_document"; verificationId: string }
  | { type: "sign"; documentType: string; recipientName?: string }
  | { type: "report"; description: string }
  | { type: "help" }
  | { type: "check_message"; content: string };

const VERIFICATION_ID_PATTERN = /CHK-[A-Z0-9]{4}-[A-Z0-9]{4}/i;
const SIGN_PATTERN = /^sign\s+(.+)$/i;
const REPORT_PATTERN = /^report\s+([\s\S]+)$/i;
const HELP_PATTERN = /^(help|menu|\/start|\/help)$/i;

/**
 * Lightweight, dependency-free intent parser (Phase 2 spec P2-03). Detects a
 * verification ID pattern, a SIGN/REPORT command, help/menu, or falls back
 * to a bare check-message intent. Both WhatsApp and Telegram text goes
 * through this before routeInboundMessage decides what to do.
 */
export function parseIntent(text: string): ParsedIntent {
  const trimmed = text.trim();

  if (HELP_PATTERN.test(trimmed)) {
    return { type: "help" };
  }

  const signMatch = trimmed.match(SIGN_PATTERN);
  if (signMatch) {
    const [documentType, recipientName] = signMatch[1].split("|").map((s) => s.trim());
    return { type: "sign", documentType: documentType || "certificate", recipientName };
  }

  const reportMatch = trimmed.match(REPORT_PATTERN);
  if (reportMatch) {
    return { type: "report", description: reportMatch[1].trim() };
  }

  const idMatch = trimmed.match(VERIFICATION_ID_PATTERN);
  if (idMatch && trimmed.length < 40) {
    // Short message that's essentially just an ID/PIN -> treat as a verify request.
    return { type: "verify_document", verificationId: idMatch[0].toUpperCase() };
  }

  return { type: "check_message", content: trimmed };
}
