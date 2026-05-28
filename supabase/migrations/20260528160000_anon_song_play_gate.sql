-- Anonymous per-song play gate.
-- Caps how many times a not-logged-in device can START playback of a given
-- song. The device is identified by a hash of IP + User-Agent (the same shape
-- used by song_play_events). Logged-in fans are exempt: the /api/play/gate
-- route short-circuits before it ever touches this table.
--
-- This mirrors the device-gate pattern from the chadrising World Pass system,
-- but keyed per (song, device) play-count instead of a global listening-time
-- budget. IP + UA is a soft fingerprint, so the cap naturally resets when a
-- device changes networks; it is a friction gate, not DRM.

create table public.anon_song_plays (
  song_id uuid not null references public.songs(id) on delete cascade,
  client_hash text not null,
  play_count int not null default 0,
  first_played_at timestamptz not null default now(),
  last_played_at timestamptz not null default now(),
  primary key (song_id, client_hash)
);

create index anon_song_plays_last_played_at_idx
  on public.anon_song_plays (last_played_at);

alter table public.anon_song_plays enable row level security;

grant select, insert, update on public.anon_song_plays to service_role;

-- Atomic check-and-increment for a single device + song.
-- Locks the device row (FOR UPDATE) so concurrent presses cannot race past the
-- cap, then:
--   - if the device is already at/over p_limit, returns blocked = true WITHOUT
--     incrementing (the cap can never be exceeded);
--   - otherwise increments play_count and returns blocked = false.
-- Returns exactly one row: (blocked, plays) where plays is the resulting count.
create or replace function public.anon_song_play_gate(
  p_song_id uuid,
  p_client_hash text,
  p_limit int
)
returns table (blocked boolean, plays int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.anon_song_plays (song_id, client_hash, play_count)
  values (p_song_id, p_client_hash, 0)
  on conflict (song_id, client_hash) do nothing;

  select play_count into v_count
  from public.anon_song_plays
  where song_id = p_song_id and client_hash = p_client_hash
  for update;

  if v_count >= p_limit then
    blocked := true;
    plays := v_count;
    return next;
    return;
  end if;

  update public.anon_song_plays
  set play_count = v_count + 1,
      last_played_at = now()
  where song_id = p_song_id and client_hash = p_client_hash;

  blocked := false;
  plays := v_count + 1;
  return next;
end;
$$;

-- Lock the function down to the service role only. Functions in the public
-- schema are otherwise auto-exposed via PostgREST (/rpc/) and executable by
-- anon/authenticated by default; this is SECURITY DEFINER, so only our
-- server-side admin client should ever call it.
revoke execute on function public.anon_song_play_gate(uuid, text, int) from public;
grant execute on function public.anon_song_play_gate(uuid, text, int) to service_role;
