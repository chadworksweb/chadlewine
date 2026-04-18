ALTER TABLE art_pieces
  ADD COLUMN dimensions text,
  ADD COLUMN year_created smallint,
  ADD COLUMN sold boolean NOT NULL DEFAULT false,
  ADD COLUMN price numeric(10,2),
  ADD COLUMN buy_original_url text,
  ADD COLUMN gallery_paths text[] NOT NULL DEFAULT '{}';

ALTER TABLE products DROP CONSTRAINT products_tier_check;

ALTER TABLE products ADD CONSTRAINT products_tier_check
  CHECK (tier IN ('art', 'art_original', 'line', 'fusion', 'pick', 'diddy'));

ALTER TABLE products
  ADD COLUMN source_art_id uuid REFERENCES art_pieces(id) ON DELETE SET NULL;

CREATE INDEX idx_products_source_art_id ON products(source_art_id);
