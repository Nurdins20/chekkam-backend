#!/usr/bin/env node
// Registers the Chekkam Telegram bot's webhook URL with Telegram (Phase 2 spec P2-20).
// Usage: node scripts/set-telegram-webhook.mjs
//        node scripts/set-telegram-webhook.mjs --info   (show current webhook status instead)
import { loadEnv, requireEnv } from "./lib/load-env.mjs";

loadEnv();
requireEnv(["TELEGRAM_BOT_TOKEN", "APP_BASE_URL"]);

const token = process.env.TELEGRAM_BOT_TOKEN;
const appBaseUrl = process.env.APP_BASE_URL.replace(/\/$/, "");
const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;

if (process.argv.includes("--info")) {
  const response = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  console.log(await response.json());
  process.exit(0);
}

if (!secretToken) {
  console.warn(
    "Warning: TELEGRAM_WEBHOOK_SECRET is not set — the webhook will accept unsigned requests. " +
      "Set it in .env.local before going live."
  );
}

const webhookUrl = `${appBaseUrl}/api/webhooks/telegram`;
const params = new URLSearchParams({ url: webhookUrl });
if (secretToken) params.set("secret_token", secretToken);

const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: params.toString(),
});

const body = await response.json();
if (!body.ok) {
  console.error("Failed to set webhook:", body.description ?? body);
  process.exit(1);
}

console.log(`Telegram webhook registered: ${webhookUrl}`);
console.log(body);
