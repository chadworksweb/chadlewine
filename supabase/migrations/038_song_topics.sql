-- Topics taxonomy for songs (mirrors the observation categories/tags/thoughtlines pattern)
CREATE TABLE topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text UNIQUE NOT NULL,
  slug text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE song_topics (
  song_id uuid REFERENCES songs(id) ON DELETE CASCADE,
  topic_id uuid REFERENCES topics(id) ON DELETE CASCADE,
  PRIMARY KEY (song_id, topic_id)
);

CREATE INDEX song_topics_topic_id_idx ON song_topics(topic_id);

-- RLS: public read, no public write
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE song_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read topics" ON topics FOR SELECT USING (true);
CREATE POLICY "Public read song_topics" ON song_topics FOR SELECT USING (true);
