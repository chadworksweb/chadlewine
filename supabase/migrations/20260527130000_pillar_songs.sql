-- Pillar Songs: the curated, hand-ordered shrine of Chad's own songs that he
-- resonates with most strongly. A single global list (not multiple lists), so
-- a flat junction keyed by song_id is enough -- a song is either in the shrine
-- or not, and position drives the altar order on /pillar-songs.

create table if not exists public.pillar_songs (
  song_id uuid primary key references public.songs(id) on delete cascade,
  position integer not null default 0,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_pillar_songs_position on public.pillar_songs (position);

-- Explicit grants (default grants are being removed from Supabase projects).
grant select on public.pillar_songs to anon, authenticated;
grant select, insert, update, delete on public.pillar_songs to service_role;

alter table public.pillar_songs enable row level security;

-- Public can read the membership rows; the song's own status still gates what
-- the public page renders (we only join published songs).
drop policy if exists "Public read pillar_songs" on public.pillar_songs;
create policy "Public read pillar_songs" on public.pillar_songs
  for select using (true);

drop policy if exists "Admin full access pillar_songs" on public.pillar_songs;
create policy "Admin full access pillar_songs" on public.pillar_songs
  for all using (true) with check (true);

-- Seed the initial 15 in Chad's stated order. Matched by slug; missing slugs
-- are skipped silently. Re-running is a no-op on existing rows.
insert into public.pillar_songs (song_id, position)
select s.id, x.position
from (values
  ('machine', 0),
  ('finding-freedom', 1),
  ('johnny-boy', 2),
  ('drawn-together', 3),
  ('cant-stop-us-now', 4),
  ('bounce', 5),
  ('freedom-ring', 6),
  ('higher-ground', 7),
  ('murphy', 8),
  ('fog-machine', 9),
  ('flipside', 10),
  ('lightbody', 11),
  ('everything-i-need', 12),
  ('were-here', 13),
  ('branching-out', 14)
) as x(slug, position)
join public.songs s on s.slug = x.slug
on conflict (song_id) do nothing;
