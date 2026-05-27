-- Song credits: ordered credit lines (role + name) shown on the song detail
-- page after the lyrics. Role is a stable slug (see src/lib/song-credits.ts);
-- name is free text (a person, alias, or studio).

create table if not exists public.song_credits (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs(id) on delete cascade,
  role text not null,
  name text not null,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_song_credits_song on public.song_credits (song_id);

drop trigger if exists song_credits_updated_at on public.song_credits;
create trigger song_credits_updated_at before update on public.song_credits
  for each row execute function update_updated_at();

-- Explicit grants (default grants are being removed from Supabase projects).
grant select on public.song_credits to anon, authenticated;
grant select, insert, update, delete on public.song_credits to service_role;

alter table public.song_credits enable row level security;

-- Credits are public the moment they exist; the song's own status gates the
-- detail page, so no per-credit status is needed.
drop policy if exists "Public read song_credits" on public.song_credits;
create policy "Public read song_credits" on public.song_credits
  for select using (true);

drop policy if exists "Admin full access song_credits" on public.song_credits;
create policy "Admin full access song_credits" on public.song_credits
  for all using (true) with check (true);
