-- sku_images: gallery for each release_sku or song_sku.
-- Parallels the existing product_images table used by merch -- same shape,
-- same drag/primary/hide/soft-delete semantics. Polymorphic to release or
-- song SKUs via XOR check (one parent ref must be set).
--
-- Replaces release_skus.mockup_image_path / song_skus.mockup_image_path,
-- which only held a single override image. Those columns are dropped at
-- the end of this migration.

CREATE TABLE sku_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  release_sku_id uuid REFERENCES release_skus(id) ON DELETE CASCADE,
  song_sku_id    uuid REFERENCES song_skus(id)    ON DELETE CASCADE,

  url text NOT NULL,
  source text NOT NULL DEFAULT 'custom' CHECK (source IN ('custom')),

  position int NOT NULL DEFAULT 0,
  is_primary boolean NOT NULL DEFAULT false,
  is_hidden boolean NOT NULL DEFAULT false,

  alt text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,

  CONSTRAINT sku_images_parent_xor CHECK (
    (release_sku_id IS NOT NULL)::int + (song_sku_id IS NOT NULL)::int = 1
  )
);

CREATE INDEX idx_sku_images_release_sku
  ON sku_images(release_sku_id, position)
  WHERE deleted_at IS NULL AND release_sku_id IS NOT NULL;

CREATE INDEX idx_sku_images_song_sku
  ON sku_images(song_sku_id, position)
  WHERE deleted_at IS NULL AND song_sku_id IS NOT NULL;

-- One primary per release SKU.
CREATE UNIQUE INDEX uniq_sku_images_release_primary
  ON sku_images(release_sku_id)
  WHERE is_primary = true AND deleted_at IS NULL AND release_sku_id IS NOT NULL;

-- One primary per song SKU.
CREATE UNIQUE INDEX uniq_sku_images_song_primary
  ON sku_images(song_sku_id)
  WHERE is_primary = true AND deleted_at IS NULL AND song_sku_id IS NOT NULL;

ALTER TABLE sku_images ENABLE ROW LEVEL SECURITY;

-- Public read: visible (not hidden, not soft-deleted) gallery images whose
-- parent SKU is sellable.
CREATE POLICY "Public can read visible sku_images (release)"
  ON sku_images FOR SELECT
  USING (
    deleted_at IS NULL
    AND is_hidden = false
    AND release_sku_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM release_skus rs
      WHERE rs.id = sku_images.release_sku_id
        AND rs.status IN ('available', 'preorder', 'sold_out')
    )
  );

CREATE POLICY "Public can read visible sku_images (song)"
  ON sku_images FOR SELECT
  USING (
    deleted_at IS NULL
    AND is_hidden = false
    AND song_sku_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM song_skus ss
      WHERE ss.id = sku_images.song_sku_id
        AND ss.status IN ('available', 'preorder', 'sold_out')
    )
  );

CREATE POLICY "Admin full access sku_images"
  ON sku_images FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

GRANT SELECT ON sku_images TO anon;
GRANT ALL    ON sku_images TO authenticated, service_role;

CREATE TRIGGER sku_images_updated_at BEFORE UPDATE ON sku_images
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Drop the single-image overrides; galleries replace them.
ALTER TABLE release_skus DROP COLUMN IF EXISTS mockup_image_path;
ALTER TABLE song_skus    DROP COLUMN IF EXISTS mockup_image_path;
