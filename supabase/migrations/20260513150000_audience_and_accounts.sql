-- ============================================================
-- AUDIENCE SYSTEM + CUSTOMER ACCOUNT LAYER
-- One master contact record per person, with tags + activity timeline,
-- linked to optional Supabase Auth user. Customer accounts opened up
-- to the public; admin/customer auth separated by the admins table.
-- See plans/abundant-whistling-wand.md for the full design.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. admins table — gate Supabase Auth users into admin role.
-- Before this migration, the proxy treated any valid JWT as admin.
-- Opening customer signup with that gate intact would grant every
-- customer admin access. We seed every existing auth.user (the only
-- ones who logged in pre-this-migration were admins anyway) and the
-- proxy switches to checking admins-table membership.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  notes text,
  created_at timestamptz default now()
);

alter table public.admins enable row level security;
drop policy if exists "Admin self-read" on public.admins;
create policy "Admin self-read" on public.admins
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "Admin all admins" on public.admins;
create policy "Admin all admins" on public.admins
  for all to authenticated using (true) with check (true);

-- Self-heal seed: every pre-existing auth user becomes an admin.
-- (Pre-this-migration the only Auth users were admins; customer signup
-- doesn't exist yet.) After this runs, customers signing up via
-- /account/register go into auth.users but NOT into admins.
insert into public.admins (user_id, notes)
  select id, 'Auto-seeded by audience migration'
  from auth.users
  on conflict do nothing;

-- ─────────────────────────────────────────────────────────────
-- 2. audience table — the master contact record.
-- One row per person, keyed by lowercased email. Denormalized rollups
-- (lifetime stats, engagement) so admin list views read fast.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.audience (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  display_name text,

  -- Optional account link. NULL = email-only contact.
  user_id uuid unique references auth.users(id) on delete set null,

  -- Mailing address (giveaways, postcards).
  mailing_line1 text,
  mailing_line2 text,
  mailing_city text,
  mailing_state text,
  mailing_postal_code text,
  mailing_country text,

  -- Subscription / consent state.
  subscriber_status text not null default 'never',
  unsubscribed_at timestamptz,
  unsubscribe_token text unique default encode(gen_random_bytes(16), 'hex'),
  marketing_opt_in_at timestamptz,
  marketing_opt_in_source text,

  -- Commerce rollups.
  first_purchase_at timestamptz,
  last_purchase_at timestamptz,
  lifetime_orders int not null default 0,
  lifetime_spend numeric(12,2) not null default 0,

  -- Engagement (Mailchimp-style).
  engagement_score text not null default 'unknown',
  last_opened_at timestamptz,
  last_clicked_at timestamptz,
  emails_received int not null default 0,
  emails_opened int not null default 0,
  emails_clicked int not null default 0,

  -- Admin.
  notes text,
  first_seen_at timestamptz default now(),
  last_activity_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_audience_email_lower on public.audience (lower(email));
create index if not exists idx_audience_user_id on public.audience (user_id);
create index if not exists idx_audience_subscriber_status on public.audience (subscriber_status);
create index if not exists idx_audience_engagement on public.audience (engagement_score);
create index if not exists idx_audience_last_activity on public.audience (last_activity_at desc);

alter table public.audience enable row level security;
drop policy if exists "Admin all audience" on public.audience;
create policy "Admin all audience" on public.audience
  for all to authenticated using (true) with check (true);
-- Customer self-read of their own row (used by /account dashboard).
drop policy if exists "Audience self-read" on public.audience;
create policy "Audience self-read" on public.audience
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "Audience self-update" on public.audience;
create policy "Audience self-update" on public.audience
  for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- 3. audience_tags — many-to-many tags, system-managed + free-form.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.audience_tags (
  audience_id uuid references public.audience(id) on delete cascade,
  tag text not null,
  added_at timestamptz default now(),
  primary key (audience_id, tag)
);
create index if not exists idx_audience_tags_tag on public.audience_tags (tag);

alter table public.audience_tags enable row level security;
drop policy if exists "Admin all audience_tags" on public.audience_tags;
create policy "Admin all audience_tags" on public.audience_tags
  for all to authenticated using (true) with check (true);

-- ─────────────────────────────────────────────────────────────
-- 4. audience_events — chronological activity timeline.
-- Every interaction (subscribe, purchase, open, click, tag change,
-- profile edit) gets a row. Powers the Shopify-style detail-page feed.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.audience_events (
  id uuid primary key default gen_random_uuid(),
  audience_id uuid references public.audience(id) on delete cascade,
  event_type text not null,
  metadata jsonb,
  occurred_at timestamptz default now(),
  created_at timestamptz default now()
);
create index if not exists idx_audience_events_audience on public.audience_events (audience_id, occurred_at desc);
create index if not exists idx_audience_events_type on public.audience_events (event_type);

alter table public.audience_events enable row level security;
drop policy if exists "Admin all audience_events" on public.audience_events;
create policy "Admin all audience_events" on public.audience_events
  for all to authenticated using (true) with check (true);

-- ─────────────────────────────────────────────────────────────
-- 5. FK columns on existing tables.
-- ─────────────────────────────────────────────────────────────
alter table public.subscribers add column if not exists audience_id uuid references public.audience(id);
alter table public.orders add column if not exists audience_id uuid references public.audience(id);
alter table public.purchases add column if not exists audience_id uuid references public.audience(id);
alter table public.campaign_sends add column if not exists audience_id uuid references public.audience(id);

create index if not exists idx_subscribers_audience on public.subscribers (audience_id);
create index if not exists idx_orders_audience on public.orders (audience_id);
create index if not exists idx_purchases_audience on public.purchases (audience_id);
create index if not exists idx_campaign_sends_audience on public.campaign_sends (audience_id);

-- ─────────────────────────────────────────────────────────────
-- 6. SQL functions
-- ─────────────────────────────────────────────────────────────

-- compute_engagement_score — derives the audience.engagement_score from
-- the aggregate open/click stats and recency. Rules:
--   high     — at least one click in last 90 days
--   medium   — open in last 90 days, no click in last 90 days
--   low      — any open ever, but last_opened > 90 days ago, OR opens but no clicks
--   inactive — emailed >= 3 times, zero opens and zero clicks
--   unknown  — never emailed
create or replace function public.compute_engagement_score(p_audience_id uuid)
returns text language plpgsql as $$
declare a record;
begin
  select * into a from public.audience where id = p_audience_id;
  if not found then return 'unknown'; end if;
  if a.emails_received = 0 then return 'unknown'; end if;
  if a.last_clicked_at is not null and a.last_clicked_at > now() - interval '90 days' then
    return 'high';
  end if;
  if a.last_opened_at is not null and a.last_opened_at > now() - interval '90 days' then
    return 'medium';
  end if;
  if a.emails_opened > 0 then
    return 'low';
  end if;
  if a.emails_received >= 3 then
    return 'inactive';
  end if;
  return 'low';
end $$;

-- refresh_audience_tags — recompute all system-managed tags on a row,
-- preserving any free-form/manual tags. Also updates engagement_score
-- via compute_engagement_score.
create or replace function public.refresh_audience_tags(p_audience_id uuid)
returns void language plpgsql as $$
declare
  a record;
  v_score text;
begin
  select * into a from public.audience where id = p_audience_id;
  if not found then return; end if;

  v_score := public.compute_engagement_score(p_audience_id);
  update public.audience set engagement_score = v_score, updated_at = now()
    where id = p_audience_id;

  delete from public.audience_tags
    where audience_id = p_audience_id
      and tag in (
        'customer','customer:recent','customer:past',
        'buyer:digital','buyer:physical','buyer:repeat',
        'subscriber:active','subscriber:past',
        'engaged:high','engaged:medium','engaged:low','engaged:inactive'
      );

  if a.lifetime_orders > 0 then
    insert into public.audience_tags (audience_id, tag) values (p_audience_id, 'customer');
    if a.last_purchase_at is not null and a.last_purchase_at > now() - interval '90 days' then
      insert into public.audience_tags values (p_audience_id, 'customer:recent', now());
    else
      insert into public.audience_tags values (p_audience_id, 'customer:past', now());
    end if;
    if a.lifetime_orders >= 2 then
      insert into public.audience_tags values (p_audience_id, 'buyer:repeat', now());
    end if;
    if exists (
      select 1 from public.purchases p
      where p.audience_id = p_audience_id
        and p.item_type in ('song','album','ringtone','track')
    ) then
      insert into public.audience_tags values (p_audience_id, 'buyer:digital', now());
    end if;
    if exists (
      select 1 from public.purchases p
      where p.audience_id = p_audience_id
        and p.item_type in ('merch','art_original')
    ) then
      insert into public.audience_tags values (p_audience_id, 'buyer:physical', now());
    end if;
  end if;

  if a.subscriber_status = 'active' then
    insert into public.audience_tags values (p_audience_id, 'subscriber:active', now());
  elsif a.subscriber_status = 'unsubscribed' then
    insert into public.audience_tags values (p_audience_id, 'subscriber:past', now());
  end if;

  insert into public.audience_tags values (p_audience_id, 'engaged:' || v_score, now())
    on conflict do nothing;
end $$;

-- upsert_audience_event — convenience helper used by the application
-- code to insert an event AND bump last_activity_at in one call.
create or replace function public.upsert_audience_event(
  p_audience_id uuid,
  p_event_type text,
  p_metadata jsonb default null,
  p_occurred_at timestamptz default null
) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.audience_events (audience_id, event_type, metadata, occurred_at)
    values (p_audience_id, p_event_type, p_metadata, coalesce(p_occurred_at, now()))
    returning id into v_id;
  update public.audience set last_activity_at = coalesce(p_occurred_at, now()),
                              updated_at = now()
    where id = p_audience_id;
  return v_id;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 7. Auth trigger — auto-link audience row when a Supabase Auth user is
-- created. If an audience row already exists for that email, link it;
-- otherwise create a new one.
-- ─────────────────────────────────────────────────────────────
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  v_email := lower(new.email);
  insert into public.audience (email, user_id, first_seen_at, marketing_opt_in_source)
    values (v_email, new.id, now(), 'account')
  on conflict (email) do update
    set user_id = excluded.user_id,
        updated_at = now()
    where public.audience.user_id is null;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ─────────────────────────────────────────────────────────────
-- 8. BACKFILL — populate audience from existing data, then FKs.
-- ─────────────────────────────────────────────────────────────

-- 8a. From subscribers — carries unsubscribe_token, status, source.
insert into public.audience (
  email, subscriber_status, unsubscribe_token, unsubscribed_at,
  marketing_opt_in_at, marketing_opt_in_source, first_seen_at
)
select
  lower(s.email),
  case s.status when 'active' then 'active'
                when 'unsubscribed' then 'unsubscribed'
                else 'never' end,
  coalesce(s.unsubscribe_token, encode(gen_random_bytes(16), 'hex')),
  s.unsubscribed_at,
  s.created_at,
  'subscribe',
  s.created_at
from public.subscribers s
on conflict (email) do nothing;

-- 8b. From orders — carries display name + shipping address.
-- Legacy customers backfill with subscriber_status='never' to honor the
-- no-retroactive-consent stance.
insert into public.audience (
  email, display_name, mailing_line1, mailing_line2, mailing_city,
  mailing_state, mailing_postal_code, mailing_country, first_seen_at
)
select distinct on (lower(o.buyer_email))
  lower(o.buyer_email),
  o.buyer_name,
  o.ship_line1, o.ship_line2, o.ship_city, o.ship_state, o.ship_zip, o.ship_country,
  o.created_at
from public.orders o
where o.buyer_email is not null
order by lower(o.buyer_email), o.created_at asc
on conflict (email) do update
  set display_name = coalesce(public.audience.display_name, excluded.display_name),
      mailing_line1 = coalesce(public.audience.mailing_line1, excluded.mailing_line1),
      mailing_line2 = coalesce(public.audience.mailing_line2, excluded.mailing_line2),
      mailing_city  = coalesce(public.audience.mailing_city, excluded.mailing_city),
      mailing_state = coalesce(public.audience.mailing_state, excluded.mailing_state),
      mailing_postal_code = coalesce(public.audience.mailing_postal_code, excluded.mailing_postal_code),
      mailing_country = coalesce(public.audience.mailing_country, excluded.mailing_country);

-- 8c. From purchases — catch any orphans (rare; orders should cover).
insert into public.audience (email, first_seen_at)
select distinct on (lower(p.buyer_email)) lower(p.buyer_email), p.created_at
from public.purchases p
where p.buyer_email is not null
order by lower(p.buyer_email), p.created_at asc
on conflict (email) do nothing;

-- 8d. Link auth.users → audience via existing emails.
update public.audience a
  set user_id = u.id
  from auth.users u
  where lower(a.email) = lower(u.email) and a.user_id is null;

-- 8e. Populate audience_id FKs on legacy tables.
update public.subscribers s
  set audience_id = a.id
  from public.audience a
  where lower(s.email) = a.email and s.audience_id is null;

update public.orders o
  set audience_id = a.id
  from public.audience a
  where lower(o.buyer_email) = a.email and o.audience_id is null;

update public.purchases p
  set audience_id = a.id
  from public.audience a
  where lower(p.buyer_email) = a.email and p.audience_id is null;

update public.campaign_sends cs
  set audience_id = a.id
  from public.audience a
  where lower(cs.email) = a.email and cs.audience_id is null;

-- 8f. Compute lifetime stats per audience row.
update public.audience a
  set lifetime_orders = stats.cnt,
      lifetime_spend = stats.spend,
      first_purchase_at = stats.first_at,
      last_purchase_at = stats.last_at
  from (
    select audience_id, count(*) as cnt, coalesce(sum(total), 0) as spend,
           min(created_at) as first_at, max(created_at) as last_at
    from public.orders
    where audience_id is not null
    group by audience_id
  ) stats
  where a.id = stats.audience_id;

-- 8g. Compute engagement counts per audience row.
update public.audience a
  set emails_received = stats.received,
      emails_opened = stats.opened,
      emails_clicked = stats.clicked,
      last_opened_at = stats.last_open,
      last_clicked_at = stats.last_click
  from (
    select cs.audience_id,
           count(*) filter (where cs.is_test = false) as received,
           count(*) filter (where cs.opened_at is not null and cs.is_test = false) as opened,
           count(*) filter (where cs.clicked_at is not null and cs.is_test = false) as clicked,
           max(cs.last_opened_at) filter (where cs.is_test = false) as last_open,
           max(cs.last_clicked_at) filter (where cs.is_test = false) as last_click
    from public.campaign_sends cs
    where cs.audience_id is not null
    group by cs.audience_id
  ) stats
  where a.id = stats.audience_id;

-- 8h. Insert historical audience_events rows.
-- Subscribe events.
insert into public.audience_events (audience_id, event_type, metadata, occurred_at)
select s.audience_id, 'subscribed', jsonb_build_object('source_page', s.source_page), s.created_at
from public.subscribers s where s.audience_id is not null;

-- Unsubscribe events (from subscribers table).
insert into public.audience_events (audience_id, event_type, occurred_at)
select s.audience_id, 'unsubscribed', s.unsubscribed_at
from public.subscribers s
where s.audience_id is not null and s.unsubscribed_at is not null;

-- Purchase events.
insert into public.audience_events (audience_id, event_type, metadata, occurred_at)
select o.audience_id,
       'purchased',
       jsonb_build_object('order_id', o.id, 'order_number', o.order_number, 'total', o.total),
       o.created_at
from public.orders o where o.audience_id is not null;

-- Email events from campaign_sends.
insert into public.audience_events (audience_id, event_type, metadata, occurred_at)
select cs.audience_id, 'email_sent', jsonb_build_object('campaign_id', cs.campaign_id), cs.sent_at
from public.campaign_sends cs
where cs.audience_id is not null and cs.sent_at is not null and cs.is_test = false;

insert into public.audience_events (audience_id, event_type, metadata, occurred_at)
select cs.audience_id, 'email_opened',
       jsonb_build_object('campaign_id', cs.campaign_id),
       cs.opened_at
from public.campaign_sends cs
where cs.audience_id is not null and cs.opened_at is not null and cs.is_test = false;

insert into public.audience_events (audience_id, event_type, metadata, occurred_at)
select cs.audience_id, 'email_clicked',
       jsonb_build_object('campaign_id', cs.campaign_id),
       cs.clicked_at
from public.campaign_sends cs
where cs.audience_id is not null and cs.clicked_at is not null and cs.is_test = false;

-- 8i. Initial tag + score refresh per audience row.
do $$
declare r record;
begin
  for r in select id from public.audience loop
    perform public.refresh_audience_tags(r.id);
  end loop;
end $$;
