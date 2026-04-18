ALTER TABLE art_pieces DROP CONSTRAINT art_pieces_status_check;

ALTER TABLE art_pieces ADD CONSTRAINT art_pieces_status_check
  CHECK (status IN ('draft', 'unreleased', 'published'));

ALTER TABLE art_pieces
  ADD COLUMN art_summary text,
  ADD COLUMN chad_quote text,
  ADD COLUMN art_focal_x numeric(5,2) CHECK (art_focal_x IS NULL OR (art_focal_x >= 0 AND art_focal_x <= 100)),
  ADD COLUMN art_focal_y numeric(5,2) CHECK (art_focal_y IS NULL OR (art_focal_y >= 0 AND art_focal_y <= 100)),
  ADD COLUMN focus_keyphrase varchar(80),
  ADD COLUMN secondary_keyphrases jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN search_intent varchar(20) DEFAULT 'informational',
  ADD COLUMN citation_summary varchar(300),
  ADD COLUMN paa_pairs jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN entity_tags jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN seo_title text,
  ADD COLUMN seo_description text;

ALTER TABLE products
  ADD COLUMN variant_type text CHECK (variant_type IS NULL OR variant_type IN ('original', 'print')),
  ADD COLUMN variant_label text,
  ADD COLUMN edition_size integer NOT NULL DEFAULT 0,
  ADD COLUMN editions_sold integer NOT NULL DEFAULT 0;

ALTER TABLE products DROP CONSTRAINT products_tier_check;

ALTER TABLE products ADD CONSTRAINT products_tier_check
  CHECK (tier IN ('art', 'art_original', 'art_print', 'line', 'fusion', 'pick', 'diddy'));

CREATE TABLE art_composition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  art_id uuid NOT NULL UNIQUE REFERENCES art_pieces(id) ON DELETE CASCADE,
  content text,
  content_html text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_art_composition_art_id ON art_composition(art_id);

CREATE TRIGGER art_composition_updated_at
  BEFORE UPDATE ON art_composition
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE art_composition ENABLE ROW LEVEL SECURITY;

CREATE POLICY art_composition_public_read ON art_composition FOR SELECT
  USING (status = 'published' AND EXISTS (
    SELECT 1 FROM art_pieces
    WHERE art_pieces.id = art_composition.art_id
      AND art_pieces.status IN ('unreleased', 'published')
  ));

CREATE POLICY art_composition_admin_all ON art_composition FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE TABLE art_composition_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  art_id uuid NOT NULL REFERENCES art_pieces(id) ON DELETE CASCADE,
  content text,
  content_html text,
  revision_number integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_art_composition_revisions_art_id_number
  ON art_composition_revisions(art_id, revision_number DESC);

ALTER TABLE art_composition_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY art_composition_revisions_admin_all ON art_composition_revisions FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE TABLE song_art_pairings (
  song_id uuid NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  art_id uuid NOT NULL REFERENCES art_pieces(id) ON DELETE CASCADE,
  position smallint NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (song_id, art_id)
);

CREATE INDEX idx_song_art_pairings_song ON song_art_pairings(song_id, position);
CREATE INDEX idx_song_art_pairings_art ON song_art_pairings(art_id, position);

ALTER TABLE song_art_pairings ENABLE ROW LEVEL SECURITY;

CREATE POLICY song_art_pairings_public_read ON song_art_pairings FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM songs WHERE songs.id = song_id AND songs.status IN ('unreleased', 'published'))
    AND
    EXISTS (SELECT 1 FROM art_pieces WHERE art_pieces.id = art_id AND art_pieces.status IN ('unreleased', 'published'))
  );

CREATE POLICY song_art_pairings_admin_all ON song_art_pairings FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE TABLE door_page_art (
  door_page_id uuid NOT NULL REFERENCES door_pages(id) ON DELETE CASCADE,
  art_id uuid NOT NULL REFERENCES art_pieces(id) ON DELETE CASCADE,
  position smallint NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (door_page_id, art_id)
);

CREATE INDEX idx_door_page_art_door ON door_page_art(door_page_id, position);

ALTER TABLE door_page_art ENABLE ROW LEVEL SECURITY;

CREATE POLICY door_page_art_public_read ON door_page_art FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM door_pages WHERE door_pages.id = door_page_id AND door_pages.status = 'published')
    AND
    EXISTS (SELECT 1 FROM art_pieces WHERE art_pieces.id = art_id AND art_pieces.status IN ('unreleased', 'published'))
  );

CREATE POLICY door_page_art_admin_all ON door_page_art FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
