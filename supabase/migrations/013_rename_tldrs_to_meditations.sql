-- Rename tldrs → meditations
-- Content type rename: TLDRs are now Meditations (short-form counterpart to Observations)

ALTER TABLE tldrs RENAME TO meditations;

-- Rename indexes
ALTER INDEX idx_tldrs_status RENAME TO idx_meditations_status;
ALTER INDEX idx_tldrs_published RENAME TO idx_meditations_published;

-- Rename trigger
ALTER TRIGGER tldrs_updated_at ON meditations RENAME TO meditations_updated_at;

-- Drop stale RLS policies and recreate with new names
DROP POLICY IF EXISTS "Public can read published tldrs" ON meditations;
DROP POLICY IF EXISTS "Admin full access tldrs" ON meditations;

CREATE POLICY "Public can read published meditations" ON meditations FOR SELECT USING (status = 'published');
CREATE POLICY "Admin full access meditations" ON meditations FOR ALL USING (auth.role() = 'authenticated');

-- NOTE: merch_submissions.source_tldr_id rename deferred — table doesn't exist yet (merch phase not built)

-- Junction tables for meditations (categories, thoughtlines, tags)
CREATE TABLE meditation_categories (
  meditation_id uuid REFERENCES meditations(id) ON DELETE CASCADE,
  category_id uuid REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (meditation_id, category_id)
);

CREATE TABLE meditation_thoughtlines (
  meditation_id uuid REFERENCES meditations(id) ON DELETE CASCADE,
  thoughtline_id uuid REFERENCES thoughtlines(id) ON DELETE CASCADE,
  PRIMARY KEY (meditation_id, thoughtline_id)
);

CREATE TABLE meditation_tags (
  meditation_id uuid REFERENCES meditations(id) ON DELETE CASCADE,
  tag_id uuid REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (meditation_id, tag_id)
);

-- RLS
ALTER TABLE meditation_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE meditation_thoughtlines ENABLE ROW LEVEL SECURITY;
ALTER TABLE meditation_tags ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "Public can read meditation_categories" ON meditation_categories FOR SELECT USING (true);
CREATE POLICY "Public can read meditation_thoughtlines" ON meditation_thoughtlines FOR SELECT USING (true);
CREATE POLICY "Public can read meditation_tags" ON meditation_tags FOR SELECT USING (true);

-- Admin full access
CREATE POLICY "Admin full access meditation_categories" ON meditation_categories FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin full access meditation_thoughtlines" ON meditation_thoughtlines FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin full access meditation_tags" ON meditation_tags FOR ALL USING (auth.role() = 'authenticated');

-- Indexes
CREATE INDEX idx_meditation_categories_cat ON meditation_categories(category_id);
CREATE INDEX idx_meditation_thoughtlines_tl ON meditation_thoughtlines(thoughtline_id);
CREATE INDEX idx_meditation_tags_tag ON meditation_tags(tag_id);
