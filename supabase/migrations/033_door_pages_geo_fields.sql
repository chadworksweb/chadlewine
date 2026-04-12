-- Add GEO/SEO authoring fields to door_pages
-- Mirrors the observation GEO fields for universal authoring panel support

ALTER TABLE door_pages ADD COLUMN IF NOT EXISTS focus_keyphrase text;
ALTER TABLE door_pages ADD COLUMN IF NOT EXISTS secondary_keyphrases jsonb DEFAULT '[]';
ALTER TABLE door_pages ADD COLUMN IF NOT EXISTS search_intent text DEFAULT 'informational';
ALTER TABLE door_pages ADD COLUMN IF NOT EXISTS citation_summary text;
ALTER TABLE door_pages ADD COLUMN IF NOT EXISTS first_sentence_extractable boolean DEFAULT false;
ALTER TABLE door_pages ADD COLUMN IF NOT EXISTS paa_pairs jsonb DEFAULT '[]';
ALTER TABLE door_pages ADD COLUMN IF NOT EXISTS entity_tags jsonb DEFAULT '[]';
ALTER TABLE door_pages ADD COLUMN IF NOT EXISTS article_type text DEFAULT 'article';
ALTER TABLE door_pages ADD COLUMN IF NOT EXISTS og_alt text;
ALTER TABLE door_pages ADD COLUMN IF NOT EXISTS seo_title text;
ALTER TABLE door_pages ADD COLUMN IF NOT EXISTS seo_description text;
ALTER TABLE door_pages ADD COLUMN IF NOT EXISTS hook_line text;
ALTER TABLE door_pages ADD COLUMN IF NOT EXISTS tension_line text;
