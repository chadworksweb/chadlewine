-- Curated homepage hero -- create + widen to the full canonical entity set.
--
-- The original 20260430120000_homepage_hero migration was never applied to prod
-- (the table 404s there) and used the legacy 'album' vocabulary. This migration
-- is written to reconcile ANY state to the desired end state: it creates the
-- table if missing, migrates any legacy 'album' rows to 'release', and locks the
-- entity_type check to the six types the homepage actually renders -- song,
-- release, merch, observation, art, and video.

CREATE TABLE IF NOT EXISTS homepage_hero (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_homepage_hero_order ON homepage_hero(display_order);

ALTER TABLE homepage_hero ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read homepage_hero" ON homepage_hero;
CREATE POLICY "Public read homepage_hero" ON homepage_hero FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin full access homepage_hero" ON homepage_hero;
CREATE POLICY "Admin full access homepage_hero" ON homepage_hero FOR ALL USING (auth.role() = 'authenticated');

GRANT SELECT ON homepage_hero TO anon;
GRANT ALL ON homepage_hero TO authenticated, service_role;

-- Reconcile the legacy vocabulary before re-locking the check.
UPDATE homepage_hero SET entity_type = 'release' WHERE entity_type = 'album';

ALTER TABLE homepage_hero DROP CONSTRAINT IF EXISTS homepage_hero_entity_type_check;
ALTER TABLE homepage_hero
  ADD CONSTRAINT homepage_hero_entity_type_check
  CHECK (entity_type IN ('song', 'release', 'merch', 'observation', 'art', 'video'));
