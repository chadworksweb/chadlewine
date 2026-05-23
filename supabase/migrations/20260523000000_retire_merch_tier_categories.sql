-- Retire the defunct merch "tier" category system: The Art tier page, The Line,
-- The Fusion, The Pick, and the (never-used) configurator that fed them. The
-- real art-merch discriminators art_print / art_original stay -- those are how
-- prints/originals of actual art pieces are tagged, separate from categories.
--
-- tier becomes nullable so regular merch (curated apparel, etc.) carries no
-- category. Live products currently tagged 'line' are NOT deleted -- only their
-- now-meaningless category tag is cleared.

-- 1. Allow category-less products.
ALTER TABLE products ALTER COLUMN tier DROP NOT NULL;

-- 2. Clear every retired category value (keeps the product rows themselves).
UPDATE products SET tier = NULL WHERE tier IN ('art', 'line', 'fusion', 'pick');

-- 3. Tighten the CHECK to only the surviving art-merch values (or NULL).
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_tier_check;
ALTER TABLE products ADD CONSTRAINT products_tier_check
  CHECK (tier IS NULL OR tier IN ('art_original', 'art_print'));

-- 4. Drop the song-side "The Pick" columns. These fed only the removed
--    configurator (curated lyric lines a visitor could put on merch) and the
--    SongEditor panel; nothing reads them anymore and no song page displays
--    them. (Observation hook_line is a different column on a different table
--    and is untouched.)
ALTER TABLE songs DROP COLUMN IF EXISTS hook_line;
ALTER TABLE songs DROP COLUMN IF EXISTS merch_lines;
ALTER TABLE songs DROP COLUMN IF EXISTS merch_enabled;
