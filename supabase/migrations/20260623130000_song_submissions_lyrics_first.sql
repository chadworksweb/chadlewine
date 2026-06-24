-- Call for Music is read by lyrics, not audio. The song must be publicly
-- available in any format, but the submitted artifact is the lyrics -- that is
-- what Rising Compass reads. Drop the streaming link and require lyrics.

alter table public.song_submissions
  drop column if exists streaming_url;

alter table public.song_submissions
  alter column lyrics set not null;
