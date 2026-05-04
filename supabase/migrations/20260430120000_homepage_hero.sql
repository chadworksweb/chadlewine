-- Curated homepage hero list. Mixed entity types so the admin can pin a
-- song, album, merch, observation, or art piece into the hero carousel
-- with explicit ordering. When empty, the homepage falls back to the
-- auto-generated latest-songs list.

CREATE TABLE homepage_hero (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('song', 'album', 'merch', 'observation', 'art')),
  entity_id uuid NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (entity_type, entity_id)
);

CREATE INDEX idx_homepage_hero_order ON homepage_hero(display_order);

ALTER TABLE homepage_hero ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read homepage_hero" ON homepage_hero FOR SELECT USING (true);
CREATE POLICY "Admin full access homepage_hero" ON homepage_hero FOR ALL USING (auth.role() = 'authenticated');
