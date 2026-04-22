-- Rising Compass classification fields on songs.
-- Populated by the backfill ingest script (scripts/ingest-rc-results.ts) from
-- chadlewine_results_merged.json. All nullable — absence means "not classified".
--
-- rc_tier          raw color: violet | blue | green | orange | red (matches RC's rubric_color)
-- rc_charge        signed integer -100..+100
-- rc_charge_summary one-line human explanation from the calibrator
-- rc_contaminated  true if the calibrator flagged contamination
-- rc_confidence    0.0..1.0 — calibrator self-reported confidence
-- rc_calibrated_at when the classification ran (UTC)
-- rc_song_source   RC-side canonical source: "submitted" | "library" | "compass" | "stream"
-- rc_song_id       RC-side row id inside the canonical source table (so chadlewine
--                  can re-pull consensus for any given song without a fuzzy title match)

ALTER TABLE songs
  ADD COLUMN IF NOT EXISTS rc_tier TEXT,
  ADD COLUMN IF NOT EXISTS rc_charge INTEGER,
  ADD COLUMN IF NOT EXISTS rc_charge_summary TEXT,
  ADD COLUMN IF NOT EXISTS rc_contaminated BOOLEAN,
  ADD COLUMN IF NOT EXISTS rc_confidence NUMERIC,
  ADD COLUMN IF NOT EXISTS rc_calibrated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rc_song_source TEXT,
  ADD COLUMN IF NOT EXISTS rc_song_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_songs_rc_tier ON songs (rc_tier) WHERE rc_tier IS NOT NULL;
