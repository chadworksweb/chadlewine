-- Mirror the song focal/zoom crop columns on albums so the same FocalPointPicker
-- UI can be reused on the album edit page (hero / card / portrait).

ALTER TABLE albums
  ADD COLUMN IF NOT EXISTS hero_focal_x numeric,
  ADD COLUMN IF NOT EXISTS hero_focal_y numeric,
  ADD COLUMN IF NOT EXISTS hero_zoom numeric DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS card_focal_x numeric,
  ADD COLUMN IF NOT EXISTS card_focal_y numeric,
  ADD COLUMN IF NOT EXISTS card_zoom numeric DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS portrait_focal_x numeric,
  ADD COLUMN IF NOT EXISTS portrait_focal_y numeric,
  ADD COLUMN IF NOT EXISTS portrait_zoom numeric DEFAULT 1.0;
