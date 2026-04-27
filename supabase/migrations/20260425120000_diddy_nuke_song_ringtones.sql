-- Hard-delete the Diddy product line and introduce per-song Ringtone as a
-- separate SKU.
--
-- Diddy was an Observation-era construct (a 31-second hook tied to each
-- Observation) sold as MP3 / WAV / Ringtone. We're killing it entirely:
-- ringtones move to the Song level as their own product (different audio file,
-- different price, different delivery), sold inline alongside the song
-- download.

-- 1. Hard-delete diddy data.
DELETE FROM purchases WHERE item_type = 'diddy';
DELETE FROM products  WHERE tier      = 'diddy';

-- 2. Drop 'diddy' from products.tier CHECK and add 'ringtone' to
--    purchases.item_type CHECK. Older migrations layered constraints on top
--    of one another via DROP/ADD; we follow the same pattern here.
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_tier_check;
ALTER TABLE products ADD CONSTRAINT products_tier_check
  CHECK (tier IN ('art', 'art_original', 'art_print', 'line', 'fusion', 'pick'));

ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_item_type_check;
ALTER TABLE purchases ADD CONSTRAINT purchases_item_type_check
  CHECK (item_type IN ('song', 'album', 'merch', 'ringtone'));

-- 3. Per-song Ringtone product surface. Two audio paths because iPhone
--    requires .m4r and Android requires .mp3 — one purchase delivers both.
ALTER TABLE songs
  ADD COLUMN IF NOT EXISTS ringtone_path_m4r text,
  ADD COLUMN IF NOT EXISTS ringtone_path_mp3 text,
  ADD COLUMN IF NOT EXISTS ringtone_price    numeric;
