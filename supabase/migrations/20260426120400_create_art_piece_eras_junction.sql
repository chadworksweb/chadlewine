-- Arc Radiant v1 / migration 5 of 14
-- Many-to-many art_pieces ↔ eras. An art piece can sit inside multiple eras
-- (e.g. a piece begun in one era, completed in another). Created here rather
-- than a single era_id FK so future-proof for that case.

CREATE TABLE IF NOT EXISTS art_piece_eras (
  art_piece_id uuid NOT NULL REFERENCES art_pieces(id) ON DELETE CASCADE,
  era_id uuid NOT NULL REFERENCES eras(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (art_piece_id, era_id)
);

CREATE INDEX IF NOT EXISTS idx_art_piece_eras_art ON art_piece_eras(art_piece_id);
CREATE INDEX IF NOT EXISTS idx_art_piece_eras_era ON art_piece_eras(era_id);

ALTER TABLE art_piece_eras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read art_piece_eras"
  ON art_piece_eras FOR SELECT USING (true);
CREATE POLICY "Admin full access art_piece_eras"
  ON art_piece_eras FOR ALL USING (auth.role() = 'authenticated');
