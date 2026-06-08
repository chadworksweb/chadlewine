-- Inbound front desk: a single intake for unstructured messages that should
-- NOT land in Chad's personal inbox. Two channels feed this table:
--   1. contact_form  -- the public /contact page
--   2. campaign_reply -- replies to Resend email campaigns (via the inbound
--                        email webhook), reply_to routed to a controlled address
--
-- Every row is triaged by Opus (category + tone + summary + is_priority). Only
-- positive notes and real opportunities ping Chad; everything else is logged
-- here and rolled into a weekly digest. The structured booking/songwriting/art
-- inquiry forms are separate (already-qualified leads) -- this is the firehose.
--
-- Service-role only: rows hold PII and raw message bodies. The API routes use
-- the service-role client (bypasses RLS). No anon/authenticated access.

create table if not exists public.inbound_messages (
  id uuid primary key default gen_random_uuid(),
  -- 'contact_form' | 'campaign_reply'
  channel text not null,
  from_email text not null,
  from_name text,
  subject text,
  -- Cleaned message body (quoted reply history stripped for campaign replies).
  body_text text not null default '',
  -- Full original payload for forensics (inbound webhook JSON, or form fields).
  raw jsonb not null default '{}'::jsonb,

  -- Triage output (null until triaged). triaged=false + triage_error set means
  -- the classifier failed; the message is queued but never auto-pinged.
  triaged boolean not null default false,
  triage_error text,
  -- positive_note | opportunity | favor_ask | criticism | hostile | spam | other
  category text,
  tone text,
  summary text,
  is_priority boolean not null default false,
  pinged_at timestamptz,

  -- 'new' | 'reviewed' | 'archived'
  status text not null default 'new',

  -- Soft links to the audience/subscriber when the sender's email matches.
  audience_id uuid,
  subscriber_id uuid,

  -- Provenance (web form requests carry these; webhook leaves them null).
  ip text,
  user_agent text,
  referer text,
  -- Free-form origin label: campaign id, page path, etc.
  source text,

  created_at timestamptz not null default now()
);

create index if not exists idx_inbound_messages_created on public.inbound_messages (created_at desc);
create index if not exists idx_inbound_messages_status on public.inbound_messages (status);
create index if not exists idx_inbound_messages_category on public.inbound_messages (category);
create index if not exists idx_inbound_messages_priority on public.inbound_messages (is_priority) where is_priority = true;
create index if not exists idx_inbound_messages_email on public.inbound_messages ((lower(from_email)));

alter table public.inbound_messages enable row level security;

-- No policies for anon/authenticated, so only service_role (which bypasses
-- RLS) can read or write. Explicit grants per project convention.
revoke all on public.inbound_messages from anon, authenticated;
grant all on public.inbound_messages to service_role;
