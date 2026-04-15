-- Junction: door pages ↔ songs
-- A door page can feature an ordered list of songs as funnel targets.
create table if not exists public.door_page_songs (
  door_page_id uuid not null references public.door_pages(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  position int not null default 0,
  created_at timestamptz not null default now(),
  primary key (door_page_id, song_id)
);

create index if not exists door_page_songs_door_page_id_idx
  on public.door_page_songs(door_page_id, position);

create index if not exists door_page_songs_song_id_idx
  on public.door_page_songs(song_id);

alter table public.door_page_songs enable row level security;

create policy "door_page_songs readable when door is published"
  on public.door_page_songs for select
  using (
    exists (
      select 1 from public.door_pages dp
      where dp.id = door_page_songs.door_page_id
        and dp.status = 'published'
    )
  );
