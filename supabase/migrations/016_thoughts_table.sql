-- Phase 9: Thoughts as content containers
-- A Thought is a named theme that accumulates Meditations and Observations over time
-- Distinct from Thoughtlines (taxonomy) — Thoughts are visible public containers

CREATE TABLE thoughts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_thoughts_slug ON thoughts(slug);
CREATE INDEX idx_thoughts_status ON thoughts(status);

CREATE TRIGGER thoughts_updated_at BEFORE UPDATE ON thoughts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Junction tables: which content belongs to which Thought
CREATE TABLE observation_thoughts (
  observation_id uuid REFERENCES observations(id) ON DELETE CASCADE,
  thought_id uuid REFERENCES thoughts(id) ON DELETE CASCADE,
  PRIMARY KEY (observation_id, thought_id)
);

CREATE TABLE meditation_thoughts (
  meditation_id uuid REFERENCES meditations(id) ON DELETE CASCADE,
  thought_id uuid REFERENCES thoughts(id) ON DELETE CASCADE,
  PRIMARY KEY (meditation_id, thought_id)
);

-- RLS
ALTER TABLE thoughts ENABLE ROW LEVEL SECURITY;
ALTER TABLE observation_thoughts ENABLE ROW LEVEL SECURITY;
ALTER TABLE meditation_thoughts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read published thoughts" ON thoughts FOR SELECT USING (status = 'published');
CREATE POLICY "Public can read observation_thoughts" ON observation_thoughts FOR SELECT USING (true);
CREATE POLICY "Public can read meditation_thoughts" ON meditation_thoughts FOR SELECT USING (true);

CREATE POLICY "Admin full access thoughts" ON thoughts FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin full access observation_thoughts" ON observation_thoughts FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin full access meditation_thoughts" ON meditation_thoughts FOR ALL USING (auth.role() = 'authenticated');

CREATE INDEX idx_observation_thoughts_thought ON observation_thoughts(thought_id);
CREATE INDEX idx_meditation_thoughts_thought ON meditation_thoughts(thought_id);
