-- Drop all stored Rising Compass classification columns.
--
-- RC is authoritative for tier / charge / summary / contamination. chadlewine
-- now reads those fields live via fetchBadge() at render time (24h cache with
-- pending-aware bypass in src/lib/rising-compass.ts). Storing a local copy
-- meant recalibrations on RC lagged behind the chadlewine display until the
-- next ingest run — a worse UX for users and a violation of the ownership
-- model (chadlewine doesn't own the score; RC does).
--
-- Scope:
--   songs.*                — dead columns (no code reads them; ingest script
--                            populated them but was unused). Safe drop.
--   cl_stream_songs.*      — read by the CL Stream feed + homepage + admin
--                            list. All three switched to live fetchBadge in
--                            the same commit. Safe drop.
--
-- Retires: scripts/ingest-rc-classifications.ts, deleted in the same commit.

-- songs table: all rc_* classification columns
ALTER TABLE songs DROP COLUMN IF EXISTS rc_tier;
ALTER TABLE songs DROP COLUMN IF EXISTS rc_charge;
ALTER TABLE songs DROP COLUMN IF EXISTS rc_charge_summary;
ALTER TABLE songs DROP COLUMN IF EXISTS rc_contaminated;
ALTER TABLE songs DROP COLUMN IF EXISTS rc_confidence;
ALTER TABLE songs DROP COLUMN IF EXISTS rc_calibrated_at;
ALTER TABLE songs DROP COLUMN IF EXISTS rc_song_source;
ALTER TABLE songs DROP COLUMN IF EXISTS rc_song_id;

-- cl_stream_songs table: rc_* columns (different names than songs table)
ALTER TABLE cl_stream_songs DROP COLUMN IF EXISTS rc_color;
ALTER TABLE cl_stream_songs DROP COLUMN IF EXISTS rc_charge;
ALTER TABLE cl_stream_songs DROP COLUMN IF EXISTS rc_contaminated;
ALTER TABLE cl_stream_songs DROP COLUMN IF EXISTS rc_charge_summary;

-- If the songs table had an idx_songs_rc_tier index from the earlier
-- migration, it goes away with the column. Best-effort drop in case
-- Postgres kept it as a partial orphan:
DROP INDEX IF EXISTS idx_songs_rc_tier;
