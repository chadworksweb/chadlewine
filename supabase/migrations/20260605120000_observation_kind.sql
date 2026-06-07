-- Split observations into two subject-matter kinds without duplicating the table:
--   'observation' = writings NOT about Chad (outward-looking essays)
--   'journal'     = writings ABOUT Chad, his music, his experience (inward)
-- Both share the same fields, taxonomy, revisions, SEO triggers, and cross-linking.
-- Public surfaces split at /observations vs /journal; everything else filters by kind.
-- Existing rows default to 'observation'; reclassify to 'journal' individually in admin.
ALTER TABLE public.observations
  ADD COLUMN kind text NOT NULL DEFAULT 'observation'
  CHECK (kind IN ('observation', 'journal'));

CREATE INDEX idx_observations_kind ON public.observations(kind);
