INSERT INTO products (
  tier, fulfillment, title, description, price, image_url, image_alt, status,
  variant_type, variant_label, edition_size, editions_sold, source_art_id
)
SELECT
  'art_original',
  'manual',
  title || ' — Original',
  description,
  price,
  image_path,
  image_alt,
  'active',
  'original',
  NULL,
  1,
  CASE WHEN sold THEN 1 ELSE 0 END,
  id
FROM art_pieces
WHERE price IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM products WHERE products.source_art_id = art_pieces.id
  );

ALTER TABLE art_pieces
  DROP COLUMN price,
  DROP COLUMN sold,
  DROP COLUMN buy_original_url;
