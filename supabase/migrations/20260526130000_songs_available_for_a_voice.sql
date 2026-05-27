-- Curated "available for a voice" set + order for the Songwriting page grid.
-- Managed from /admin/songwriting.

alter table public.songs
  add column if not exists available_for_a_voice boolean not null default false,
  add column if not exists voice_display_order integer not null default 0;

create index if not exists idx_songs_available_for_a_voice
  on public.songs (voice_display_order)
  where available_for_a_voice = true;
