-- Rename the content model from "observations" to "posts" ("Writings").
-- The table was already the unified atomic content unit (discriminated by the
-- `kind` column = 'observation' | 'journal'); this rename makes the naming match
-- the model: one `posts` table, with observation/journal as filters, not blogs.
--
-- ALTER TABLE ... RENAME preserves all data, indexes, FKs, constraints, RLS
-- policies, triggers, and grants automatically. The existing indexes, triggers,
-- and policies keep working under their original (observation-flavored) names --
-- those names are cosmetic and intentionally left alone to keep this migration
-- minimal and safe on the live DB. The only behavioral change is the geo-score
-- function, whose body hardcodes an internal-link URL that must move.
--
-- Out of scope (intentionally NOT renamed): analytics_events.observation_id and
-- the analytics views, source_observation_id FKs on subscribers/merch/patrons
-- (their FK target follows the table automatically), the Stripe metadata key,
-- the related_entities 'observation' entity-type token, and the
-- "observation-images" storage bucket.

-- ============================================================
-- 1. CORE TABLE + JUNCTIONS
-- ============================================================
ALTER TABLE public.observations RENAME TO posts;
ALTER TABLE public.observation_categories   RENAME TO post_categories;
ALTER TABLE public.observation_thoughtlines RENAME TO post_thoughtlines;
ALTER TABLE public.observation_tags         RENAME TO post_tags;

-- ============================================================
-- 2. JUNCTION FK COLUMNS (observation_id -> post_id)
-- ============================================================
ALTER TABLE public.post_categories   RENAME COLUMN observation_id TO post_id;
ALTER TABLE public.post_thoughtlines RENAME COLUMN observation_id TO post_id;
ALTER TABLE public.post_tags         RENAME COLUMN observation_id TO post_id;

-- ============================================================
-- 3. EXPLICIT GRANTS (project convention; Supabase is removing default grants)
-- ============================================================
GRANT SELECT ON public.posts TO anon;
GRANT ALL    ON public.posts TO authenticated, service_role;
GRANT SELECT ON public.post_categories, public.post_thoughtlines, public.post_tags TO anon;
GRANT ALL    ON public.post_categories, public.post_thoughtlines, public.post_tags TO authenticated, service_role;

-- ============================================================
-- 4. GEO-READINESS FUNCTION: fix the hardcoded internal-link URL
-- ============================================================
-- The public reader URLs move to /writings/observations/ and /writings/journal/.
-- Match both the new prefixed URLs and the legacy /observations//journal/ forms
-- still present in existing post bodies (which 301 to the new URLs), so scores
-- don't regress. CREATE OR REPLACE is safe and idempotent. (This function is
-- bound to the trigger trg_geo_readiness_score, which survives the table rename.)
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

  IF NEW.citation_summary IS NOT NULL AND length(trim(NEW.citation_summary)) > 0 THEN
    score := score + 15;
  END IF;

  IF NEW.first_sentence_extractable = TRUE THEN
    score := score + 10;
  END IF;

  IF NEW.focus_keyphrase IS NOT NULL AND length(trim(NEW.focus_keyphrase)) > 0 THEN
    score := score + 10;
  END IF;

  IF wc >= 1000 AND wc <= 2000 THEN
    score := score + 10;
  ELSIF wc >= 400 AND wc < 1000 THEN
    score := score + 5;
  END IF;

  h2_count := (SELECT count(*) FROM regexp_matches(COALESCE(NEW.body, ''), '<h2[^>]*>', 'gi'));
  IF h2_count >= 2 THEN
    score := score + 10;
  ELSIF h2_count = 1 THEN
    score := score + 5;
  END IF;

  paa_count := jsonb_array_length(COALESCE(NEW.paa_pairs, '[]'::jsonb));
  IF paa_count >= 2 THEN
    score := score + 10;
  ELSIF paa_count = 1 THEN
    score := score + 5;
  END IF;

  -- Internal links: 15 points. Matches /writings/observations/, /writings/journal/,
  -- and the legacy /observations/ + /journal/ forms.
  internal_link_count := (SELECT count(*) FROM regexp_matches(COALESCE(NEW.body, ''), 'href="/(writings/)?(observations|journal)/', 'gi'));
  IF internal_link_count >= 2 THEN
    score := score + 15;
  ELSIF internal_link_count = 1 THEN
    score := score + 7;
  END IF;

  secondary_count := jsonb_array_length(COALESCE(NEW.secondary_keyphrases, '[]'::jsonb));
  IF secondary_count >= 2 THEN
    score := score + 5;
  END IF;

  entity_count := jsonb_array_length(COALESCE(NEW.entity_tags, '[]'::jsonb));
  IF entity_count >= 1 THEN
    score := score + 5;
  END IF;

  IF NEW.art_image_path IS NOT NULL AND length(trim(NEW.art_image_path)) > 0
     AND NEW.art_alt IS NOT NULL AND length(trim(NEW.art_alt)) > 0 THEN
    score := score + 5;
  END IF;

  IF NEW.date_captured IS NOT NULL AND NEW.published_at IS NOT NULL THEN
    score := score + 5;
  END IF;

  NEW.geo_readiness_score := score;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
