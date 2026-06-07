-- Basic Yoast-style SEO override (title + meta description) for the entities
-- that did not yet have one. Songs, art, observations, curation and door_pages
-- already carry seo_title / seo_description; this brings releases, merch,
-- foundations and music_videos to parity. All columns are nullable text and
-- fall back to each entity's real title / summary when blank, so existing rows
-- need no backfill.

ALTER TABLE releases
  ADD COLUMN IF NOT EXISTS seo_title text,
  ADD COLUMN IF NOT EXISTS seo_description text;

ALTER TABLE merch
  ADD COLUMN IF NOT EXISTS seo_title text,
  ADD COLUMN IF NOT EXISTS seo_description text;

ALTER TABLE foundations
  ADD COLUMN IF NOT EXISTS seo_title text,
  ADD COLUMN IF NOT EXISTS seo_description text;

ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS seo_title text,
  ADD COLUMN IF NOT EXISTS seo_description text;
