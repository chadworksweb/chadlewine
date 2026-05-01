ALTER TABLE products
  ADD COLUMN IF NOT EXISTS linked_art_piece_id uuid REFERENCES art_pieces(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_linked_art_piece
  ON products(linked_art_piece_id)
  WHERE linked_art_piece_id IS NOT NULL;
