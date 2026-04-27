-- Arc Radiant v1 / migration 9 of 14
-- Cross-cutting themes (refusal-of-labels, MJ lineage, mission arc, etc.).
-- Polymorphic links table (precedent: thread_pulls in migration 001) ties
-- threads to any entity kind. Orphan rows on entity delete are accepted —
-- they never match a join.

CREATE TABLE IF NOT EXISTS thematic_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description_md text DEFAULT '',
  description_html text DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_thematic_threads_status ON thematic_threads(status);

CREATE TRIGGER thematic_threads_updated_at BEFORE UPDATE ON thematic_threads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE thematic_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read published thematic_threads"
  ON thematic_threads FOR SELECT USING (status = 'published');
CREATE POLICY "Admin full access thematic_threads"
  ON thematic_threads FOR ALL USING (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS thematic_thread_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES thematic_threads(id) ON DELETE CASCADE,
  entity_kind text NOT NULL,
  entity_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (thread_id, entity_kind, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_thematic_thread_links_thread
  ON thematic_thread_links(thread_id);
CREATE INDEX IF NOT EXISTS idx_thematic_thread_links_entity
  ON thematic_thread_links(entity_kind, entity_id);

ALTER TABLE thematic_thread_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read thematic_thread_links"
  ON thematic_thread_links FOR SELECT USING (true);
CREATE POLICY "Admin full access thematic_thread_links"
  ON thematic_thread_links FOR ALL USING (auth.role() = 'authenticated');
