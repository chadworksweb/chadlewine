-- Site settings table (key-value) for sitewide config
CREATE TABLE site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed the playback default
INSERT INTO site_settings (key, value) VALUES ('playback_mode', 'preview');

-- Per-song playback override (null = use sitewide default)
ALTER TABLE songs ADD COLUMN playback_mode TEXT DEFAULT NULL;

-- RLS: public read, no public write
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read site_settings" ON site_settings FOR SELECT USING (true);
