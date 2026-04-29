-- Album Visibility Engine
-- Mirrors song_visibility_sections but for albums, plus a data_payload jsonb
-- field for "data" topics (admin curates picks rather than generating prose).

CREATE TABLE album_visibility_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  category text NOT NULL,
  content text DEFAULT '',
  direct_answer text,
  key_points text[] DEFAULT '{}',
  data_payload jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(album_id, category)
);

CREATE INDEX idx_album_vis_sections_album ON album_visibility_sections(album_id);
CREATE INDEX idx_album_vis_sections_status ON album_visibility_sections(status);

CREATE TRIGGER album_vis_sections_updated_at BEFORE UPDATE ON album_visibility_sections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE album_visibility_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read published album visibility sections"
  ON album_visibility_sections FOR SELECT USING (status = 'published');

CREATE POLICY "Admin full access album visibility sections"
  ON album_visibility_sections FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE album_visibility_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_album_vis_messages_album_time ON album_visibility_messages(album_id, created_at);

ALTER TABLE album_visibility_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access album visibility messages"
  ON album_visibility_messages FOR ALL USING (true) WITH CHECK (true);
