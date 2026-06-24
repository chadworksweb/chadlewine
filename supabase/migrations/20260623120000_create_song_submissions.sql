-- Call for Music submissions. Public, evergreen intake: artists submit their
-- highest-vibe songs to be considered for the curated positive song database.
-- This is a call for submission, not a contest -- Rising Compass measures the
-- charge, Chad Lewine curates what enters the canon.
--
-- Service-role only: the /api/call-for-music route uses the service-role
-- client, which bypasses RLS. No anon/authenticated access -- rows hold PII
-- (submitter contact info). Same shape/posture as booking_inquiries.

create table if not exists public.song_submissions (
  id uuid primary key default gen_random_uuid(),
  -- The submitted song.
  song_title text not null,
  artist_name text not null,
  -- Public streaming link. Required: the song must be publicly streamable at
  -- submission time so RC can read it and Chad can verify availability.
  streaming_url text not null,
  -- Optional lyrics paste or a note about the song / intention.
  lyrics text,
  note text,
  -- Who submitted, so Chad can follow up.
  submitter_name text not null,
  submitter_email text not null,
  -- The submitter confirmed the song is publicly available right now.
  available_confirmed boolean not null default false,
  -- Curation lifecycle: new -> curated (accepted into the database) | declined.
  status text not null default 'new',
  -- Chad's private curation note (why accepted / declined).
  curator_note text,
  ip text,
  user_agent text,
  referer text,
  source text not null default 'call-for-music',
  created_at timestamptz not null default now()
);

create index if not exists idx_song_submissions_created on public.song_submissions (created_at desc);
create index if not exists idx_song_submissions_status on public.song_submissions (status);
create index if not exists idx_song_submissions_email on public.song_submissions ((lower(submitter_email)));

alter table public.song_submissions enable row level security;

-- No policies for anon/authenticated, so only service_role (which bypasses
-- RLS) can read or write. Explicit grants per project convention.
revoke all on public.song_submissions from anon, authenticated;
grant all on public.song_submissions to service_role;
