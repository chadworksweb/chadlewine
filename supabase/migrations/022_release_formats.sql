-- Release formats (Digital Album, Digital EP, Digital Single, etc.)
CREATE TABLE release_formats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  slug text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Seed default formats from Chad Rising
INSERT INTO release_formats (label, slug) VALUES
  ('Digital Album', 'digital-album'),
  ('Digital EP', 'digital-ep'),
  ('Digital Single', 'digital-single'),
  ('Digital Compilation', 'digital-compilation');

-- Add format reference to albums
ALTER TABLE albums ADD COLUMN format_id uuid REFERENCES release_formats(id) ON DELETE SET NULL;

-- RLS
ALTER TABLE release_formats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read formats" ON release_formats FOR SELECT USING (true);
CREATE POLICY "Admin full access to formats" ON release_formats FOR ALL USING (auth.role() = 'authenticated');
