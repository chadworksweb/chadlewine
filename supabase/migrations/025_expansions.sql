-- Expansions: deep-dive breakdowns that attach to songs

CREATE TABLE expansions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id uuid NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_expansions_song ON expansions(song_id);
CREATE INDEX idx_expansions_status ON expansions(status);

CREATE TRIGGER expansions_updated_at BEFORE UPDATE ON expansions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE expansions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read published expansions"
  ON expansions FOR SELECT USING (status = 'published');

CREATE POLICY "Admin full access expansions"
  ON expansions FOR ALL USING (true) WITH CHECK (true);
