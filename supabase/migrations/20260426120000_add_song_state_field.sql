-- Arc Radiant v1 / migration 1 of 14
-- Adds catalog-state field to songs, parallel to (and decoupled from)
-- the existing status visibility gate. Public queries continue to read
-- status; arc/timeline queries read song_state. Backfill: published to
-- released, unreleased to unreleased, draft stays NULL for manual review.

ALTER TABLE songs
  ADD COLUMN IF NOT EXISTS song_state TEXT
    CHECK (song_state IN ('demo','released','unreleased','reissued','in-progress','lost','shelved'));

UPDATE songs SET song_state = 'released'   WHERE status = 'published'  AND song_state IS NULL;
UPDATE songs SET song_state = 'unreleased' WHERE status = 'unreleased' AND song_state IS NULL;
-- status='draft' rows: leave song_state NULL for manual classification

CREATE INDEX IF NOT EXISTS idx_songs_song_state ON songs(song_state) WHERE song_state IS NOT NULL;
