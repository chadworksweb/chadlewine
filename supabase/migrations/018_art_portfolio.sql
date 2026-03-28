-- Phase 14: Art Portfolio

CREATE TABLE art_pieces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  medium text,
  image_path text NOT NULL,
  image_alt text,
  description text,
  display_order integer DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_art_pieces_status ON art_pieces(status);
CREATE INDEX idx_art_pieces_order ON art_pieces(display_order);

CREATE TRIGGER art_pieces_updated_at BEFORE UPDATE ON art_pieces
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE art_pieces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read published art_pieces" ON art_pieces FOR SELECT USING (status = 'published');
CREATE POLICY "Admin full access art_pieces" ON art_pieces FOR ALL USING (auth.role() = 'authenticated');
