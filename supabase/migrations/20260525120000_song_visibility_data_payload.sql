-- Add data_payload jsonb to song_visibility_sections so songs can carry
-- "data" sections (admin-curated picks) the same way releases already do via
-- album_visibility_sections.data_payload. First use: a 'merch' section whose
-- data_payload.product_ids[] surfaces curated products on the song page.
ALTER TABLE song_visibility_sections
  ADD COLUMN IF NOT EXISTS data_payload jsonb NOT NULL DEFAULT '{}'::jsonb;
