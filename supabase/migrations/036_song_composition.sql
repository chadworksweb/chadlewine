CREATE TABLE song_composition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id uuid UNIQUE NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  content text DEFAULT '',
  content_html text DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TRIGGER song_composition_updated_at BEFORE UPDATE ON song_composition
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE song_composition ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read published composition"
  ON song_composition FOR SELECT USING (status = 'published');

CREATE POLICY "Admin full access composition"
  ON song_composition FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE song_composition_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id uuid NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_comp_messages_song_time ON song_composition_messages(song_id, created_at);

ALTER TABLE song_composition_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access composition messages"
  ON song_composition_messages FOR ALL USING (true) WITH CHECK (true);
