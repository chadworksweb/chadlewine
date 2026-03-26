-- Phase 5: SEO/GEO Database Fields
-- Adds SEO/GEO scoring columns to observations table

ALTER TABLE observations ADD COLUMN IF NOT EXISTS focus_keyphrase VARCHAR(80);
ALTER TABLE observations ADD COLUMN IF NOT EXISTS secondary_keyphrases JSONB DEFAULT '[]';
ALTER TABLE observations ADD COLUMN IF NOT EXISTS search_intent VARCHAR(20) DEFAULT 'informational';
ALTER TABLE observations ADD COLUMN IF NOT EXISTS citation_summary VARCHAR(300);
ALTER TABLE observations ADD COLUMN IF NOT EXISTS paa_pairs JSONB DEFAULT '[]';
ALTER TABLE observations ADD COLUMN IF NOT EXISTS entity_tags JSONB DEFAULT '[]';
ALTER TABLE observations ADD COLUMN IF NOT EXISTS date_modified TIMESTAMPTZ;
ALTER TABLE observations ADD COLUMN IF NOT EXISTS word_count INTEGER;
ALTER TABLE observations ADD COLUMN IF NOT EXISTS reading_time_minutes NUMERIC(4,1);
ALTER TABLE observations ADD COLUMN IF NOT EXISTS geo_readiness_score INTEGER DEFAULT 0;
ALTER TABLE observations ADD COLUMN IF NOT EXISTS first_sentence_extractable BOOLEAN DEFAULT FALSE;
ALTER TABLE observations ADD COLUMN IF NOT EXISTS article_type VARCHAR(20) DEFAULT 'article';

-- Trigger: auto-compute word_count and reading_time_minutes on body change
CREATE OR REPLACE FUNCTION compute_observation_reading_stats()
RETURNS TRIGGER AS $$
DECLARE
  stripped TEXT;
  wc INTEGER;
BEGIN
  -- Strip HTML tags to get plain text
  stripped := regexp_replace(NEW.body, '<[^>]+>', ' ', 'g');
  -- Collapse whitespace and count words
  stripped := regexp_replace(trim(stripped), '\s+', ' ', 'g');
  wc := array_length(string_to_array(stripped, ' '), 1);
  IF wc IS NULL THEN wc := 0; END IF;

  NEW.word_count := wc;
  NEW.reading_time_minutes := ROUND((wc / 238.0)::numeric, 1);
  NEW.date_modified := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_observation_reading_stats ON observations;
CREATE TRIGGER trg_observation_reading_stats
  BEFORE INSERT OR UPDATE OF body ON observations
  FOR EACH ROW
  EXECUTE FUNCTION compute_observation_reading_stats();

-- Trigger: auto-compute geo_readiness_score from SEO fields
CREATE OR REPLACE FUNCTION compute_geo_readiness_score()
RETURNS TRIGGER AS $$
DECLARE
  score INTEGER := 0;
  wc INTEGER;
  h2_count INTEGER;
  internal_link_count INTEGER;
  secondary_count INTEGER;
  paa_count INTEGER;
  entity_count INTEGER;
BEGIN
  wc := COALESCE(NEW.word_count, 0);

  -- Citation summary present: 15 points
  IF NEW.citation_summary IS NOT NULL AND length(trim(NEW.citation_summary)) > 0 THEN
    score := score + 15;
  END IF;

  -- First sentence extractable: 10 points
  IF NEW.first_sentence_extractable = TRUE THEN
    score := score + 10;
  END IF;

  -- Focus keyphrase set: 10 points
  IF NEW.focus_keyphrase IS NOT NULL AND length(trim(NEW.focus_keyphrase)) > 0 THEN
    score := score + 10;
  END IF;

  -- Word count in range: 10 points
  IF wc >= 1000 AND wc <= 2000 THEN
    score := score + 10;
  ELSIF wc >= 400 AND wc < 1000 THEN
    score := score + 5;
  END IF;

  -- Heading structure: 10 points (check for H2 tags in body)
  h2_count := (SELECT count(*) FROM regexp_matches(COALESCE(NEW.body, ''), '<h2[^>]*>', 'gi'));
  IF h2_count >= 2 THEN
    score := score + 10;
  ELSIF h2_count = 1 THEN
    score := score + 5;
  END IF;

  -- PAA pairs: 10 points
  paa_count := jsonb_array_length(COALESCE(NEW.paa_pairs, '[]'::jsonb));
  IF paa_count >= 2 THEN
    score := score + 10;
  ELSIF paa_count = 1 THEN
    score := score + 5;
  END IF;

  -- Internal links: 15 points (count href="/observations/" in body)
  internal_link_count := (SELECT count(*) FROM regexp_matches(COALESCE(NEW.body, ''), 'href="/observations/', 'gi'));
  IF internal_link_count >= 2 THEN
    score := score + 15;
  ELSIF internal_link_count = 1 THEN
    score := score + 7;
  END IF;

  -- Secondary keyphrases: 5 points
  secondary_count := jsonb_array_length(COALESCE(NEW.secondary_keyphrases, '[]'::jsonb));
  IF secondary_count >= 2 THEN
    score := score + 5;
  END IF;

  -- Entity tags: 5 points
  entity_count := jsonb_array_length(COALESCE(NEW.entity_tags, '[]'::jsonb));
  IF entity_count >= 1 THEN
    score := score + 5;
  END IF;

  -- OG image + alt: 5 points
  IF NEW.art_image_path IS NOT NULL AND length(trim(NEW.art_image_path)) > 0
     AND NEW.art_alt IS NOT NULL AND length(trim(NEW.art_alt)) > 0 THEN
    score := score + 5;
  END IF;

  -- Date fields auto-filled: 5 points
  IF NEW.date_captured IS NOT NULL AND NEW.published_at IS NOT NULL THEN
    score := score + 5;
  END IF;

  NEW.geo_readiness_score := score;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_geo_readiness_score ON observations;
CREATE TRIGGER trg_geo_readiness_score
  BEFORE INSERT OR UPDATE ON observations
  FOR EACH ROW
  EXECUTE FUNCTION compute_geo_readiness_score();

-- Backfill word_count, reading_time, and geo_readiness_score for existing rows
UPDATE observations SET body = body WHERE body IS NOT NULL;
