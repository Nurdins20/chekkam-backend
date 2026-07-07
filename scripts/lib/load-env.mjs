import fs from "node:fs";
import path from "node:path";

/**
 * Tiny .env.local/.env loader for standalone scripts (issue-api-key,
 * set-telegram-webhook, seed-demo) that run outside the Next.js process and
 * so don't get its automatic env loading. Doesn't overwrite already-set
 * process.env values (so `FOO=bar node scripts/x.mjs` still overrides the file).
 */
export function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const filePath = path.resolve(process.cwd(), file);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

/** Fails fast with a clear message if required env vars are missing, listing all of them at once. */
export function requireEnv(names) {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    console.error(`Missing required environment variable(s): ${missing.join(", ")}`);
    console.error("Set them in .env.local (see .env.example) before running this script.");
    process.exit(1);
  }
}
