CREATE TABLE art_formats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  slug text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO art_formats (label, slug) VALUES
  ('Painting', 'painting'),
  ('Mural', 'mural');

ALTER TABLE art_formats ENABLE ROW LEVEL SECURITY;
CREATE POLICY art_formats_public_read ON art_formats FOR SELECT USING (true);
CREATE POLICY art_formats_admin_all ON art_formats FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

ALTER TABLE art_pieces ADD COLUMN format_id uuid REFERENCES art_formats(id) ON DELETE SET NULL;

UPDATE art_pieces
SET format_id = (SELECT id FROM art_formats WHERE slug = 'painting')
WHERE format_id IS NULL;

CREATE INDEX idx_art_pieces_format ON art_pieces(format_id);

CREATE TABLE mural_details (
  art_id uuid PRIMARY KEY REFERENCES art_pieces(id) ON DELETE CASCADE,
  street_address text,
  venue_name text,
  venue_type text,
  venue_url text,
  neighborhood text,
  city text,
  region text,
  country text DEFAULT 'US',
  latitude numeric(9,6),
  longitude numeric(9,6),
  width_ft numeric,
  height_ft numeric,
  indoor boolean,
  completion_date date,
  wall_status text DEFAULT 'active' CHECK (wall_status IN ('active', 'painted_over', 'damaged', 'temporary')),
  viewable_hours text,
  commissioned_by text,
  public_topics text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mural_details_city ON mural_details(city);
CREATE INDEX idx_mural_details_neighborhood ON mural_details(neighborhood);
CREATE INDEX idx_mural_details_topics ON mural_details USING GIN(public_topics);

ALTER TABLE mural_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY mural_details_public_read ON mural_details FOR SELECT
  USING (EXISTS (SELECT 1 FROM art_pieces WHERE art_pieces.id = art_id AND art_pieces.status IN ('unreleased', 'published')));

CREATE POLICY mural_details_admin_all ON mural_details FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
