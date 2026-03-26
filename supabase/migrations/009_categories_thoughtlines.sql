-- Replace thoughts with thoughtlines + add categories
-- Thoughtlines: recurring thematic positions (replaces thoughts)
-- Categories: flat topical buckets (resurrects domains concept, fresh data)

-- Drop thoughts
DROP TABLE IF EXISTS observation_thoughts CASCADE;
DROP TABLE IF EXISTS tldr_thoughts CASCADE;
DROP TABLE IF EXISTS thoughts CASCADE;

-- Categories (simple: title + slug, no description)
CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE observation_categories (
  observation_id uuid REFERENCES observations(id) ON DELETE CASCADE,
  category_id uuid REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (observation_id, category_id)
);

-- Thoughtlines (rich: title + slug + description)
CREATE TABLE thoughtlines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE observation_thoughtlines (
  observation_id uuid REFERENCES observations(id) ON DELETE CASCADE,
  thoughtline_id uuid REFERENCES thoughtlines(id) ON DELETE CASCADE,
  PRIMARY KEY (observation_id, thoughtline_id)
);

-- RLS
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE observation_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE thoughtlines ENABLE ROW LEVEL SECURITY;
ALTER TABLE observation_thoughtlines ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "Public can read categories" ON categories FOR SELECT USING (true);
CREATE POLICY "Public can read observation_categories" ON observation_categories FOR SELECT USING (true);
CREATE POLICY "Public can read thoughtlines" ON thoughtlines FOR SELECT USING (true);
CREATE POLICY "Public can read observation_thoughtlines" ON observation_thoughtlines FOR SELECT USING (true);

-- Admin full access
CREATE POLICY "Admin full access categories" ON categories FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin full access observation_categories" ON observation_categories FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin full access thoughtlines" ON thoughtlines FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin full access observation_thoughtlines" ON observation_thoughtlines FOR ALL USING (auth.role() = 'authenticated');

-- Indexes
CREATE INDEX idx_observation_categories_cat ON observation_categories(category_id);
CREATE INDEX idx_observation_thoughtlines_tl ON observation_thoughtlines(thoughtline_id);
