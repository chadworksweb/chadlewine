-- YMAL ("You Might Also Like"): one generic related-content layer for every
-- post type. A source entity (song/release/art/merch/observation) points at an
-- ordered, mixed list of target entities. Same shape as homepage_hero, but with
-- a source. Replaces the per-type pickers (song merch, release merch /
-- you-might-also-like / related-observations).

CREATE TABLE IF NOT EXISTS related_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL CHECK (source_type IN ('song','release','art','merch','observation')),
  source_id uuid NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('song','release','art','merch','observation')),
  entity_id uuid NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (source_type, source_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_related_entities_source
  ON related_entities (source_type, source_id, display_order);

ALTER TABLE related_entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read related_entities"
  ON related_entities FOR SELECT USING (true);
CREATE POLICY "Admin full access related_entities"
  ON related_entities FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

GRANT SELECT ON related_entities TO anon;
GRANT ALL    ON related_entities TO authenticated, service_role;

-- ── Migrate existing per-type sections into related_entities ────────────────
-- Idempotent (ON CONFLICT DO NOTHING). Release sections are currently empty,
-- so those are no-ops today, but the moves are written for correctness.

-- Song merch -> merch entities
INSERT INTO related_entities (source_type, source_id, entity_type, entity_id, display_order)
SELECT 'song', s.song_id, 'merch', pid.value::uuid, pid.ord - 1
FROM song_visibility_sections s,
     LATERAL jsonb_array_elements_text(s.data_payload->'product_ids') WITH ORDINALITY AS pid(value, ord)
WHERE s.category = 'merch'
  AND jsonb_typeof(s.data_payload->'product_ids') = 'array'
ON CONFLICT (source_type, source_id, entity_type, entity_id) DO NOTHING;

-- Release merch -> merch entities
INSERT INTO related_entities (source_type, source_id, entity_type, entity_id, display_order)
SELECT 'release', r.release_id, 'merch', pid.value::uuid, pid.ord - 1
FROM release_visibility_sections r,
     LATERAL jsonb_array_elements_text(r.data_payload->'product_ids') WITH ORDINALITY AS pid(value, ord)
WHERE r.category = 'merch'
  AND jsonb_typeof(r.data_payload->'product_ids') = 'array'
ON CONFLICT (source_type, source_id, entity_type, entity_id) DO NOTHING;

-- Release you-might-also-like -> release entities
INSERT INTO related_entities (source_type, source_id, entity_type, entity_id, display_order)
SELECT 'release', r.release_id, 'release', rid.value::uuid, rid.ord - 1
FROM release_visibility_sections r,
     LATERAL jsonb_array_elements_text(r.data_payload->'release_ids') WITH ORDINALITY AS rid(value, ord)
WHERE r.category = 'you-might-also-like'
  AND jsonb_typeof(r.data_payload->'release_ids') = 'array'
ON CONFLICT (source_type, source_id, entity_type, entity_id) DO NOTHING;

-- Release related-observations -> observation entities
INSERT INTO related_entities (source_type, source_id, entity_type, entity_id, display_order)
SELECT 'release', r.release_id, 'observation', oid.value::uuid, oid.ord - 1
FROM release_visibility_sections r,
     LATERAL jsonb_array_elements_text(r.data_payload->'observation_ids') WITH ORDINALITY AS oid(value, ord)
WHERE r.category = 'related-observations'
  AND jsonb_typeof(r.data_payload->'observation_ids') = 'array'
ON CONFLICT (source_type, source_id, entity_type, entity_id) DO NOTHING;
