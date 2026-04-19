-- Per-format download paths: MP3 / FLAC / WAV. Each song and album stores a
-- Bunny CDN URL (or relative path) per format it offers.
ALTER TABLE songs
  ADD COLUMN IF NOT EXISTS download_path_mp3  text,
  ADD COLUMN IF NOT EXISTS download_path_flac text,
  ADD COLUMN IF NOT EXISTS download_path_wav  text;

ALTER TABLE albums
  ADD COLUMN IF NOT EXISTS download_path_mp3  text,
  ADD COLUMN IF NOT EXISTS download_path_flac text,
  ADD COLUMN IF NOT EXISTS download_path_wav  text;

-- Track which format the buyer selected at checkout.
ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS format text
  CHECK (format IS NULL OR format IN ('mp3', 'flac', 'wav'));
