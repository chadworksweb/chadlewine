-- Add 'unreleased' status to songs + albums.
-- Semantics:
--   draft       = admin-only, never publicly visible
--   unreleased  = publicly LISTABLE (appears in indexes like /music/songs), but
--                 click-through behavior is per-row (albums always open; album
--                 tracks don't; singles always open).
--   published   = fully released, everything accessible.

-- Songs: the CHECK constraint was inherited from the original `tracks` table
-- rename in migration 023, so try both possible constraint names.
ALTER TABLE songs DROP CONSTRAINT IF EXISTS songs_status_check;
ALTER TABLE songs DROP CONSTRAINT IF EXISTS tracks_status_check;
ALTER TABLE songs ADD CONSTRAINT songs_status_check
  CHECK (status IN ('draft', 'unreleased', 'published'));

-- Albums
ALTER TABLE albums DROP CONSTRAINT IF EXISTS albums_status_check;
ALTER TABLE albums ADD CONSTRAINT albums_status_check
  CHECK (status IN ('draft', 'unreleased', 'published'));

-- RLS: allow public read of unreleased + published rows.
-- Policy names differ because `tracks` was renamed to `songs` — drop both variants.
DROP POLICY IF EXISTS "Public can read published albums" ON albums;
DROP POLICY IF EXISTS "Public can read published tracks" ON songs;
DROP POLICY IF EXISTS "Public can read published songs" ON songs;

CREATE POLICY "Public read releasable albums" ON albums
  FOR SELECT USING (status IN ('unreleased', 'published'));

CREATE POLICY "Public read releasable songs" ON songs
  FOR SELECT USING (status IN ('unreleased', 'published'));
