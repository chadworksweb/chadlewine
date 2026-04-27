-- Arc Radiant v1 / migration 4 of 14
-- Single eras table with kind discriminator (locked decision #4).
-- 'life' kind: ~8-10 doc-derived life eras (Pittsburgh, Brooklyn I/II/III, etc.)
-- 'release' kind: 13+ release eras, each optionally linked to an album.
-- Life eras and release eras coexist; queries filter by kind.

CREATE TABLE IF NOT EXISTS eras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('life','release')),
  date_start date NOT NULL,
  date_end date,
  album_id uuid REFERENCES albums(id) ON DELETE SET NULL,
  body_md text DEFAULT '',
  body_html text DEFAULT '',
  display_order integer DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eras_kind ON eras(kind);
CREATE INDEX IF NOT EXISTS idx_eras_dates ON eras(date_start, date_end);
CREATE INDEX IF NOT EXISTS idx_eras_album ON eras(album_id) WHERE album_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_eras_status ON eras(status);

CREATE TRIGGER eras_updated_at BEFORE UPDATE ON eras
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE eras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read published eras"
  ON eras FOR SELECT USING (status = 'published');
CREATE POLICY "Admin full access eras"
  ON eras FOR ALL USING (auth.role() = 'authenticated');
