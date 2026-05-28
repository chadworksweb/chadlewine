-- Drop the vestigial is_catalog_item flag. It distinguished Chad-curated
-- products from user-submitted configurator rows; the configurator was
-- retired in 20260523000000_retire_merch_tier_categories.sql and nothing
-- has read the column since.
--
-- Dropping the column trips on the legacy "products" compat view that the
-- products -> merch rename left behind (SELECT * means it depends on every
-- column). Nothing in src/ uses .from("products") anymore so the view is
-- dead code; drop it here and repoint the one RLS policy that referenced it.
-- The postdeploy migration's matching DROP VIEW IF EXISTS becomes a no-op
-- after this runs.

DROP POLICY IF EXISTS "Public can read visible product_images" ON product_images;

DROP VIEW IF EXISTS products;

CREATE POLICY "Public can read visible product_images"
  ON product_images FOR SELECT
  USING (
    deleted_at IS NULL
    AND is_hidden = false
    AND EXISTS (
      SELECT 1 FROM merch m
      WHERE m.id = product_images.product_id AND m.status = 'active'
    )
  );

ALTER TABLE merch DROP COLUMN IF EXISTS is_catalog_item;
