-- Arc Radiant v1 / migration 2 of 14
-- Adds nullable write_date to songs. Manually populated only — no inference,
-- no precision field. NULL means unknown; arc renders release_date for
-- null-write_date songs.
--
-- Use case (locked): Dark Nights and similar — written one year, released
-- another. Dual-time reading on the arc requires an explicit field.

ALTER TABLE songs
  ADD COLUMN IF NOT EXISTS write_date DATE;

CREATE INDEX IF NOT EXISTS idx_songs_write_date ON songs(write_date) WHERE write_date IS NOT NULL;
