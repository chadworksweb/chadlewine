-- Arc Radiant v1 / migration 6 of 14
-- First-class arc nodes. Documentary-script ingest produces source='documentary'
-- rows; Capture Drawer produces source='captured' rows. Documentary rows are
-- read-only in admin (UI rule + API guard); a CHECK on source enforces the
-- enum so the data field can't drift.

CREATE TABLE IF NOT EXISTS life_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  date_start date,
  date_end date,
  date_precision text CHECK (date_precision IN ('year','month','day')),
  era_id uuid REFERENCES eras(id) ON DELETE SET NULL,
  body_md text DEFAULT '',
  body_html text DEFAULT '',
  source text NOT NULL DEFAULT 'captured' CHECK (source IN ('documentary','captured')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  display_order integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_life_events_dates ON life_events(date_start, date_end);
CREATE INDEX IF NOT EXISTS idx_life_events_era ON life_events(era_id) WHERE era_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_life_events_source ON life_events(source);
CREATE INDEX IF NOT EXISTS idx_life_events_status ON life_events(status);

CREATE TRIGGER life_events_updated_at BEFORE UPDATE ON life_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE life_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read published life_events"
  ON life_events FOR SELECT USING (status = 'published');
CREATE POLICY "Admin full access life_events"
  ON life_events FOR ALL USING (auth.role() = 'authenticated');
