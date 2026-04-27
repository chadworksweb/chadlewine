-- Arc Radiant v1 / migration 11 of 14
-- Restores the eight rc_* classification columns on songs (dropped Apr 23 in
-- migration 20260423200000). Audit Q1 resolution: chadlewine stores RC
-- classifications denormalized so the Arc Compass Charge layer aggregates
-- without 150 live RC fetches per render. Staleness mitigated by webhook
-- push from RC: when a classification changes, RC POSTs to a chadlewine
-- endpoint that updates the affected song row. Per-song /music/songs/[slug]
-- pages continue to use live fetchBadge() for badge UI.
--
-- The sync log table here records what arrived from RC (debug/audit trail).
-- The webhook receiver itself is an API route, not a migration.

ALTER TABLE songs
  ADD COLUMN IF NOT EXISTS rc_tier TEXT,
  ADD COLUMN IF NOT EXISTS rc_charge INTEGER,
  ADD COLUMN IF NOT EXISTS rc_charge_summary TEXT,
  ADD COLUMN IF NOT EXISTS rc_contaminated BOOLEAN,
  ADD COLUMN IF NOT EXISTS rc_confidence NUMERIC,
  ADD COLUMN IF NOT EXISTS rc_calibrated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rc_song_source TEXT,
  ADD COLUMN IF NOT EXISTS rc_song_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_songs_rc_tier
  ON songs(rc_tier) WHERE rc_tier IS NOT NULL;
-- Partial index supports the Compass Charge year-aggregation query
-- (GROUP BY on release_date with rc_charge filter). A plain index on
-- release_date is enough; Postgres bucketizes at query time.
CREATE INDEX IF NOT EXISTS idx_songs_rc_aggregation
  ON songs(release_date)
  WHERE rc_charge IS NOT NULL AND instrumental = false;

CREATE TABLE IF NOT EXISTS rc_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id uuid REFERENCES songs(id) ON DELETE SET NULL,
  rc_song_id INTEGER,
  action text NOT NULL CHECK (action IN ('initial-ingest','webhook-update','manual-recalibrate')),
  payload jsonb,
  received_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rc_sync_log_song ON rc_sync_log(song_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_rc_sync_log_received ON rc_sync_log(received_at DESC);

ALTER TABLE rc_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access rc_sync_log"
  ON rc_sync_log FOR ALL USING (auth.role() = 'authenticated');
