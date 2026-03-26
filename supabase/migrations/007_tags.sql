CREATE TABLE tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  label text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE observation_tags (
  observation_id uuid REFERENCES observations(id) ON DELETE CASCADE,
  tag_id uuid REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (observation_id, tag_id)
);

CREATE INDEX idx_tags_slug ON tags(slug);
CREATE INDEX idx_observation_tags_tag ON observation_tags(tag_id);

-- RLS
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE observation_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read tags" ON tags FOR SELECT USING (true);
CREATE POLICY "Public can read observation_tags" ON observation_tags FOR SELECT USING (true);
CREATE POLICY "Admin full access tags" ON tags FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin full access observation_tags" ON observation_tags FOR ALL USING (auth.role() = 'authenticated');
