-- Chekkam initial schema
-- Source: Chekkam_Software_Requirements_Specification.md, Section 5
-- Apply with: supabase db push  (or paste into the Supabase SQL editor)

-- Extensions
create extension if not exists pgcrypto;
create extension if not exists postgis;

-- 5.1 Profiles (extends Supabase auth.users)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  phone text unique,
  role text not null default 'citizen'
    check (role in ('citizen','analyst','institution_officer','admin','super_admin')),
  preferred_language text default 'en' check (preferred_language in ('en','fr','pidgin')),
  consent_location boolean default false,
  consent_notifications boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 5.2 Institutions
create table institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text check (type in
    ('ministry','exam_board','school','university','company','ngo','media','civil_registry','other')),
  verified boolean default false,
  verified_domains text[] default '{}',
  signing_public_key text,
  signing_key_ref text,          -- reference only; private key material lives in a secrets manager, never in this table
  contact_email text,
  contact_phone text,
  status text default 'pending' check (status in ('pending','active','suspended')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 5.3 Institution members
create table institution_members (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid references institutions(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  role text default 'officer' check (role in ('officer','admin')),
  created_at timestamptz default now(),
  unique (institution_id, user_id)
);

-- 5.4 Documents
create table documents (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid references institutions(id) on delete restrict,
  document_type text not null,
  recipient_name text,
  file_hash text not null,
  signature text not null,
  verification_id text unique not null,   -- e.g. CHK-4F7K-9QRT
  qr_payload text not null,
  pin_code text,
  issued_at timestamptz default now(),
  status text default 'active' check (status in ('active','revoked')),
  revoked_at timestamptz,
  revocation_reason text,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);
create index idx_documents_verification_id on documents(verification_id);
create index idx_documents_file_hash on documents(file_hash);

-- 5.5 Document verification logs
create table document_verification_logs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete set null,
  verification_id_attempted text,
  result text check (result in ('genuine','tampered','revoked','not_found')),
  verifier_channel text check (verifier_channel in ('mobile','web','api')),
  created_at timestamptz default now()
);

-- 5.6 Campaigns
create table campaigns (
  id uuid primary key default gen_random_uuid(),
  title text,
  fingerprint jsonb default '{}',
  category text,
  risk_level text check (risk_level in ('low','medium','high','critical')),
  report_count int default 0,
  status text default 'open' check (status in ('open','confirmed','merged','dismissed')),
  merged_into uuid references campaigns(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 5.7 Reports
create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references profiles(id) on delete set null,
  channel text default 'mobile' check (channel in ('mobile','web','whatsapp','api','share_intent')),
  content_type text check (content_type in ('text','link','image','file')),
  raw_content text,
  file_url text,
  language text default 'unknown' check (language in ('en','fr','pidgin','mixed','unknown')),
  risk_level text check (risk_level in ('low','medium','high','critical')),
  risk_score int check (risk_score between 0 and 100),
  category text,
  ai_reasons text[],
  ai_indicators jsonb default '{}',
  recommended_action text,
  needs_human_review boolean default true,
  confidence text check (confidence in ('low','medium','high')),
  status text default 'pending' check (status in
    ('pending','analyzed','under_review','verified_threat','false_report','dismissed')),
  campaign_id uuid references campaigns(id) on delete set null,
  location geography(point, 4326),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 5.8 Evidence
create table evidence (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references reports(id) on delete cascade,
  document_id uuid references documents(id) on delete cascade,
  file_hash text,
  file_type text,
  exif_metadata jsonb,
  ocr_text text,
  perceptual_hash text,
  created_at timestamptz default now()
);

-- 5.9 Public alerts
create table public_alerts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  alert_type text check (alert_type in
    ('scam_campaign','document_fraud','safety_incident','general_advisory')),
  related_campaign_id uuid references campaigns(id),
  severity text check (severity in ('info','warning','critical')),
  published boolean default false,
  published_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- 5.10 Liaison contacts
create table liaison_contacts (
  id uuid primary key default gen_random_uuid(),
  organization text not null,
  region text,
  contact_name text,
  email text,
  phone text,
  active boolean default true,
  created_at timestamptz default now()
);

-- 5.11 Safety alerts
create table safety_alerts (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references profiles(id) on delete set null,
  category text check (category in
    ('violent_crime','accident','fire','natural_hazard','civil_unrest','missing_person','other')),
  description text,
  media_url text,
  location geography(point, 4326),
  location_precision text default 'approximate' check (location_precision in ('exact','approximate')),
  radius_meters int default 1000,
  status text default 'pending' check (status in
    ('pending','approved','rejected','merged','resolved')),
  escalated_to_liaison boolean default false,
  liaison_contact_id uuid references liaison_contacts(id),
  analyst_id uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 5.12 Device tokens (push notifications)
create table device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  fcm_token text not null,
  platform text check (platform in ('android','ios')),
  last_known_area text,          -- approximate area only, never exact coordinates at rest
  consent_given boolean default true,
  created_at timestamptz default now(),
  unique (user_id, fcm_token)
);

-- 5.13 API keys
create table api_keys (
  id uuid primary key default gen_random_uuid(),
  organization_name text not null,
  key_hash text not null,
  key_prefix text not null,
  scopes text[] default '{}',
  rate_limit_per_minute int default 60,
  status text default 'active' check (status in ('active','revoked')),
  created_at timestamptz default now(),
  revoked_at timestamptz
);

-- 5.14 API usage logs
create table api_usage_logs (
  id uuid primary key default gen_random_uuid(),
  api_key_id uuid references api_keys(id) on delete cascade,
  endpoint text,
  status_code int,
  response_time_ms int,
  created_at timestamptz default now()
);

-- 5.15 Trusted sources
create table trusted_sources (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid references institutions(id),
  name text,
  type text check (type in ('website','facebook_page','twitter_account','telegram_channel','phone_number')),
  value text,
  verified boolean default true,
  created_at timestamptz default now()
);

-- 5.16 Audit logs
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id),
  actor_type text default 'user' check (actor_type in ('user','system','api_partner')),
  action text not null,
  target_table text,
  target_id uuid,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security (SRS Section 5, "Row Level Security (minimum required
-- policies)" + FR-003). Service-role backend requests bypass RLS entirely,
-- so these policies govern direct client access via supabase_flutter/JS only.
-- ---------------------------------------------------------------------------

alter table profiles enable row level security;
alter table institutions enable row level security;
alter table institution_members enable row level security;
alter table documents enable row level security;
alter table document_verification_logs enable row level security;
alter table campaigns enable row level security;
alter table reports enable row level security;
alter table evidence enable row level security;
alter table public_alerts enable row level security;
alter table safety_alerts enable row level security;
alter table device_tokens enable row level security;
alter table trusted_sources enable row level security;
alter table audit_logs enable row level security;

create or replace function is_staff()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('analyst','admin','super_admin')
  );
$$;

-- profiles: users manage their own row; admins can read all
create policy "profiles_select_own" on profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on profiles for update using (auth.uid() = id);
create policy "profiles_select_admin" on profiles for select using (is_staff());

-- reports: anonymous/self insert, self select, staff manage all
create policy "reports_insert_self_or_anon" on reports for insert
  with check (reporter_id = auth.uid() or reporter_id is null);
create policy "reports_select_own" on reports for select using (reporter_id = auth.uid());
create policy "reports_select_staff" on reports for select using (is_staff());
create policy "reports_update_staff" on reports for update using (is_staff());

-- documents: institution officers manage their own institution's documents;
-- everyone else reads through the service-role-backed verify API, not this table directly
create policy "documents_all_own_institution" on documents for all
  using (
    exists (
      select 1 from institution_members m
      where m.institution_id = documents.institution_id and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from institution_members m
      where m.institution_id = documents.institution_id and m.user_id = auth.uid()
    )
  );
create policy "documents_select_staff" on documents for select using (is_staff());

-- institutions: public can read active/verified institutions; staff manage all
create policy "institutions_select_public" on institutions for select using (status = 'active');
create policy "institutions_all_staff" on institutions for all using (is_staff());

-- institution_members: members can see their own membership rows; staff manage all
create policy "institution_members_select_own" on institution_members for select using (user_id = auth.uid());
create policy "institution_members_all_staff" on institution_members for all using (is_staff());

-- public_alerts: anyone can read published alerts; staff manage all
create policy "public_alerts_select_published" on public_alerts for select using (published = true);
create policy "public_alerts_all_staff" on public_alerts for all using (is_staff());

-- safety_alerts: reporter can see own submission; staff manage all
create policy "safety_alerts_select_own" on safety_alerts for select using (reporter_id = auth.uid());
create policy "safety_alerts_insert_own" on safety_alerts for insert with check (reporter_id = auth.uid());
create policy "safety_alerts_all_staff" on safety_alerts for all using (is_staff());

-- device_tokens: a user can only manage their own tokens
create policy "device_tokens_all_own" on device_tokens for all using (user_id = auth.uid());

-- campaigns, evidence, document_verification_logs, trusted_sources, audit_logs:
-- staff-only direct access; citizen-facing reads go through API routes
create policy "campaigns_select_staff" on campaigns for select using (is_staff());
create policy "campaigns_all_staff" on campaigns for all using (is_staff());
create policy "evidence_all_staff" on evidence for all using (is_staff());
create policy "verification_logs_select_staff" on document_verification_logs for select using (is_staff());
create policy "trusted_sources_select_public" on trusted_sources for select using (verified = true);
create policy "trusted_sources_all_staff" on trusted_sources for all using (is_staff());
create policy "audit_logs_select_staff" on audit_logs for select using (is_staff());
