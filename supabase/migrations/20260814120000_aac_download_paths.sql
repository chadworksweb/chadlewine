-- AAC download paths.
-- Fourth pack format alongside MP3 / FLAC / WAV.
-- The AAC pack is .m4a in an MP4 container with
-- artwork embedded per file, built for a clean
-- drag-and-drop import into iTunes / Music.app.

ALTER TABLE release_skus
  ADD COLUMN IF NOT EXISTS download_path_aac text;

ALTER TABLE song_skus
  ADD COLUMN IF NOT EXISTS download_path_aac text;

-- purchases.format records what the buyer picked at
-- checkout. Widen its CHECK to accept aac.
ALTER TABLE purchases
  DROP CONSTRAINT IF EXISTS purchases_format_check;

ALTER TABLE purchases
  ADD CONSTRAINT purchases_format_check
  CHECK (format IS NULL OR format IN ('mp3', 'flac', 'wav', 'aac'));
