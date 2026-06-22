-- Psyche Facts label: authored "prescription" layer per song and release.
-- The RC-derived label fields (tier, charge, listener + societal prose) come
-- live from the badge fetch at render time; this jsonb holds only the authored
-- or Opus-generated prescription layer (purpose, indicated_for, do_not_use_if,
-- directions, onset, duration, warning, plus optional distilled effects /
-- at_scale bullets). Nullable; editable in admin; regenerable from RC prose.
ALTER TABLE songs    ADD COLUMN IF NOT EXISTS label_meta jsonb;
ALTER TABLE releases ADD COLUMN IF NOT EXISTS label_meta jsonb;

COMMENT ON COLUMN songs.label_meta IS 'Psyche Facts authored layer (jsonb): purpose, indicated_for[], do_not_use_if, directions, onset, duration, warning, effects[], at_scale[].';
COMMENT ON COLUMN releases.label_meta IS 'Supplement Facts authored layer for the release-level Consciousness label (jsonb).';
