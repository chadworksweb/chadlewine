-- !!! POST-DEPLOY ONLY !!!
-- Do NOT run until the new code (.from("merch"), YMAL related_entities) is live
-- in production. This removes the products compat view and the dormant featured
-- tables that the *previously deployed* code still reads -- running it early
-- breaks prod's /merch and song-page art pairings.

-- Repoint product_images RLS off the products view before dropping it
-- (the policy depends on the view).
DROP POLICY IF EXISTS "Public can read visible product_images" ON product_images;
CREATE POLICY "Public can read visible product_images"
  ON product_images FOR SELECT
  USING (
    deleted_at IS NULL
    AND is_hidden = false
    AND EXISTS (
      SELECT 1 FROM merch m
      WHERE m.id = product_images.product_id AND m.status = 'active'
    )
  );

DROP VIEW IF EXISTS products;

-- Art pairings unified into related_entities; data already migrated.
DROP TABLE IF EXISTS songs_featured_art;
DROP TABLE IF EXISTS art_featured_songs;
DROP TABLE IF EXISTS art_featured_art;

-- Dead since the meditation-merch and song-merch-panel removals.
ALTER TABLE merch DROP COLUMN IF EXISTS source_meditation_id;
ALTER TABLE song_visibility_sections DROP COLUMN IF EXISTS data_payload;
