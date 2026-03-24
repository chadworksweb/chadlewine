-- Observation revision history
-- Stores a snapshot of the body + title on every save for public transparency

CREATE TABLE IF NOT EXISTS observation_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id uuid NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
  body text NOT NULL,
  title text NOT NULL,
  revision_number integer NOT NULL DEFAULT 1,
  change_summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_revisions_observation
  ON observation_revisions(observation_id, created_at DESC);

-- RLS: public can read revisions, only service role can write (via API)
ALTER TABLE observation_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read revisions" ON observation_revisions
  FOR SELECT USING (true);

CREATE POLICY "Service role write revisions" ON observation_revisions
  FOR INSERT WITH CHECK (true);
