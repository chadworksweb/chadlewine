-- Add per-SKU mockup image override for the format showcase carousel.
-- Null = render the default flat-brand template (one of
-- /public/format-templates/{digital,vinyl,cd,cassette}.svg) with the
-- release/song cover art overlaid. A value = use that uploaded image
-- instead of the template (e.g. a hand-mocked vinyl shot, a poster).

ALTER TABLE release_skus
  ADD COLUMN IF NOT EXISTS mockup_image_path text;

ALTER TABLE song_skus
  ADD COLUMN IF NOT EXISTS mockup_image_path text;
