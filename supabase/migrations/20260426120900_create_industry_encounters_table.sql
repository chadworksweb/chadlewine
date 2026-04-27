-- Arc Radiant v1 / migration 10 of 14
-- Music-industry interactions as arc-visible events: Warner office visits,
-- major-label flirtations, single-selection moments, etc.
-- outcome is free text (not enum) — outcomes vary too much to constrain.

CREATE TABLE IF NOT EXISTS industry_encounters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  date date,
  counterparty text,
  outcome text,
  body_md text DEFAULT '',
  body_html text DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_industry_encounters_date ON industry_encounters(date);
CREATE INDEX IF NOT EXISTS idx_industry_encounters_status ON industry_encounters(status);

CREATE TRIGGER industry_encounters_updated_at BEFORE UPDATE ON industry_encounters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE industry_encounters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read published industry_encounters"
  ON industry_encounters FOR SELECT USING (status = 'published');
CREATE POLICY "Admin full access industry_encounters"
  ON industry_encounters FOR ALL USING (auth.role() = 'authenticated');
