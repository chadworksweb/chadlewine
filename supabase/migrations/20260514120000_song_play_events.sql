create table public.song_play_events (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs(id) on delete cascade,
  played_at timestamptz not null default now(),
  seconds_played int not null default 0,
  completed boolean not null default false,
  client_hash text,
  referrer text
);

create index song_play_events_song_played_at_idx
  on public.song_play_events (song_id, played_at desc);

create index song_play_events_played_at_idx
  on public.song_play_events (played_at desc);

alter table public.song_play_events enable row level security;

grant select, insert on public.song_play_events to service_role;
