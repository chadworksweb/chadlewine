-- Hero focal point for the two remaining homepage-hero entity types that lacked
-- it: merch and videos. Songs, releases, observations (posts), and art_pieces
-- already carry hero_focal_x/y + hero_zoom; this brings merch and videos to
-- parity so every hero-eligible entity can set its own hero crop.
--
-- Values are object-position percentages (0-100); hero_zoom is a >=1 scale.
-- Hero-only (no card/portrait) -- these two types have no other crop target.
-- ADD COLUMN inherits the table's existing grants and RLS.

ALTER TABLE public.merch
  ADD COLUMN IF NOT EXISTS hero_focal_x real,
  ADD COLUMN IF NOT EXISTS hero_focal_y real,
  ADD COLUMN IF NOT EXISTS hero_zoom real NOT NULL DEFAULT 1.0;

ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS hero_focal_x real,
  ADD COLUMN IF NOT EXISTS hero_focal_y real,
  ADD COLUMN IF NOT EXISTS hero_zoom real NOT NULL DEFAULT 1.0;
