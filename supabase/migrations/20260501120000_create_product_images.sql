-- product_images junction table for the Shopify-style merch gallery.
-- Talks to both Printify sync and admin custom uploads.
-- See CHADLEWINE-MERCH-GALLERY-PLAN.md.
--
-- Phase 1 (this migration): create table, backfill from products.image_url
-- and products.image_urls with null printify dedupe keys.
-- Phase 2 (separate one-shot script): populate printify_variant_ids and
-- printify_position by re-fetching from Printify per product.

CREATE TABLE product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url text NOT NULL,
  source text NOT NULL CHECK (source IN ('printify', 'custom')),

  -- Printify dedupe key. Sorted variant_ids[] plus position from Printify
  -- images[] payload (position is a string like front/back, not an index).
  -- Null for source=custom and Phase 1 backfill rows.
  printify_variant_ids bigint[],
  printify_position text,

  position int NOT NULL DEFAULT 0,
  is_primary boolean NOT NULL DEFAULT false,
  is_hidden boolean NOT NULL DEFAULT false,
  needs_review boolean NOT NULL DEFAULT false,

  alt text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX idx_product_images_product
  ON product_images(product_id, position)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_product_images_review
  ON product_images(product_id)
  WHERE needs_review = true AND deleted_at IS NULL;

-- Dedupe Printify rows by (variant_ids, position). Excludes Phase 1 backfill
-- rows (variant_ids IS NULL) so the migration insert cannot trip it.
CREATE UNIQUE INDEX uniq_product_images_printify_key
  ON product_images(product_id, printify_variant_ids, printify_position)
  WHERE source = 'printify' AND printify_variant_ids IS NOT NULL;

-- One primary per product. Statement-level checks tolerate the two-step
-- clear-old then set-new pattern in admin endpoints.
CREATE UNIQUE INDEX uniq_product_images_one_primary
  ON product_images(product_id)
  WHERE is_primary = true AND deleted_at IS NULL;

ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read visible product_images"
  ON product_images FOR SELECT
  USING (
    deleted_at IS NULL
    AND is_hidden = false
    AND EXISTS (
      SELECT 1 FROM products p
      WHERE p.id = product_images.product_id AND p.status = 'active'
    )
  );

CREATE POLICY "Admin full access product_images"
  ON product_images FOR ALL
  USING (auth.role() = 'authenticated');

-- ============================================================
-- Phase 1 backfill: copy existing image_url plus image_urls into rows.
-- ============================================================
-- For each product, build an ordered, deduped URL list:
--   slot 0 = image_url (if present)
--   slots 1..N = image_urls entries not equal to image_url, in array order
-- First slot becomes is_primary.
WITH product_image_lists AS (
  SELECT
    p.id AS product_id,
    arr.url,
    arr.ord
  FROM products p
  CROSS JOIN LATERAL (
    SELECT url, ord
    FROM (
      SELECT p.image_url AS url, 0 AS ord
      WHERE p.image_url IS NOT NULL AND p.image_url <> ''
      UNION ALL
      SELECT u.url, u.ord
      FROM unnest(COALESCE(p.image_urls, ARRAY[]::text[])) WITH ORDINALITY AS u(url, ord)
      WHERE u.url IS NOT NULL AND u.url <> '' AND u.url IS DISTINCT FROM p.image_url
    ) s
  ) arr
)
INSERT INTO product_images (product_id, url, source, position, is_primary)
SELECT
  product_id,
  url,
  'printify',
  ROW_NUMBER() OVER (PARTITION BY product_id ORDER BY ord) - 1 AS position,
  ROW_NUMBER() OVER (PARTITION BY product_id ORDER BY ord) = 1 AS is_primary
FROM product_image_lists;
