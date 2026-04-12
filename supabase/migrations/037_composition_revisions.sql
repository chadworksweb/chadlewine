CREATE TABLE song_composition_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id uuid NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  content text NOT NULL,
  content_html text DEFAULT '',
  revision_number integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_comp_revisions_song ON song_composition_revisions(song_id, revision_number DESC);

ALTER TABLE song_composition_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access composition revisions"
  ON song_composition_revisions FOR ALL USING (true) WITH CHECK (true);
