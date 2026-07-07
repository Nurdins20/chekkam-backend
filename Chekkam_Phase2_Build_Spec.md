# Chekkam — Phase 2 Build Specification

**Version:** 1.0
**Status:** Build-ready — hand directly to the AI coding agent (Claude Code)
**Companion documents:** `Chekkam_Software_Requirements_Specification.md` (SRS), `Chekkam_Project_Overview.md`, `Chekkam_Brand_Guide.md`, `DOCUMENTATION.md`
**Applies to repos:** `chekkam-backend` (Next.js + Supabase), `chekkam` (Flutter), and a **new** `chekkam-extension` (browser extension)

---

## 0. How to use this document (read first, AI coding agent)

This is a **delta spec**. Phase 1 already exists and works: document signing/verification (SHA-256 + ECDSA P-256), AI risk analysis with rule-based fallback, campaign fingerprinting, reports API, institutions/members, public alerts with a publish step, safety alerts with an approve step, a partner API (`X-Api-Key` + rate limiting), and a functional-stub WhatsApp webhook that already creates `reports` rows. **Do not rebuild any of that.** Reuse the existing engine functions everywhere:

- `analyzeContent(content)` in `lib/ai/risk-analysis.ts` — the one and only scam/phishing analyzer. Every new channel calls this. Never write a second analyzer.
- `hashDocument()`, `signHash()`, `getInstitutionPrivateKey()` in `lib/crypto/sign.ts` — the one and only signing path.
- The verification logic in `app/api/documents/verify-upload/route.ts` and `verify/[verificationId]/route.ts` — the one and only verification path.

Your job in Phase 2 is to add **channels** (WhatsApp, Telegram, browser extension) and **close the operational loop** (key issuance, report→review→publish, media handling) on top of that engine — plus the small amount of new data model and env config needed to support them.

Every requirement below carries an ID (`P2-xx`), the client/component it touches, and acceptance criteria. Implement in the order given in §11.

---

## 1. Scope of Phase 2

Five deliverables, all sharing the Phase 1 engine:

1. **WhatsApp bot** — anyone can check a suspicious message or a document by sending it to the Chekkam number and getting a result back; verified institution officers can *sign* a document by sending it with a command (§4).
2. **Telegram bot** — the same check/verify/report capability through Telegram (§5).
3. **Browser extension** — an installable (load-unpacked for testing) Chrome/Edge extension that right-click-checks a link, selected text, or the current page (§6).
4. **Report → Admin review → Publish loop** — a submission from any channel lands in the analyst dashboard, a human reviews it, and can promote it to a published public alert (§7).
5. **Live document lifecycle** — the sign → verify (genuine) → tamper → verify (tampered) → revoke → verify (revoked) demo runs end to end, reliably, in front of the jury (§8).

### 1.1 Non-goals for Phase 2 (do not build)

- OCR-assisted *fuzzy* document matching (FR-048) beyond best-effort text extraction — exact-hash verification remains the reliable demo path.
- Mobile push notifications (deferred; not on the demo critical path).
- Chrome Web Store / Play Store *public* publishing — the extension ships **load-unpacked** for testing; store submission is post-contest.
- Full WhatsApp/Telegram broadcast-out of public alerts — Phase 2 is inbound checking + human-reviewed publishing to the web/app alert page.

### 1.2 Eligibility guardrail (keep this true)

The competition requires the project to stay **pre-revenue and not commercially operational**. Therefore: API keys and channel access are **admin-issued only** (no open self-serve signup), partner/extension usage stays framed as **pilot/testing**, and nothing in this build introduces billing, payment, or a public "sign up and pay" surface. Keep all channel onboarding controlled and pilot-scoped.

---

## 2. Shared design principles (apply to every deliverable)

1. **One engine, many doors.** WhatsApp, Telegram, extension, and app all funnel into the same `analyzeContent()` and the same verification routes. A report created from any channel must be structurally identical to an app-submitted one (SRS §12.2).
2. **Signing is privileged, always.** Verifying a document is public and anonymous. *Creating* a signed document requires an authenticated institution officer. Over a chat channel, that means the sender's WhatsApp number / Telegram ID must be pre-linked to an institution officer account and verified (§3.2). No exceptions — an unverified sender can never sign.
3. **Human review before anything public.** No inbound message auto-publishes. Reports and alert suggestions queue for analyst approval; only a human promotes a report/campaign to a published public alert.
4. **Privacy by default (Law 2024/017).** Redact/hash phone numbers and chat IDs at rest where they aren't needed for function; never expose a reporter's number in public output; content sent to the AI provider is the minimum needed to analyze.
5. **Graceful degradation.** If AI is down, the rule-based fallback answers (already built). If media download fails, reply with a clear "couldn't read that file, try again" — never a silent failure or a stack trace to the user.
6. **Brand voice in replies.** Calm, plain-language, action-oriented, never shaming. Emoji are acceptable in chat-bot replies only (Brand Guide §5), never as functional UI icons elsewhere.

---

## 3. Prerequisite work (do this before the channels)

### 3.1 API key / channel-key issuance (P2-01) — closes the current gap

**Problem:** `generateApiKey()` exists but nothing inserts an `api_keys` row, so no partner/extension key can be issued today.

**Build:**
- `POST /api/admin/api-keys` (web dashboard, `admin`/`super_admin` only) — body `{ organization_name, scopes[], rate_limit_per_minute? }`. Calls `generateApiKey()`, inserts the row (storing only `key_hash` + `key_prefix`), and returns the **plaintext key exactly once** in the response. Write an `audit_logs` entry.
- `POST /api/admin/api-keys/:id/revoke` — sets `status = 'revoked'`, `revoked_at = now()`.
- A CLI fallback: `scripts/issue-api-key.mjs <organization_name>` that does the same insert and prints the key, for demo setup without the UI.

**Acceptance:** an admin can mint a key, immediately call `/v1/partner/check` with it and get `200`, then revoke it and get `401`.

### 3.2 Channel identity linking (P2-02) — enables secure signing over chat

New table `channel_identities` (migration `0002_phase2.sql`, see §9). Links a WhatsApp number or Telegram user ID to a `profiles` row and, for officers, an `institutions` row.

**Build:**
- `POST /api/channel-identities` (web dashboard, officer/admin) — body `{ channel: 'whatsapp'|'telegram', external_id }`. Creates an **unverified** row and triggers a 6-digit confirmation code sent *through that channel* to the given `external_id`.
- `POST /api/channel-identities/verify` — body `{ channel, external_id, code }`. Marks the row `verified = true` on match.
- For the demo, an admin may pre-insert a `verified = true` row via seed (§8 runbook) so signing works immediately.

**Rule:** the bot signing flow (§4.4, §5.4) MUST check for a `verified = true` row **with a non-null `institution_id`** before allowing a sign. Otherwise reply: "This number isn't authorized to sign documents."

### 3.3 Shared channel helpers (P2-03)

Create `lib/channels/` to avoid duplicating logic between WhatsApp and Telegram:
- `router.ts` — `routeInboundMessage({ channel, senderId, text, mediaRef })` decides intent (verify-document vs check-message vs sign vs report vs help) and returns a normalized `ChannelReply`.
- `replies.ts` — brand-voice reply templates (EN/FR/Pidgin variants) for each result type. Keep copy calm and action-oriented.
- `media.ts` — `downloadWhatsAppMedia(mediaId)` and `downloadTelegramFile(fileId)` → returns `Buffer` + mime type; uploads originals to the `report-uploads` Supabase bucket when a report is created.
- `intent.ts` — lightweight parser: detects a verification ID pattern (`CHK-XXXX-XXXX`), a `SIGN ...` command, a `REPORT ...` command, a bare URL, or free text.

Both webhooks are thin: parse platform payload → call `routeInboundMessage` → send the reply back via the platform's send API.

---

## 4. WhatsApp Bot (P2-10 … P2-19)

**Platform:** Meta WhatsApp Cloud API. Route file already exists: `app/api/webhooks/whatsapp/route.ts` (currently a functional stub that creates reports). Extend it into a full router with reply-back.

### 4.1 Config (env)
```
WHATSAPP_CLOUD_API_TOKEN=       # permanent or system-user token
WHATSAPP_PHONE_NUMBER_ID=       # the sending number's ID
WHATSAPP_VERIFY_TOKEN=          # your chosen webhook verify string
WHATSAPP_APP_SECRET=            # to validate X-Hub-Signature-256
```

### 4.2 Webhook (P2-10)
- `GET /api/webhooks/whatsapp` — echo `hub.challenge` when `hub.verify_token === WHATSAPP_VERIFY_TOKEN` (already stubbed; confirm it works).
- `POST /api/webhooks/whatsapp` — **validate `X-Hub-Signature-256`** against `WHATSAPP_APP_SECRET` (new; reject unsigned). Parse `entry[].changes[].value.messages[]`. For each message, extract `from` (sender number), and either `text.body` or a media object (`image`, `document`).

### 4.3 Check a message or link (P2-11)
Free text or a URL → `analyzeContent(text)` → reply with risk level, one-line reason, and recommended action. Persist a `reports` row (`channel = 'whatsapp'`). Redact/hash the sender number in storage (store a salted hash in `reporter_external_hash`, not the raw number).

**Reply shape (example):**
> ⚠️ *Likely scam (High risk).* This message asks for an upfront "processing fee," a common mobile-money fraud pattern. **Do not send money or share personal details.** A Chekkam analyst will review reports like this.

### 4.4 Verify a document sent in (P2-12)
User sends an image or PDF of a document:
1. `downloadWhatsAppMedia(mediaId)` → `Buffer`.
2. Try to decode a QR from the image (server-side, e.g. `jsQR`/`jimp` or `zbar`); if a `verification_id` is found, call the existing verify-by-ID path.
3. Otherwise recompute `hashDocument(buffer)` and run the existing hash-only lookup (`verify-upload` logic).
4. Reply Genuine / Tampered / Revoked / Not Found, naming the issuing institution when known.

**Reply (Genuine):**
> ✅ *Genuine.* This certificate was issued by **Lycée Bilingue de Yaoundé** and has not been altered. Verification ID: CHK-4F7K-9QRT.

**Reply (Tampered):**
> ❌ *Tampered.* A document with this ID exists, but the file you sent does not match the original. Treat it as not trustworthy.

### 4.5 Sign a document over WhatsApp — officer only (P2-13)
Trigger: sender attaches a document **and** sends a caption/command `SIGN <document_type> | <recipient_name>`.
1. Look up `channel_identities` for this number: must be `verified = true` with an `institution_id`. If not → refuse (see §3.2).
2. Download media → run the **exact existing sign path** (`hashDocument` → `getInstitutionPrivateKey(institution_id)` → `signHash` → generate `verification_id`, PIN, QR) → insert `documents` row → `audit_logs`.
3. Reply with the verification ID, PIN, and the **QR image** as an outbound WhatsApp image message, so the officer can attach it to the document.

**Reply:**
> ✅ Signed. Verification ID: **CHK-4F7K-9QRT** · PIN: **482915**. Anyone can verify this at chekkam.cm/verify/CHK-4F7K-9QRT or by sending the document to this number. (QR image attached.)

### 4.6 Report a community/safety alert (P2-14)
Command `REPORT <description>` (optionally with an image) → create a `safety_alerts` row (`status = 'pending'`) or a `public_alerts` **suggestion** for the analyst queue. Reply confirming it will be reviewed by a human before anyone is notified, and (for safety) always append the emergency-services disclaimer (SRS FR-073).

### 4.7 Help / menu (P2-15)
Any unrecognized input or `HELP`/`MENU` → short menu explaining: send a message to check it, send a document to verify it, `REPORT ...` to flag a local issue. Multilingual (EN/FR/Pidgin) — detect from prior message language or offer all three briefly.

### 4.8 Testing without full business verification (P2-16)
WhatsApp business verification is slow in Cameroon. For the demo, use the **Cloud API test number** with the 5 allow-listed recipient numbers configured in Meta. Document this in the runbook. Record a backup video of the WhatsApp flow (§8.4) in case live API/verification isn't ready by the pitch.

**Acceptance (WhatsApp):** from an allow-listed phone, (a) sending a scam text returns a High-risk reply and creates a report; (b) sending a genuine signed doc returns Genuine; (c) sending an altered copy returns Tampered; (d) an officer-linked number can `SIGN` and receives a working verification ID + QR; (e) a non-officer `SIGN` attempt is refused.

---

## 5. Telegram Bot (P2-20 … P2-27)

**Platform:** Telegram Bot API. Simpler than WhatsApp (no business verification, instant bot creation via BotFather). Mirror the WhatsApp behaviour using the shared `lib/channels/` helpers.

### 5.1 Config (env)
```
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=        # set as secret_token in setWebhook; validate on each update
```

### 5.2 Webhook (P2-20)
- New route `app/api/webhooks/telegram/route.ts`, `POST` only.
- Validate the `X-Telegram-Bot-Api-Secret-Token` header against `TELEGRAM_WEBHOOK_SECRET`.
- Register once via `setWebhook` (include a `scripts/set-telegram-webhook.mjs` helper pointing at `<APP_BASE_URL>/api/webhooks/telegram`).
- Parse `update.message`: `text`, `photo[]` (largest size), or `document`.

### 5.3 Commands & flows (P2-21 … P2-24)
- `/start` → welcome + menu (EN/FR/Pidgin).
- Free text / link → `analyzeContent` → risk reply + `reports` row (`channel = 'telegram'`).
- Photo/document → `downloadTelegramFile(fileId)` (`getFile` → download from `https://api.telegram.org/file/bot<token>/<file_path>`) → QR-decode or hash lookup → Genuine/Tampered/Revoked/Not Found.
- `/sign` (reply to a document, officer only) → same allow-list check via `channel_identities` (channel `telegram`, `external_id` = Telegram user ID) → existing sign path → reply with ID, PIN, and QR photo.
- `/report <text>` (+ optional photo) → safety/public-alert suggestion into the analyst queue, with disclaimer.

### 5.4 Signing security (P2-25)
Identical rule to §3.2/§4.5: only a `verified` Telegram identity with an `institution_id` may sign.

**Acceptance (Telegram):** same five checks as WhatsApp (§4 acceptance), through Telegram.

---

## 6. Browser Extension (P2-30 … P2-37)

**New repo/folder:** `chekkam-extension/` (sibling to `chekkam` and `chekkam-backend`). **Manifest V3.** Ships **load-unpacked** for testing; store publishing is out of scope.

### 6.1 Backend endpoint (P2-30)
New route `app/api/extension/check/route.ts`:
- `POST` body `{ content: string, type: 'text'|'link'|'page' }` → `analyzeContent(content)` → returns `{ risk_level, risk_score, category, reasons, recommended_action, needs_human_review: true }`.
- **No API key** (this is the free citizen-tier check). Rate-limit by client IP. Use Upstash Redis if configured (`UPSTASH_REDIS_REST_URL` / `_TOKEN`); otherwise a simple in-memory/table limiter. Suggested limit: 30 requests / 10 min / IP.
- **CORS:** allow `chrome-extension://*` origins (and the extension's own ID once known). Handle `OPTIONS` preflight.
- Persist a lightweight `reports` row (`channel = 'extension'`) so extension checks also feed campaign detection. Do **not** store the full page HTML — store the URL and/or the selected snippet only (privacy).

### 6.2 Extension files (P2-31 … P2-35)

```
chekkam-extension/
├── manifest.json
├── background.js          # service worker: context menus + API calls
├── popup.html             # toolbar popup: paste-a-message-to-check box
├── popup.js
├── result.css             # brand-styled result card (Brand Guide tokens)
└── icons/                 # 16/48/128 px, the Chekkam check-in-circle mark
```

**`manifest.json` (P2-31):**
```json
{
  "manifest_version": 3,
  "name": "Chekkam — Check before you trust",
  "version": "0.1.0",
  "description": "Check a suspicious link, message, or page with Chekkam.",
  "permissions": ["contextMenus", "activeTab", "scripting", "storage"],
  "host_permissions": ["https://<your-backend-domain>/*"],
  "background": { "service_worker": "background.js" },
  "action": { "default_popup": "popup.html", "default_icon": "icons/icon48.png" },
  "icons": { "16": "icons/icon16.png", "48": "icons/icon48.png", "128": "icons/icon128.png" }
}
```

**Context menu (P2-32):** on install, register menu items: "Check this link with Chekkam" (on link), "Check selected text with Chekkam" (on selection), "Check this page with Chekkam" (on page). On click, `background.js` POSTs to `/api/extension/check` and shows the result.

**Result display (P2-33):** inject a small brand-styled result card into the active tab via `chrome.scripting.executeScript` (Ink text, Tint card, semantic status colour + icon + **text label** — never colour alone, Brand Guide §3.2). Card shows risk level, the top reason, recommended action, and a "not a verdict — pending human review" note.

**Popup (P2-34):** a paste box ("Paste a message to check") + Check button → same endpoint → same card, rendered in the popup.

**Config (P2-35):** backend base URL read from `chrome.storage` with a sensible default; a hidden/simple options field to point at localhost during development.

### 6.3 Install-for-testing (P2-36)
Document in `chekkam-extension/README.md`: `chrome://extensions` → Developer mode → **Load unpacked** → select the folder. This is the "I can add it on my browser for test cases" path. Note Edge uses the same Manifest V3 and loads unpacked identically.

**Acceptance (extension):** after loading unpacked, right-clicking a known scam URL returns a High-risk card; pasting a genuine-looking benign message returns Low risk; the reason text and recommended action render; the check appears as an `extension`-channel report in the analyst dashboard.

---

## 7. Report → Admin review → Publish loop (P2-40 … P2-45)

Most primitives exist; wire them into one visible chain and add the "promote to alert" action.

### 7.1 Inbound (P2-40)
Every channel (app, WhatsApp, Telegram, extension, safety `REPORT`) creates a row that surfaces in the **analyst dashboard** queue, filterable by `channel`, `risk_level`, `category`, `status` (extend the existing dashboard filters).

### 7.2 Review (P2-41)
Analyst opens a report → sees the AI analysis (reasons, indicators, confidence, `source: ai|rule_based_fallback`) and any attached media → sets `status`: `under_review` → `verified_threat` / `false_report` / `dismissed` (existing `PATCH /api/reports/:id`). Ensure the UI exposes these transitions clearly.

### 7.3 Promote to public alert (P2-42) — new
Add `POST /api/public-alerts/from-report` (analyst/admin) — body `{ report_id }` or `{ campaign_id }`. Pre-fills a `public_alerts` draft (`published = false`) from the report/campaign (title, body, `alert_type`, `severity`, `related_campaign_id`), **with sensitive indicators redacted** (no phone numbers, no reporter identity). Analyst edits, then calls the existing `POST /api/public-alerts/:id/publish`.

### 7.4 Safety-alert path (P2-43)
`REPORT`-style community submissions land in `safety_alerts` (`pending`) → analyst approves via the existing `POST /api/safety-alerts/:id/approve` → alert becomes visible on the app/web alert page. Always attach the emergency-services disclaimer. (Proximity push stays deferred.)

### 7.5 Publish surface (P2-44)
Published `public_alerts` show on the existing public alert page (web) and the Flutter `public_alerts_screen`. Confirm both render newly published alerts without a code change (they read the same API).

### 7.6 Audit (P2-45)
Log every status change, promotion, and publish to `audit_logs` (actor, action, target). This is your "human review before publish" evidence for criterion 7.

**Acceptance (loop):** a scam sent via WhatsApp appears in the analyst dashboard → analyst marks it `verified_threat` → promotes it to a public alert → publishes → the alert is visible on both the public web page and the Flutter app.

---

## 8. Live document lifecycle demo (P2-50) — the money shot

This must run reliably on stage. The engine already supports it; this section is the **scripted acceptance test** and the setup that makes it repeatable.

### 8.1 One-command setup (`scripts/seed-demo.mjs`)
Seeds: one active institution ("Lycée Bilingue de Yaoundé") **with a generated signing key** (prints the `DOCUMENT_SIGNING_KEY_<uuid>` env line to paste), one `super_admin` + one `institution_officer` login, one verified `channel_identities` row for the demo WhatsApp/Telegram sender, the sample fake-scholarship `public_alerts` row (SRS Appendix), and one partner/extension API key. Idempotent (safe to re-run).

### 8.2 The scripted flow (must all pass)
1. **Sign** — officer signs `sample_certificate.pdf` on the web dashboard → receives ID + PIN + QR.
2. **Verify (another person)** — a *different* device/person scans the QR (Flutter app) or sends the file to the WhatsApp/Telegram bot → **Genuine**, institution named.
3. **Tamper** — edit one byte/pixel of the file, verify again by upload → **Tampered**.
4. **Revoke** — officer revokes the document with a reason → verify again → **Revoked** + reason shown.
5. **Not found** — verify a random unsigned file → **Not Found**.

### 8.3 Cross-channel proof
Run step 2 through **each** channel (app scan, WhatsApp send, Telegram send, web upload) to show one engine, many doors.

### 8.4 Fallback recording (P2-51)
Record a screen capture of every flow above **and** each bot conversation in advance. If venue Wi-Fi or the WhatsApp/OpenAI API misbehaves during the pitch, switch to the recording. Never let the 20-point demo criterion depend on live network conditions.

---

## 9. Data model changes (`0002_phase2.sql`)

```sql
-- Link a chat identity to a person / institution (enables secure signing over chat)
create table channel_identities (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  institution_id uuid references institutions(id) on delete set null,
  channel text not null check (channel in ('whatsapp','telegram')),
  external_id text not null,          -- phone number (WA) or user id (TG)
  verified boolean default false,
  verify_code text,                   -- transient 6-digit confirmation
  created_at timestamptz default now(),
  unique (channel, external_id)
);
create index idx_channel_identities_lookup on channel_identities(channel, external_id);

-- Extend reports.channel to include telegram + extension (already has whatsapp, share_intent)
alter table reports drop constraint if exists reports_channel_check;
alter table reports add constraint reports_channel_check
  check (channel in ('mobile','web','whatsapp','telegram','api','extension','share_intent'));

-- Store a salted hash of the reporter's chat handle instead of the raw number (privacy)
alter table reports add column if not exists reporter_external_hash text;

-- Inbound message log (audit + dedupe for bots)
create table channel_messages (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('whatsapp','telegram')),
  external_id_hash text not null,     -- salted hash, never the raw number/id
  direction text not null check (direction in ('in','out')),
  intent text,                        -- check_message | verify_document | sign | report | help
  report_id uuid references reports(id) on delete set null,
  document_id uuid references documents(id) on delete set null,
  created_at timestamptz default now()
);
```
Add RLS: `channel_identities` and `channel_messages` are service-role/admin only (never client-readable). Officers may read their own `channel_identities` rows.

---

## 10. Consolidated env / config (Phase 2 additions)

```
# WhatsApp
WHATSAPP_CLOUD_API_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=

# Telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=

# Extension rate limiting (optional; falls back to in-memory)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Privacy
CHANNEL_ID_SALT=                 # salt for hashing phone numbers / chat ids at rest

# Already required in Phase 1 (must be set for the demo)
APP_BASE_URL=                    # used for QR verification URLs + Telegram webhook
OPENAI_API_KEY=                  # optional; rule-based fallback covers absence
SUPABASE_URL= / SUPABASE_SERVICE_ROLE_KEY= / NEXT_PUBLIC_SUPABASE_ANON_KEY=
DOCUMENT_SIGNING_KEY_<INSTITUTION_UUID>=   # printed by seed-demo.mjs
```
Ship a `.env.example` in `chekkam-backend` listing every variable with a one-line comment. This alone removes most demo-setup friction.

---

## 11. Build order (for the agent)

1. **P2-01/02/03** — key issuance endpoint + script, `channel_identities` + `0002_phase2.sql`, `lib/channels/` helpers. (Unblocks everything.)
2. **P2-30…37** — browser extension + `/api/extension/check`. (Fast win, fully self-contained, no third-party API approval needed — you can literally load it in your browser the same day.)
3. **P2-20…27** — Telegram bot. (No business verification; quickest bot to get live end to end.)
4. **P2-10…16** — WhatsApp bot. (Same logic as Telegram via shared helpers; only the platform I/O differs.)
5. **P2-40…45** — report→review→publish wiring + promote-to-alert.
6. **P2-50/51** — seed script, `.env.example`, scripted demo test, fallback recordings.

Rationale: extension and Telegram give working, demoable channels fastest and with the fewest external dependencies; WhatsApp (slowest to provision) reuses their logic; the review loop and demo polish come last once content is flowing in from real channels.

---

## 12. Phase 2 acceptance checklist (definition of done)

- [ ] Admin can issue and revoke an API key; `/v1/partner/check` honours it.
- [ ] Browser extension loads unpacked; right-click check on a link/selection/page returns a brand-styled risk card; the check appears as an `extension` report.
- [ ] Telegram: check message → risk reply; send signed doc → Genuine; altered → Tampered; revoked → Revoked; officer `/sign` works, non-officer refused.
- [ ] WhatsApp: same five behaviours as Telegram, from an allow-listed number.
- [ ] A report from any channel reaches the analyst dashboard, can be marked `verified_threat`, promoted to a public alert (sensitive data redacted), and published.
- [ ] Published alert shows on both the public web page and the Flutter app.
- [ ] The full document lifecycle (sign → genuine → tamper → revoke → not-found) passes across app, web, WhatsApp, and Telegram.
- [ ] `scripts/seed-demo.mjs` + `.env.example` stand the whole demo up from clean.
- [ ] Backup recordings of every flow exist.
- [ ] No raw phone numbers/chat IDs stored unhashed; no key material in the DB; every publish/sign/revoke is in `audit_logs`.

---

## 13. Privacy, legal & eligibility notes (keep the agent honest)

- Content sent to OpenAI is the minimum needed; if a partner/officer flags sensitivity, the rule-based path can be forced. Note this in the privacy section of the submission (Law 2024/017).
- Phone numbers and chat IDs are hashed with `CHANNEL_ID_SALT` at rest; raw values live only transiently in memory during a request.
- Bots and the extension are **testing/pilot** surfaces; keep language pre-commercial. API keys stay admin-issued. No payment surface anywhere.
- Every safety alert carries the "contact official emergency numbers" disclaimer; no bot ever presents itself as an emergency service.

---

*Companion to `Chekkam_Software_Requirements_Specification.md`. When a Phase 2 requirement conflicts with the base SRS, this document wins for Phase 2 scope; the SRS wins for everything else.*
