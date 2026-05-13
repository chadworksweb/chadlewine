-- Open/click tracking via Resend webhooks.
-- Resend signs webhook payloads; we match events back to a send row via
-- the resend_id we already store.

-- 1) Per-recipient aggregates so list/detail views can read fast.
alter table public.campaign_sends
  add column if not exists delivered_at timestamptz,
  add column if not exists opened_at timestamptz,
  add column if not exists open_count int not null default 0,
  add column if not exists last_opened_at timestamptz,
  add column if not exists clicked_at timestamptz,
  add column if not exists click_count int not null default 0,
  add column if not exists last_clicked_at timestamptz,
  add column if not exists bounced_at timestamptz,
  add column if not exists bounce_reason text,
  add column if not exists complained_at timestamptz;

-- Resend ids aren't unique in our schema yet — make lookups by them fast
-- since every webhook keys off email_id.
create index if not exists idx_campaign_sends_resend_id
  on public.campaign_sends (resend_id);

-- 2) Full event log. Every webhook fires a row here, even duplicates,
-- so we have an audit trail and can re-derive aggregates if needed.
create table if not exists public.campaign_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  campaign_send_id uuid references public.campaign_sends(id) on delete cascade,
  subscriber_id uuid references public.subscribers(id) on delete set null,
  resend_id text,
  event_type text not null,            -- delivered | opened | clicked | bounced | complained | delivery_delayed | other
  url text,                            -- populated on clicks
  user_agent text,                     -- populated on opens/clicks
  ip_address text,                     -- populated on opens/clicks
  metadata jsonb,                      -- raw event payload for forensic recovery
  created_at timestamptz default now()
);

create index if not exists idx_campaign_events_campaign on public.campaign_events (campaign_id);
create index if not exists idx_campaign_events_send on public.campaign_events (campaign_send_id);
create index if not exists idx_campaign_events_subscriber on public.campaign_events (subscriber_id);
create index if not exists idx_campaign_events_type on public.campaign_events (event_type);

alter table public.campaign_events enable row level security;
drop policy if exists "Admin all campaign_events" on public.campaign_events;
create policy "Admin all campaign_events" on public.campaign_events
  for all to authenticated using (true) with check (true);

-- 3) Campaign-level rollups so the list page can show open/click totals
-- without joining for every row.
alter table public.campaigns
  add column if not exists delivered_count int not null default 0,
  add column if not exists open_count int not null default 0,    -- unique opens
  add column if not exists click_count int not null default 0,   -- unique clicks
  add column if not exists bounce_count int not null default 0,
  add column if not exists complaint_count int not null default 0;
