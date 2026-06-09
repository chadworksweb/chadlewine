-- Per-ratio focal crops on posts (Writings), matching the mechanism already on
-- songs and art_pieces. Lets the editor dial a hero crop (desktop cover-hero)
-- and an independent portrait crop (mobile cover-hero, 4:5) from one source
-- image. card_* is stored for parity with the shared FocalPointPicker; posts
-- have no 1:1 render target yet.
--
-- Values are object-position percentages (0-100); *_zoom is a >=1 scale.
-- ALTER TABLE ADD COLUMN inherits the table's existing grants and RLS.

ALTER TABLE public.posts
  ADD COLUMN hero_focal_x real,
  ADD COLUMN hero_focal_y real,
  ADD COLUMN hero_zoom real NOT NULL DEFAULT 1.0,
  ADD COLUMN card_focal_x real,
  ADD COLUMN card_focal_y real,
  ADD COLUMN card_zoom real NOT NULL DEFAULT 1.0,
  ADD COLUMN portrait_focal_x real,
  ADD COLUMN portrait_focal_y real,
  ADD COLUMN portrait_zoom real NOT NULL DEFAULT 1.0;
