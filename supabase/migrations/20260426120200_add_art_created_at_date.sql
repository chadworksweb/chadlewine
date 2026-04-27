-- Arc Radiant v1 / migration 3 of 14
-- Adds nullable created_at_date (DATE) to art_pieces. Manually populated only.
-- Distinct from the existing created_at (timestamptz, row-creation time).
-- Powers the Visual Art layer's time-axis placement (phase 2+ rendering).

ALTER TABLE art_pieces
  ADD COLUMN IF NOT EXISTS created_at_date DATE;

CREATE INDEX IF NOT EXISTS idx_art_pieces_created_at_date
  ON art_pieces(created_at_date) WHERE created_at_date IS NOT NULL;
