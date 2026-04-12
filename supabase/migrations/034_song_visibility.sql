-- Song Visibility Engine: structured marketing content per song + chat history

CREATE TABLE song_visibility_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id uuid NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  category text NOT NULL,
  content text DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(song_id, category)
);

CREATE INDEX idx_vis_sections_song ON song_visibility_sections(song_id);
CREATE INDEX idx_vis_sections_status ON song_visibility_sections(status);

CREATE TRIGGER vis_sections_updated_at BEFORE UPDATE ON song_visibility_sections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE song_visibility_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read published visibility sections"
  ON song_visibility_sections FOR SELECT USING (status = 'published');

CREATE POLICY "Admin full access visibility sections"
  ON song_visibility_sections FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE song_visibility_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id uuid NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_vis_messages_song_time ON song_visibility_messages(song_id, created_at);

ALTER TABLE song_visibility_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access visibility messages"
  ON song_visibility_messages FOR ALL USING (true) WITH CHECK (true);
