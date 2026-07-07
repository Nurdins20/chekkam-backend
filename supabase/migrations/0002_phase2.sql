-- Chekkam Phase 2 schema additions
-- Source: Chekkam_Phase2_Build_Spec.md, Section 9
-- Apply with: supabase db push  (or paste into the Supabase SQL editor, after 0001_init.sql)

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

-- Extend document_verification_logs.verifier_channel to include the new bot/extension
-- channels (0001_init.sql only allowed mobile/web/api) — necessary now that
-- lib/documents/verify.ts is called from WhatsApp, Telegram, and the extension.
alter table document_verification_logs drop constraint if exists document_verification_logs_verifier_channel_check;
alter table document_verification_logs add constraint document_verification_logs_verifier_channel_check
  check (verifier_channel in ('mobile','web','api','whatsapp','telegram','extension'));

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

-- ---------------------------------------------------------------------------
-- RLS: channel_identities and channel_messages are service-role/admin only
-- (never client-readable); officers may read their own channel_identities rows.
-- ---------------------------------------------------------------------------

alter table channel_identities enable row level security;
alter table channel_messages enable row level security;

create policy "channel_identities_select_own" on channel_identities
  for select using (profile_id = auth.uid());
create policy "channel_identities_all_staff" on channel_identities
  for all using (is_staff());

create policy "channel_messages_select_staff" on channel_messages
  for select using (is_staff());
create policy "channel_messages_all_staff" on channel_messages
  for all using (is_staff());
