-- Email campaign composer + Resend send pipeline.
-- See plans/abundant-whistling-wand.md.

-- campaigns: a single email blast (draft, sending, sent, failed)
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  subject text not null default '',
  preheader text,
  body_html text not null default '',
  from_name text not null default 'Chad Lewine',
  from_email text not null default 'chad@chadlewine.com',
  reply_to text,
  audience_filter jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  sent_at timestamptz,
  sent_count int not null default 0,
  failed_count int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.campaigns enable row level security;

drop policy if exists "Admin all campaigns" on public.campaigns;
create policy "Admin all campaigns" on public.campaigns
  for all to authenticated using (true) with check (true);

-- Per-recipient log for delivery state and Resend message ids.
create table if not exists public.campaign_sends (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  subscriber_id uuid references public.subscribers(id) on delete set null,
  email text not null,
  is_test boolean not null default false,
  status text not null default 'queued',
  resend_id text,
  error text,
  sent_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_campaign_sends_campaign on public.campaign_sends (campaign_id);
create index if not exists idx_campaign_sends_subscriber on public.campaign_sends (subscriber_id);

alter table public.campaign_sends enable row level security;

drop policy if exists "Admin all campaign_sends" on public.campaign_sends;
create policy "Admin all campaign_sends" on public.campaign_sends
  for all to authenticated using (true) with check (true);

-- Per-subscriber unsubscribe token, plus an unsubscribed_at column we
-- can use to filter the audience without losing the historical row.
alter table public.subscribers
  add column if not exists unsubscribe_token text unique
    default encode(gen_random_bytes(16), 'hex'),
  add column if not exists unsubscribed_at timestamptz;

-- Backfill tokens on rows that predate this column. The DEFAULT only
-- fires on INSERT, so existing rows would otherwise be left NULL.
update public.subscribers
  set unsubscribe_token = encode(gen_random_bytes(16), 'hex')
  where unsubscribe_token is null;
