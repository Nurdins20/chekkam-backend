import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

/**
 * Lazily initializes the Firebase Admin app from FIREBASE_SERVICE_ACCOUNT_JSON
 * (the full service-account JSON, minified into one env var). Returns null if
 * not configured yet, so callers can no-op instead of crashing (SRS FR-025's
 * "degrade gracefully" spirit applied to push, not just AI).
 */
function getMessagingClient() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;

  if (getApps().length === 0) {
    const serviceAccount = JSON.parse(raw);
    initializeApp({ credential: cert(serviceAccount) });
  }
  return getMessaging();
}

export type PushResult = { sent: number; failedTokens: string[]; configured: boolean };

/** Sends the same notification to a batch of FCM device tokens. */
export async function sendPushToTokens(
  tokens: string[],
  title: string,
  body: string,
  data: Record<string, string> = {}
): Promise<PushResult> {
  const messaging = getMessagingClient();
  if (!messaging || tokens.length === 0) {
    return { sent: 0, failedTokens: tokens, configured: !!messaging };
  }

  const response = await messaging.sendEachForMulticast({
    tokens,
    notification: { title, body },
    data,
  });

  const failedTokens = response.responses
    .map((r, i) => (r.success ? null : tokens[i]))
    .filter((t): t is string => t !== null);

  return { sent: response.successCount, failedTokens, configured: true };
}
