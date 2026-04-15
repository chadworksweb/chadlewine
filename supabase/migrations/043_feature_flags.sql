-- Feature flags for section-by-section launch control.
-- is_live=false → proxy.ts rewrites the section's paths to /preview on production.
-- Staging bypasses flags entirely (full site always visible when authenticated).

CREATE TABLE feature_flags (
  section TEXT PRIMARY KEY,
  is_live BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION feature_flags_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER feature_flags_updated_at
BEFORE UPDATE ON feature_flags
FOR EACH ROW EXECUTE FUNCTION feature_flags_set_updated_at();

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read feature_flags" ON feature_flags FOR SELECT USING (TRUE);
CREATE POLICY "Admin full access feature_flags" ON feature_flags FOR ALL USING (auth.role() = 'authenticated');

INSERT INTO feature_flags (section, is_live) VALUES
  ('observations', FALSE),
  ('meditations', FALSE),
  ('music', FALSE),
  ('curation', FALSE),
  ('art', FALSE),
  ('video', FALSE),
  ('lyrics', FALSE),
  ('foundations', FALSE),
  ('doors', FALSE),
  ('chad-lewine', FALSE),
  ('thinking', FALSE)
ON CONFLICT (section) DO NOTHING;
