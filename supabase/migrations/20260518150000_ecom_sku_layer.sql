-- Ecom SKU layer.
-- Format is a SKU attribute, not a release property. Digital, vinyl, CD,
-- cassette are all SKU rows. Sub-variants (color, signed, size) live in a
-- child table. Two parallel SKU tables because songs are the atomic unit
-- of the site -- first-class commerce peers to releases.
-- Backfills one digital SKU per release/song from existing price and
-- download path columns. Drops the replaced releases columns. Defers
-- dropping songs.price and songs download path columns to a follow-up.

-- release_skus
CREATE TABLE release_skus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id uuid NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  format text NOT NULL
    CHECK (format IN ('digital', 'vinyl', 'cd', 'cassette')),
  fulfillment_method text NOT NULL DEFAULT 'manual'
    CHECK (fulfillment_method IN ('manual', 'printify')),
  sku_code text,
  price numeric(10,2),
  status text NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'preorder', 'sold_out', 'discontinued')),
  stock integer,
  display_order integer NOT NULL DEFAULT 0,
  download_path_mp3  text,
  download_path_flac text,
  download_path_wav  text,
  weight_grams   integer,
  ships_in_days  integer,
  printify_product_id text,
  printify_variant_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (release_id, format),
  UNIQUE (sku_code)
);

CREATE INDEX idx_release_skus_release ON release_skus(release_id);
CREATE INDEX idx_release_skus_status  ON release_skus(status);

ALTER TABLE release_skus ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read sellable release_skus"
  ON release_skus FOR SELECT
  USING (status IN ('available', 'preorder', 'sold_out'));

CREATE POLICY "Admin full access release_skus"
  ON release_skus FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

GRANT SELECT ON release_skus TO anon;
GRANT ALL    ON release_skus TO authenticated, service_role;

CREATE TRIGGER release_skus_updated_at BEFORE UPDATE ON release_skus
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- song_skus (parallel to release_skus; songs are atomic, flat, first-class)
CREATE TABLE song_skus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id uuid NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  format text NOT NULL
    CHECK (format IN ('digital', 'vinyl', 'cd', 'cassette')),
  fulfillment_method text NOT NULL DEFAULT 'manual'
    CHECK (fulfillment_method IN ('manual', 'printify')),
  sku_code text,
  price numeric(10,2),
  status text NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'preorder', 'sold_out', 'discontinued')),
  stock integer,
  display_order integer NOT NULL DEFAULT 0,
  download_path_mp3  text,
  download_path_flac text,
  download_path_wav  text,
  weight_grams   integer,
  ships_in_days  integer,
  printify_product_id text,
  printify_variant_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (song_id, format),
  UNIQUE (sku_code)
);

CREATE INDEX idx_song_skus_song   ON song_skus(song_id);
CREATE INDEX idx_song_skus_status ON song_skus(status);

ALTER TABLE song_skus ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read sellable song_skus"
  ON song_skus FOR SELECT
  USING (status IN ('available', 'preorder', 'sold_out'));

CREATE POLICY "Admin full access song_skus"
  ON song_skus FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

GRANT SELECT ON song_skus TO anon;
GRANT ALL    ON song_skus TO authenticated, service_role;

CREATE TRIGGER song_skus_updated_at BEFORE UPDATE ON song_skus
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- sku_variants (color, signed, size; polymorphic parent)
CREATE TABLE sku_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_sku_id uuid REFERENCES release_skus(id) ON DELETE CASCADE,
  song_sku_id    uuid REFERENCES song_skus(id)    ON DELETE CASCADE,
  label text NOT NULL,
  variant_slug text NOT NULL,
  sku_code text,
  price_delta numeric(10,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'preorder', 'sold_out', 'discontinued')),
  stock integer,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sku_variants_parent_xor CHECK (
    (release_sku_id IS NOT NULL)::int + (song_sku_id IS NOT NULL)::int = 1
  ),
  UNIQUE (sku_code)
);

CREATE UNIQUE INDEX idx_sku_variants_release_slug
  ON sku_variants(release_sku_id, variant_slug)
  WHERE release_sku_id IS NOT NULL;

CREATE UNIQUE INDEX idx_sku_variants_song_slug
  ON sku_variants(song_sku_id, variant_slug)
  WHERE song_sku_id IS NOT NULL;

CREATE INDEX idx_sku_variants_status ON sku_variants(status);

ALTER TABLE sku_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read sellable sku_variants"
  ON sku_variants FOR SELECT
  USING (status IN ('available', 'preorder', 'sold_out'));

CREATE POLICY "Admin full access sku_variants"
  ON sku_variants FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

GRANT SELECT ON sku_variants TO anon;
GRANT ALL    ON sku_variants TO authenticated, service_role;

CREATE TRIGGER sku_variants_updated_at BEFORE UPDATE ON sku_variants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Backfill: one digital SKU per release with commerce data.
INSERT INTO release_skus (
  release_id, format, fulfillment_method, sku_code, price, status,
  download_path_mp3, download_path_flac, download_path_wav
)
SELECT
  r.id,
  'digital',
  'manual',
  'CL-' || upper(r.slug) || '-DIGITAL',
  r.price,
  'available',
  r.download_path_mp3,
  r.download_path_flac,
  r.download_path_wav
FROM releases r
WHERE r.price IS NOT NULL
   OR r.download_path_mp3  IS NOT NULL
   OR r.download_path_flac IS NOT NULL
   OR r.download_path_wav  IS NOT NULL;

-- Backfill: one digital SKU per song with commerce data.
INSERT INTO song_skus (
  song_id, format, fulfillment_method, sku_code, price, status,
  download_path_mp3, download_path_flac, download_path_wav
)
SELECT
  s.id,
  'digital',
  'manual',
  'CL-' || upper(s.slug) || '-DIGITAL',
  s.price,
  'available',
  s.download_path_mp3,
  s.download_path_flac,
  s.download_path_wav
FROM songs s
WHERE s.price IS NOT NULL
   OR s.download_path_mp3  IS NOT NULL
   OR s.download_path_flac IS NOT NULL
   OR s.download_path_wav  IS NOT NULL;

-- purchases: add SKU references and backfill.
ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS release_sku_id uuid REFERENCES release_skus(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS song_sku_id    uuid REFERENCES song_skus(id)    ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sku_variant_id uuid REFERENCES sku_variants(id) ON DELETE SET NULL;

UPDATE purchases p
SET release_sku_id = rs.id
FROM release_skus rs
WHERE p.item_type = 'release'
  AND p.item_id = rs.release_id
  AND rs.format = 'digital'
  AND p.release_sku_id IS NULL;

UPDATE purchases p
SET song_sku_id = ss.id
FROM song_skus ss
WHERE p.item_type = 'song'
  AND p.item_id = ss.song_id
  AND ss.format = 'digital'
  AND p.song_sku_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_purchases_release_sku ON purchases(release_sku_id);
CREATE INDEX IF NOT EXISTS idx_purchases_song_sku    ON purchases(song_sku_id);
CREATE INDEX IF NOT EXISTS idx_purchases_sku_variant ON purchases(sku_variant_id);

-- Drop replaced columns on releases. songs columns are kept for now and
-- will be dropped in a follow-up migration after application code is off
-- them.
ALTER TABLE releases DROP CONSTRAINT IF EXISTS releases_release_format_check;
ALTER TABLE releases DROP COLUMN IF EXISTS release_format;
ALTER TABLE releases DROP COLUMN IF EXISTS price;
ALTER TABLE releases DROP COLUMN IF EXISTS download_path_mp3;
ALTER TABLE releases DROP COLUMN IF EXISTS download_path_flac;
ALTER TABLE releases DROP COLUMN IF EXISTS download_path_wav;
