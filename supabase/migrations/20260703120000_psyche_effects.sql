-- Psyche Effects taxonomy for songs -- sibling to topics, but a felt psychological
-- ACTION ("what a listen does to you") rather than a subject. Multi-tag per song,
-- mixed valence: a song can carry both seekable and shadow effects at once.
-- Vocabulary derived from RC listener_effects_prose across the catalog.

CREATE TABLE psyche_effects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text UNIQUE NOT NULL,
  slug text UNIQUE NOT NULL,
  -- shadow = the negative-charge effects (feeds the ego, numbs you, etc.).
  -- Kept in the same table so a song's blend (e.g. wakes you up + feeds the ego)
  -- is expressible; the UI can group/label shadow separately.
  shadow boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE song_psyche_effects (
  song_id uuid REFERENCES songs(id) ON DELETE CASCADE,
  effect_id uuid REFERENCES psyche_effects(id) ON DELETE CASCADE,
  PRIMARY KEY (song_id, effect_id)
);

CREATE INDEX song_psyche_effects_effect_id_idx ON song_psyche_effects(effect_id);

-- RLS: public read, no public write (mirrors topics / song_topics)
ALTER TABLE psyche_effects ENABLE ROW LEVEL SECURITY;
ALTER TABLE song_psyche_effects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read psyche_effects" ON psyche_effects FOR SELECT USING (true);
CREATE POLICY "Public read song_psyche_effects" ON song_psyche_effects FOR SELECT USING (true);

-- Explicit grants (default grants are being removed on existing projects)
GRANT SELECT ON psyche_effects TO anon, authenticated;
GRANT SELECT ON song_psyche_effects TO anon, authenticated;

-- Seed the vocabulary (15 seekable, then 4 shadow).
INSERT INTO psyche_effects (label, slug, shadow, sort_order) VALUES
  ('dissolves separateness',   'dissolves-separateness',   false, 1),
  ('wakes you up',             'wakes-you-up',             false, 2),
  ('returns your power',       'returns-your-power',       false, 3),
  ('steels your refusal',      'steels-your-refusal',      false, 4),
  ('stands you in your truth', 'stands-you-in-your-truth', false, 5),
  ('releases what you carry',  'releases-what-you-carry',  false, 6),
  ('opens the heart',          'opens-the-heart',          false, 7),
  ('meets your grief',         'meets-your-grief',         false, 8),
  ('restores hope',            'restores-hope',            false, 9),
  ('grounds you in gratitude', 'grounds-you-in-gratitude', false, 10),
  ('fires you up',             'fires-you-up',             false, 11),
  ('settles the spin',         'settles-the-spin',         false, 12),
  ('invites growth',           'invites-growth',           false, 13),
  ('lifts your mood',          'lifts-your-mood',          false, 14),
  ('drops you into the body',  'drops-you-into-the-body',  false, 15),
  ('feeds the ego',            'feeds-the-ego',            true,  16),
  ('numbs you',                'numbs-you',                true,  17),
  ('sinks into despair',       'sinks-into-despair',       true,  18),
  ('keeps you in longing',     'keeps-you-in-longing',     true,  19);
