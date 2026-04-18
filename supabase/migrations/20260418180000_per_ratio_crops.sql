ALTER TABLE art_pieces
  ADD COLUMN hero_focal_x real,
  ADD COLUMN hero_focal_y real,
  ADD COLUMN hero_zoom real NOT NULL DEFAULT 1.0,
  ADD COLUMN card_focal_x real,
  ADD COLUMN card_focal_y real,
  ADD COLUMN card_zoom real NOT NULL DEFAULT 1.0,
  ADD COLUMN portrait_focal_x real,
  ADD COLUMN portrait_focal_y real,
  ADD COLUMN portrait_zoom real NOT NULL DEFAULT 1.0;

UPDATE art_pieces SET
  hero_focal_x = art_focal_x,
  hero_focal_y = art_focal_y,
  hero_zoom = COALESCE(art_zoom, 1.0);

ALTER TABLE art_pieces
  DROP COLUMN art_focal_x,
  DROP COLUMN art_focal_y,
  DROP COLUMN art_zoom;

ALTER TABLE songs
  ADD COLUMN hero_focal_x real,
  ADD COLUMN hero_focal_y real,
  ADD COLUMN hero_zoom real NOT NULL DEFAULT 1.0,
  ADD COLUMN card_focal_x real,
  ADD COLUMN card_focal_y real,
  ADD COLUMN card_zoom real NOT NULL DEFAULT 1.0,
  ADD COLUMN portrait_focal_x real,
  ADD COLUMN portrait_focal_y real,
  ADD COLUMN portrait_zoom real NOT NULL DEFAULT 1.0;

UPDATE songs SET
  hero_focal_x = art_focal_x,
  hero_focal_y = art_focal_y,
  hero_zoom = COALESCE(art_zoom, 1.0);

ALTER TABLE songs
  DROP COLUMN art_focal_x,
  DROP COLUMN art_focal_y,
  DROP COLUMN art_zoom;
