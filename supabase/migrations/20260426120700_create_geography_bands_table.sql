-- Arc Radiant v1 / migration 8 of 14
-- Where Chad lived in which window. date_start NOT NULL (a band must have a
-- start date); date_end nullable (current location). lat/lng skipped in v1.

CREATE TABLE IF NOT EXISTS geography_bands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  location_name text NOT NULL,
  region text,
  date_start date NOT NULL,
  date_end date,
  body_md text DEFAULT '',
  body_html text DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_geography_bands_dates
  ON geography_bands(date_start, date_end);
CREATE INDEX IF NOT EXISTS idx_geography_bands_status ON geography_bands(status);

CREATE TRIGGER geography_bands_updated_at BEFORE UPDATE ON geography_bands
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE geography_bands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read published geography_bands"
  ON geography_bands FOR SELECT USING (status = 'published');
CREATE POLICY "Admin full access geography_bands"
  ON geography_bands FOR ALL USING (auth.role() = 'authenticated');
