-- Give the Don't Blame Me album tracks their release date.
-- Eight of the eleven had a NULL song-level release_date.
-- The other three shipped as singles first, so the
-- IS NULL guard leaves their earlier true dates alone.
--
-- 2026-08-14 is the album's own release_date, so this
-- states a fact rather than ordering the homepage feed.
-- The feed picks the album by slug, not by date.
--
-- Scoped through release_songs rather than by song slug:
-- some of these titles are generic ("Thank You") and the
-- album membership is what actually defines the set.

update public.songs s
set release_date = r.release_date
from public.release_songs rs
join public.releases r on r.id = rs.release_id
where rs.song_id = s.id
  and r.slug = 'dont-blame-me'
  and s.release_date is null;
