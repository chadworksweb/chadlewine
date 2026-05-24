-- Drop the legacy per-song commerce columns, fully superseded by song_skus.
--
-- Preconditions verified before writing this:
--   * Every published song has a song_sku (156/156; 0 without).
--   * No purchase rows reference these columns (all song/release purchases
--     resolve downloads via release_sku_id / song_sku_id; 0 legacy-only).
--   * All code paths now read/write SKUs only -- song page, album tracklist,
--     cart-checkout, download token route, recover/verify, account downloads,
--     stripe-webhook, and the SongEditor (legacy Commerce/Downloads panels
--     removed).
--
-- song_skus / release_skus keep their own download_path_* columns -- only the
-- songs-table copies are removed here.
ALTER TABLE songs DROP COLUMN IF EXISTS price;
ALTER TABLE songs DROP COLUMN IF EXISTS download_path;
ALTER TABLE songs DROP COLUMN IF EXISTS download_path_mp3;
ALTER TABLE songs DROP COLUMN IF EXISTS download_path_flac;
ALTER TABLE songs DROP COLUMN IF EXISTS download_path_wav;
