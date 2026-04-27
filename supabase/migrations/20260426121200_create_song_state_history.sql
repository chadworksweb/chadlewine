-- Arc Radiant v1 / migration 13 of 14
-- Audit log for song_state changes. Application-level inserts only (no DB
-- trigger) — the Capture Drawer API handler logs after each state change
-- so it can capture the actor and source context.

CREATE TABLE IF NOT EXISTS song_state_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id uuid NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  prev_state text,
  new_state text,
  source text NOT NULL DEFAULT 'admin' CHECK (source IN ('admin','capture','migration')),
  note text,
  changed_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_song_state_history_song
  ON song_state_history(song_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_song_state_history_changed
  ON song_state_history(changed_at DESC);

ALTER TABLE song_state_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access song_state_history"
  ON song_state_history FOR ALL USING (auth.role() = 'authenticated');
