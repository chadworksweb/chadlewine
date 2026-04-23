CREATE TABLE art_featured_art (
  parent_art_id uuid NOT NULL REFERENCES art_pieces(id) ON DELETE CASCADE,
  related_art_id uuid NOT NULL REFERENCES art_pieces(id) ON DELETE CASCADE,
  position smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (parent_art_id, related_art_id),
  CHECK (parent_art_id <> related_art_id)
);

CREATE INDEX idx_art_featured_art_parent ON art_featured_art(parent_art_id, position);
CREATE INDEX idx_art_featured_art_related ON art_featured_art(related_art_id);

ALTER TABLE art_featured_art ENABLE ROW LEVEL SECURITY;

CREATE POLICY art_featured_art_public_read ON art_featured_art FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM art_pieces WHERE art_pieces.id = parent_art_id AND art_pieces.status IN ('unreleased', 'published'))
    AND
    EXISTS (SELECT 1 FROM art_pieces WHERE art_pieces.id = related_art_id AND art_pieces.status IN ('unreleased', 'published'))
  );

CREATE POLICY art_featured_art_admin_all ON art_featured_art FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
