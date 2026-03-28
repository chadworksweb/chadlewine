-- Add download_path for protected WAV downloads (Bunny CDN signed URLs)
ALTER TABLE tracks ADD COLUMN download_path text;
