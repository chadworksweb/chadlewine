-- Switch the anonymous play gate from count-on-start to count-on-threshold.
-- The /api/play/gate route now CHECKS the count on play-press (read-only) and
-- only RECORDS a play once the listener has heard 30 seconds (the threshold is
-- enforced client-side in PlayerContext, which calls action:"record" at 30s).
--
-- This function is the atomic insert-or-increment for the record step. It has
-- no cap of its own: the cap is enforced by the read-only check on press, and
-- a blocked play never starts, so it never records. The old combined
-- check-and-increment function (anon_song_play_gate) is no longer used.

create or replace function public.anon_song_play_record(
  p_song_id uuid,
  p_client_hash text
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.anon_song_plays (song_id, client_hash, play_count, first_played_at, last_played_at)
  values (p_song_id, p_client_hash, 1, now(), now())
  on conflict (song_id, client_hash) do update
    set play_count = public.anon_song_plays.play_count + 1,
        last_played_at = now()
  returning play_count into v_count;
  return v_count;
end;
$$;

revoke execute on function public.anon_song_play_record(uuid, text) from public;
grant execute on function public.anon_song_play_record(uuid, text) to service_role;

drop function if exists public.anon_song_play_gate(uuid, text, int);
