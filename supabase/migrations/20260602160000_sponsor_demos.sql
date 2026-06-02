-- Sponsor demos.
--
-- A demo song can carry one of two demo mechanics, selected by songs.demo_type:
--   'vote'    = the existing vote-to-push mechanic (song_votes). Default.
--   'sponsor' = paid sponsorship into a production (this migration).
--
-- A sponsorable demo is set up once, as exactly one production target, and that
-- target never changes:
--   beat          = "easy in". External producer / leased beat. Goal fixed at $250.
--   full + remote = Chad's vision, remote producer (custom beat + pro mix/master).
--                   Goal floor $2000.
--   full + studio = Chad's vision, in studio. Goal floor $5000.
--
-- Funding is one pooled total per song. A buy-out is a single contribution that
-- meets the goal; a group funds it in chips. funded_at stamps the moment
-- raised_cents >= goal_cents; after that the sponsorship stops accepting
-- contributions (no overage) and Chad is notified by email. Funds are gated
-- operationally (Stripe manual payouts) -- there is no auto refund path; money
-- is collected up front and held against the production, no refunds.
--
-- Rewards (delivered at release, not here): production credit (no royalty) via
-- song_credits, plus early access to the finished production.

-- 1) Demo type flag on songs.
alter table public.songs
  add column if not exists demo_type text not null default 'vote'
    check (demo_type in ('vote', 'sponsor'));

-- 2) song_sponsorships -- one row per sponsorable demo song.
create table if not exists public.song_sponsorships (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null unique references public.songs(id) on delete cascade,
  production_type text not null check (production_type in ('beat', 'full')),
  -- null for beat; 'remote' or 'studio' for full.
  production_mode text check (production_mode in ('remote', 'studio')),
  -- Public goal in cents. Beat is fixed at 25000 ($250); full floors enforced.
  goal_cents integer not null,
  -- Internal cost basis in cents (margin = goal_cents - cost_cents). Admin-only;
  -- never exposed through the public view.
  cost_cents integer,
  raised_cents integer not null default 0,
  backer_count integer not null default 0,
  funded_at timestamptz,
  status text not null default 'open'
    check (status in ('open', 'funded', 'in_production', 'released')),
  -- Per-song on/off. When false the public widget shows paused and the sponsor
  -- route rejects -- without deleting the config or any raised funds.
  enabled boolean not null default true,
  early_access_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Type/mode/goal coherence + floors. Beat is fixed at $250 with no mode;
  -- full requires a mode and a floor ($2000 remote, $5000 studio).
  constraint song_sponsorships_type_goal_check check (
    (production_type = 'beat' and production_mode is null and goal_cents = 25000)
    or (production_type = 'full' and production_mode = 'remote' and goal_cents >= 200000)
    or (production_type = 'full' and production_mode = 'studio' and goal_cents >= 500000)
  )
);

create index if not exists idx_song_sponsorships_status on public.song_sponsorships (status);

drop trigger if exists song_sponsorships_updated_at on public.song_sponsorships;
create trigger song_sponsorships_updated_at before update on public.song_sponsorships
  for each row execute function update_updated_at();

alter table public.song_sponsorships enable row level security;

-- Base table is admin/service only. The public reads the cost-free view below,
-- so cost_cents (margin) never leaves the server.
grant select, insert, update, delete on public.song_sponsorships to service_role;
grant select, insert, update, delete on public.song_sponsorships to authenticated;

drop policy if exists "Admin full access song_sponsorships" on public.song_sponsorships;
create policy "Admin full access song_sponsorships" on public.song_sponsorships
  for all to authenticated using (true) with check (true);

-- 3) Public view -- everything the sponsor UI needs, minus cost_cents.
--    Definer view (default) so anon can read goal/raised without a base grant.
create or replace view public.song_sponsorships_public as
  select
    id,
    song_id,
    production_type,
    production_mode,
    goal_cents,
    raised_cents,
    backer_count,
    funded_at,
    status,
    enabled,
    early_access_note
  from public.song_sponsorships;

grant select on public.song_sponsorships_public to anon, authenticated;

-- 4) sponsor_contributions -- one row per confirmed payment (written by the
--    Stripe webhook). Account required: every contribution links an audience row.
create table if not exists public.sponsor_contributions (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs(id) on delete cascade,
  sponsorship_id uuid not null references public.song_sponsorships(id) on delete cascade,
  audience_id uuid not null references public.audience(id) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  -- How the sponsor wants to be credited (no royalty). NULL = use account name.
  credit_name text,
  is_anonymous boolean not null default false,
  -- Optional rework request for full productions (e.g. "acoustic version").
  request_note text,
  stripe_payment_intent_id text,
  -- Unique so a redelivered webhook can't double-count a payment.
  stripe_session_id text unique,
  created_at timestamptz not null default now()
);

create index if not exists idx_sponsor_contributions_song on public.sponsor_contributions (song_id);
create index if not exists idx_sponsor_contributions_sponsorship on public.sponsor_contributions (sponsorship_id);
create index if not exists idx_sponsor_contributions_audience on public.sponsor_contributions (audience_id);

alter table public.sponsor_contributions enable row level security;

-- Service role writes (webhook) and reads (admin). No anon access -- contributor
-- emails and amounts stay server-side; the account page reads via the server.
grant select, insert, update, delete on public.sponsor_contributions to service_role;
grant select on public.sponsor_contributions to authenticated;

drop policy if exists "Admin read sponsor_contributions" on public.sponsor_contributions;
create policy "Admin read sponsor_contributions" on public.sponsor_contributions
  for select to authenticated using (true);
