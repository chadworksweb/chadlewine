-- Promote physical-music SKUs to real merch products. Until now /merch
-- pulled release_skus directly and used the release's cover_art_path as the
-- card image -- meaning vinyl/CD/cassette cards showed the digital release
-- artwork instead of actual product photography of the sleeved record, the
-- jewel case, the cassette shell, etc.
--
-- Each release_sku with format in (vinyl, cd, cassette) now gets a paired
-- merch row carrying its own product_images gallery + storefront metadata.
-- release_skus still owns format / price / stock / downloads -- it's the
-- truth for the SKU layer. The merch row links to it via release_sku_id.

ALTER TABLE merch
  ADD COLUMN IF NOT EXISTS release_sku_id uuid REFERENCES release_skus(id) ON DELETE SET NULL;

-- At most one merch row per SKU. Partial unique index so multiple NULLs are
-- still allowed for non-physical-music merch.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_merch_release_sku
  ON merch(release_sku_id) WHERE release_sku_id IS NOT NULL;

-- Backfill: one merch row per published vinyl/CD/cassette SKU that doesn't
-- already have one. Slug = "<release-slug>-<format>"; image_url seeded from
-- the release cover as a placeholder. merch.slug has no unique constraint
-- (the only enforced uniqueness is on the SKU FK we just added), so two
-- NOT EXISTS clauses cover both collision cases: already-linked SKU, and
-- a manually-created merch row that happens to share the target slug.
INSERT INTO merch (
  title,
  slug,
  description,
  fulfillment,
  status,
  merch_type_id,
  release_sku_id,
  image_url,
  image_alt
)
SELECT
  r.title || ' ('
    || CASE rs.format
         WHEN 'vinyl'    THEN 'Vinyl'
         WHEN 'cd'       THEN 'CD'
         WHEN 'cassette' THEN 'Cassette'
       END
    || ')',
  r.slug || '-' || rs.format,
  NULL,
  'manual',
  CASE WHEN rs.status = 'discontinued' THEN 'inactive' ELSE 'active' END,
  (SELECT id FROM merch_types WHERE slug = 'physical_music'),
  rs.id,
  r.cover_art_path,
  r.title || ' ' || rs.format
FROM release_skus rs
JOIN releases r ON r.id = rs.release_id
WHERE rs.format IN ('vinyl', 'cd', 'cassette')
  AND r.status = 'published'
  AND NOT EXISTS (
    SELECT 1 FROM merch m WHERE m.release_sku_id = rs.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM merch m WHERE m.slug = r.slug || '-' || rs.format
  );
