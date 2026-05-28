-- Merch types: classify merch (apparel, posters, ...) and group the storefront
-- by category. release_skus with format in (vinyl, cd, cassette) are implicit
-- physical_music merch -- no data moves, the type lookup just gives them a
-- shared label and slot in the catalog. New types can be added from the admin.

CREATE TABLE IF NOT EXISTS merch_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_merch_types_sort ON merch_types(sort_order, label);

ALTER TABLE merch_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read merch_types"
  ON merch_types FOR SELECT USING (true);
CREATE POLICY "Admin full access merch_types"
  ON merch_types FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

GRANT SELECT ON merch_types TO anon;
GRANT ALL    ON merch_types TO authenticated, service_role;

CREATE TRIGGER merch_types_updated_at BEFORE UPDATE ON merch_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Seed the three initial types. Reserved slug physical_music is the implicit
-- bucket for release_skus rows with format in (vinyl, cd, cassette); admin UI
-- should not let it be renamed/deleted (enforced in API, not schema).
INSERT INTO merch_types (slug, label, sort_order) VALUES
  ('apparel',        'Apparel',        10),
  ('poster',         'Posters',        20),
  ('physical_music', 'Physical Music', 30)
ON CONFLICT (slug) DO NOTHING;

-- merch -> merch_types
ALTER TABLE merch
  ADD COLUMN IF NOT EXISTS merch_type_id uuid REFERENCES merch_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_merch_merch_type ON merch(merch_type_id);
