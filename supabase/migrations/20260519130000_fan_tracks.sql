-- "For my fans" gated tracks. Track-by-track grants, per-user-per-track
-- tokens, separate from the /fan-song fan_ode_token system.
--
-- Eligibility rule for v1: anyone with lifetime_orders >= 1. Grants are
-- minted on purchase (in upsertAudienceFromPurchase) and on publish
-- (backfill script). The grant row carries the token; the page gates on
-- session + token + grant lookup.

-- ============================================================
-- 1. fan_tracks -- one row per gated track (for-my-fans-01, -02, ...).
-- ============================================================
create table if not exists public.fan_tracks (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  artist_credit text not null default 'Chad Lewine',
  duration_seconds int,

  -- Optional cover art. Empty/null = the page renders a placeholder mark.
  cover_art_path text,

  -- HLS playlist relative path in the Bunny fan-tracks storage zone
  -- (e.g. "for-my-fans-01/playlist.m3u8"). The manifest API route fetches
  -- it via signed URL, rewrites segment + key URIs, and serves to client.
  hls_playlist_path text not null,

  -- AES-128 encryption key, base64-encoded. NEVER uploaded to Bunny. The
  -- key API route reads this and serves the raw 16-byte key to hls.js,
  -- gated on session + token + grant.
  hls_key_b64 text not null,

  -- Eligibility rule. Default v1 rule is {"kind":"lifetime_orders_gte","n":1}.
  -- Stored as JSON so future rules (tag-based, manual list, etc.) can be
  -- swapped in without a schema change.
  eligibility_rule jsonb not null default jsonb_build_object('kind', 'lifetime_orders_gte', 'n', 1),

  is_published boolean not null default false,
  published_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fan_tracks_slug on public.fan_tracks (slug);
create index if not exists idx_fan_tracks_is_published on public.fan_tracks (is_published);

grant select, insert, update, delete on public.fan_tracks to service_role;
grant select on public.fan_tracks to authenticated;

alter table public.fan_tracks enable row level security;

drop policy if exists "Admin all fan_tracks" on public.fan_tracks;
create policy "Admin all fan_tracks" on public.fan_tracks
  for all to authenticated using (true) with check (true);

-- The "Fan self-read granted fan_tracks" policy is added below, after
-- fan_track_grants exists -- the policy expression references that table.

-- ============================================================
-- 2. fan_track_grants -- one row per (audience, track). Carries the token.
-- ============================================================
create table if not exists public.fan_track_grants (
  id uuid primary key default gen_random_uuid(),
  fan_track_id uuid not null references public.fan_tracks(id) on delete cascade,
  audience_id uuid not null references public.audience(id) on delete cascade,

  -- 32-byte url-safe random token, minted at grant time. Goes into the
  -- /for-my-fans-XX?token=... URL.
  token text not null unique,

  granted_at timestamptz not null default now(),
  granted_via text not null default 'purchase',  -- 'purchase' | 'manual' | 'backfill'

  -- Email send state. Tracks whether we've already invited this grantee.
  invite_email_sent_at timestamptz,

  -- Play tracking.
  first_played_at timestamptz,
  last_played_at timestamptz,
  play_count int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (fan_track_id, audience_id)
);

create index if not exists idx_fan_track_grants_audience on public.fan_track_grants (audience_id);
create index if not exists idx_fan_track_grants_track on public.fan_track_grants (fan_track_id);
create index if not exists idx_fan_track_grants_token on public.fan_track_grants (token);

grant select, insert, update, delete on public.fan_track_grants to service_role;
grant select on public.fan_track_grants to authenticated;

alter table public.fan_track_grants enable row level security;

drop policy if exists "Admin all fan_track_grants" on public.fan_track_grants;
create policy "Admin all fan_track_grants" on public.fan_track_grants
  for all to authenticated using (true) with check (true);

-- Customer self-read: a logged-in fan can see their own grants on the
-- /account dashboard.
drop policy if exists "Fan self-read fan_track_grants" on public.fan_track_grants;
create policy "Fan self-read fan_track_grants" on public.fan_track_grants
  for select to authenticated using (
    audience_id in (select id from public.audience where user_id = auth.uid())
  );

-- ============================================================
-- 3. Deferred policy on fan_tracks that references fan_track_grants.
-- A logged-in fan can see fan_tracks rows for which they have a grant.
-- They cannot list the catalog; this only gates the per-row read used by
-- the gated page + dashboard card.
-- ============================================================
drop policy if exists "Fan self-read granted fan_tracks" on public.fan_tracks;
create policy "Fan self-read granted fan_tracks" on public.fan_tracks
  for select to authenticated using (
    id in (
      select fan_track_id from public.fan_track_grants
      where audience_id in (
        select id from public.audience where user_id = auth.uid()
      )
    )
  );

-- ============================================================
-- 4. Touch the AudienceDetail timeline.
-- audience_events.event_type is a free-form text column, so no enum to
-- extend -- the new event types just need to be referenced by EVENT_LABELS
-- in src/components/AudienceDetail.tsx (handled in the same PR).
-- Documented here so future migrations don't try to add a constraint.
-- ============================================================
comment on column public.audience_events.event_type is
  'Free-form text. Known values: subscribed, unsubscribed, resubscribed, purchased, email_sent, email_delivered, email_opened, email_clicked, email_bounced, email_complained, tag_added, tag_removed, note_added, mailing_address_updated, profile_updated, account_created, account_linked, coupon_claimed, coupon_redeemed, fan_track_granted, fan_track_played.';
