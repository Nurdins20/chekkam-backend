# Chekkam Backend + Web Dashboard

Next.js (App Router, TypeScript) API + analyst/institution dashboard, backed by Supabase.
Shared by the Chekkam Flutter app (`../chekkam`) and this web dashboard. See
`../chekkam/Chekkam_Software_Requirements_Specification.md` for the full spec this
implements against.

## 1. Setup

1. **Install dependencies** (already done if you just cloned this):
   ```
   npm install
   ```

2. **Create a Supabase project** at https://supabase.com, then:
   - Copy `.env.example` to `.env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL`,
     `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` from
     Project Settings → API.
   - Apply the schema: open the Supabase SQL editor and run
     `supabase/migrations/0001_init.sql` (or `supabase db push` if you use the
     Supabase CLI with this project linked).

3. **Create your first admin user**: sign up a user via Supabase Auth (dashboard
   or `supabase.auth.signUp`), then in the SQL editor:
   ```sql
   update profiles set role = 'super_admin' where id = '<user-uuid>';
   ```
   (A row in `profiles` is created automatically for new `auth.users` — add a
   trigger for this in production; for now insert one manually if it's missing.)

4. **Run the dev server**:
   ```
   npm run dev
   ```
   Visit http://localhost:3000 — `/login` for staff sign-in, `/dashboard/analyst`
   and `/dashboard/institution` once signed in, `/verify/[verificationId]` is public.

## 2. Optional integrations (the app works without these — see fallbacks)

| Integration | Env var(s) | If not set |
|---|---|---|
| OpenAI (AI risk analysis) | `OPENAI_API_KEY`, `OPENAI_MODEL` | Falls back to a deterministic rule-based analyzer (FR-025) — reports still get a risk level, just less nuanced |
| Firebase (push notifications) | `FIREBASE_SERVICE_ACCOUNT_JSON` | Push sends are silently skipped (`configured: false` in the response); everything else still works |
| WhatsApp Cloud API | `WHATSAPP_CLOUD_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN` | Webhook endpoint exists but has nothing to verify against |

## 3. Onboarding an institution (document signing)

1. As an admin, `POST /api/institutions` with a Bearer token — see the response's
   `signing_private_key_pem` and `env_var_to_set`. This is the **only time** the
   private key is returned.
2. Set that env var in `.env.local` (or your hosting provider's env config).
   Or generate a standalone key pair any time with:
   ```
   npm run generate-signing-key
   ```
3. Add the institution officer's user as a member:
   `POST /api/institutions/:id/members` with `{ "user_id": "...", "role": "officer" }`.
4. That officer can now sign documents from `/dashboard/institution`, or via
   `POST /api/documents/sign` directly.

## 4. Project layout

```
app/api/          API routes (SRS Section 6)
app/dashboard/    Analyst + institution officer web UI (session-gated)
app/verify/       Public document verification page (FR-044)
app/login/        Staff sign-in
lib/crypto/       SHA-256 hashing, ECDSA P-256 signing/verification, QR codes (SRS Section 10)
lib/ai/           OpenAI risk analysis + rule-based fallback (SRS Section 8)
lib/campaigns/    Fingerprinting + similarity matching (SRS Section 9)
lib/supabase/     Admin (service-role) and anon (RLS-respecting) Supabase clients
lib/auth.ts       Bearer-token session + role checks for API routes
lib/partner-auth.ts  X-Api-Key auth + rate limiting for /v1/partner/*
supabase/migrations/  Database schema + RLS policies
scripts/          One-off admin scripts (signing key generation)
```

## 5. What's implemented vs. stubbed

See `../chekkam/DOCUMENTATION.md` for the full build log, endpoint list, and
what's next in priority order.
