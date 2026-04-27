-- Arc Radiant v1 / migration 12 of 14
-- Prose backbone storage. Hybrid model (locked decision #3 + audit Q2 = C):
-- Supabase is the source of truth (workbench + revision history); the
-- /prose/sections/*.md files in the repo are build-time export artifacts
-- regenerated from Supabase. No AI in the prose system — Chad writes and
-- edits manually.
--
-- Stale-flag system (per §7): is_stale flips true when a node in scope is
-- captured/updated; stale_reasons jsonb logs what changed. Cleared on publish.
--
-- Polymorphic prose_section_dependencies: ON DELETE CASCADE on section_id
-- only; orphan (entity_kind, entity_id) rows on entity delete are accepted.

CREATE TABLE IF NOT EXISTS prose_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  order_index integer NOT NULL,
  scope_kind text NOT NULL CHECK (scope_kind IN ('era','date-range','thematic')),
  era_id uuid REFERENCES eras(id) ON DELETE SET NULL,
  date_start date,
  date_end date,
  thematic_thread_ids uuid[],
  content_md text DEFAULT '',
  content_html text DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  is_stale boolean NOT NULL DEFAULT false,
  stale_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_published_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prose_sections_order ON prose_sections(order_index);
CREATE INDEX IF NOT EXISTS idx_prose_sections_scope ON prose_sections(scope_kind);
CREATE INDEX IF NOT EXISTS idx_prose_sections_dates
  ON prose_sections(date_start, date_end)
  WHERE scope_kind = 'date-range';
CREATE INDEX IF NOT EXISTS idx_prose_sections_era
  ON prose_sections(era_id) WHERE era_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prose_sections_stale
  ON prose_sections(id) WHERE is_stale = true;
CREATE INDEX IF NOT EXISTS idx_prose_sections_status ON prose_sections(status);

CREATE TRIGGER prose_sections_updated_at BEFORE UPDATE ON prose_sections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE prose_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read published prose_sections"
  ON prose_sections FOR SELECT USING (status = 'published');
CREATE POLICY "Admin full access prose_sections"
  ON prose_sections FOR ALL USING (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS prose_section_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES prose_sections(id) ON DELETE CASCADE,
  revision_number integer NOT NULL,
  content_md text NOT NULL,
  content_html text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  UNIQUE (section_id, revision_number)
);

CREATE INDEX IF NOT EXISTS idx_prose_section_revisions_section
  ON prose_section_revisions(section_id, revision_number DESC);

ALTER TABLE prose_section_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access prose_section_revisions"
  ON prose_section_revisions FOR ALL USING (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS prose_section_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES prose_sections(id) ON DELETE CASCADE,
  entity_kind text NOT NULL,
  entity_id uuid NOT NULL,
  added_at timestamptz DEFAULT now(),
  UNIQUE (section_id, entity_kind, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_prose_section_dependencies_section
  ON prose_section_dependencies(section_id);
CREATE INDEX IF NOT EXISTS idx_prose_section_dependencies_entity
  ON prose_section_dependencies(entity_kind, entity_id);

ALTER TABLE prose_section_dependencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access prose_section_dependencies"
  ON prose_section_dependencies FOR ALL USING (auth.role() = 'authenticated');
