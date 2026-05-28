-- Per-pillar glitch assignment. Each pillar song gets its own glitch id; the
-- public LCD shader maps id -> one of four base archetypes (id-1 mod 4) plus an
-- id-seeded variation, so every pillar's glitch is unique. Admin can reassign.

alter table public.pillar_songs add column if not exists glitch_id integer not null default 1;

-- Seed existing rows with sequential ids in their current order (1..N).
with ordered as (
  select song_id, row_number() over (order by position) as rn
  from public.pillar_songs
)
update public.pillar_songs p
set glitch_id = o.rn
from ordered o
where o.song_id = p.song_id;
