-- Multi-stem drum + instrument data, replacing the per-drum parallel-array
-- model with a single sparse jsonb column.
--
-- Why the change: the v2 librosa pipeline shipped one column per drum
-- piece (beat_kicks, beat_snares). Adding a new piece (hat, tom, claps,
-- bass) costs a migration each time — visually creative iteration was
-- gated on schema churn. jsonb lets the analyzer write any subset of
-- stems without touching the schema again.
--
-- Shape: jsonb array, each element is a sparse object with `at` (time
-- in seconds) and zero or more stem keys. Keys are short to keep the
-- jsonb payload compact across hundreds of hits per song:
--   k   = kick           (face bulge morph)
--   s   = snare          (corner wingtip strobe)
--   h   = hat            (rim brightness pulse)
--   to  = tom            (cube position shake)
--   bp  = bass pulse     (uBass spike — sub-rumble)
--   bs  = bass synth     (ambient palette shift on note attack)
-- Each value is 0..1 normalized per-stem (95th-percentile, same convention
-- as analyze_beats.py).
--
-- Example:
--   [
--     {"at": 0.50, "k": 0.82},
--     {"at": 1.00, "s": 0.74, "h": 0.41},
--     {"at": 1.25, "k": 0.55, "to": 0.93}
--   ]
--
-- Backward compat: the existing beat_peaks / beat_kicks / beat_snares /
-- beat_strengths / tempo_bpm columns are NOT dropped. Songs analyzed by
-- analyze_beats.py keep their v2 librosa data and the frontend reads
-- either source. New stem-analyzed songs populate beat_data and leave
-- the old columns NULL. Once every song has been re-analyzed under the
-- stem pipeline, a later migration can drop the legacy columns.

ALTER TABLE songs
  ADD COLUMN beat_data            jsonb DEFAULT NULL,
  ADD COLUMN beat_offset_seconds  real  DEFAULT 0;

COMMENT ON COLUMN songs.beat_data IS
  'Sparse jsonb array of drum/instrument hits. Each entry: { at: seconds, k?: 0..1 kick, s?: 0..1 snare, h?: 0..1 hat, to?: 0..1 tom, bp?: 0..1 bass pulse, bs?: 0..1 bass synth }. Drives the press-play visualizer.';

COMMENT ON COLUMN songs.beat_offset_seconds IS
  'Alignment nudge applied to every beat_data event time at playback. Stems exported from Ableton rarely align to the ms with the mastered MP3 (limiter delay, fades, mastering edits). Visualizer adds this to each event.at. Positive = stems start AFTER the MP3 by this many seconds (push events later). Negative = stems start BEFORE (pull events earlier). Tune with scripts/set_beat_offset.py.';
