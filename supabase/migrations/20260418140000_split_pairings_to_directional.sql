CREATE TABLE songs_featured_art (
  song_id uuid NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  art_id uuid NOT NULL REFERENCES art_pieces(id) ON DELETE CASCADE,
  position smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (song_id, art_id)
);

CREATE INDEX idx_songs_featured_art_song ON songs_featured_art(song_id, position);
CREATE INDEX idx_songs_featured_art_art ON songs_featured_art(art_id);

ALTER TABLE songs_featured_art ENABLE ROW LEVEL SECURITY;

CREATE POLICY songs_featured_art_public_read ON songs_featured_art FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM songs WHERE songs.id = song_id AND songs.status IN ('unreleased', 'published'))
    AND
    EXISTS (SELECT 1 FROM art_pieces WHERE art_pieces.id = art_id AND art_pieces.status IN ('unreleased', 'published'))
  );

CREATE POLICY songs_featured_art_admin_all ON songs_featured_art FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE TABLE art_featured_songs (
  art_id uuid NOT NULL REFERENCES art_pieces(id) ON DELETE CASCADE,
  song_id uuid NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  position smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (art_id, song_id)
);

CREATE INDEX idx_art_featured_songs_art ON art_featured_songs(art_id, position);
CREATE INDEX idx_art_featured_songs_song ON art_featured_songs(song_id);

ALTER TABLE art_featured_songs ENABLE ROW LEVEL SECURITY;

CREATE POLICY art_featured_songs_public_read ON art_featured_songs FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM art_pieces WHERE art_pieces.id = art_id AND art_pieces.status IN ('unreleased', 'published'))
    AND
    EXISTS (SELECT 1 FROM songs WHERE songs.id = song_id AND songs.status IN ('unreleased', 'published'))
  );

CREATE POLICY art_featured_songs_admin_all ON art_featured_songs FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

DROP TABLE song_art_pairings;
