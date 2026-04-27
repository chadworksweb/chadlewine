-- Arc Radiant v1 / migration 7 of 14
-- People in the arc: collaborators, friends, mentors, industry counterparties.
-- role is free text (not enum) — variability is high and fixed list would lie.
-- Two junctions (song_relationships, life_event_relationships) wire people
-- to events and songs.

CREATE TABLE IF NOT EXISTS relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  full_name text NOT NULL,
  role text,
  first_contact_date date,
  last_contact_date date,
  still_active boolean DEFAULT true,
  body_md text DEFAULT '',
  body_html text DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_relationships_dates
  ON relationships(first_contact_date, last_contact_date);
CREATE INDEX IF NOT EXISTS idx_relationships_status ON relationships(status);

CREATE TRIGGER relationships_updated_at BEFORE UPDATE ON relationships
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read published relationships"
  ON relationships FOR SELECT USING (status = 'published');
CREATE POLICY "Admin full access relationships"
  ON relationships FOR ALL USING (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS song_relationships (
  song_id uuid NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  relationship_id uuid NOT NULL REFERENCES relationships(id) ON DELETE CASCADE,
  role_in_song text,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (song_id, relationship_id)
);

CREATE INDEX IF NOT EXISTS idx_song_relationships_song ON song_relationships(song_id);
CREATE INDEX IF NOT EXISTS idx_song_relationships_rel ON song_relationships(relationship_id);

ALTER TABLE song_relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read song_relationships"
  ON song_relationships FOR SELECT USING (true);
CREATE POLICY "Admin full access song_relationships"
  ON song_relationships FOR ALL USING (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS life_event_relationships (
  life_event_id uuid NOT NULL REFERENCES life_events(id) ON DELETE CASCADE,
  relationship_id uuid NOT NULL REFERENCES relationships(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (life_event_id, relationship_id)
);

CREATE INDEX IF NOT EXISTS idx_life_event_relationships_event
  ON life_event_relationships(life_event_id);
CREATE INDEX IF NOT EXISTS idx_life_event_relationships_rel
  ON life_event_relationships(relationship_id);

ALTER TABLE life_event_relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read life_event_relationships"
  ON life_event_relationships FOR SELECT USING (true);
CREATE POLICY "Admin full access life_event_relationships"
  ON life_event_relationships FOR ALL USING (auth.role() = 'authenticated');
