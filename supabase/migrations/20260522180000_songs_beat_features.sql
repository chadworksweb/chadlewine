-- Per-beat features: onset strength + kick-band energy + global tempo.
--
-- beat_peaks alone tells us WHEN each beat lands but not what kind of beat
-- it is. The visualizer was firing the same morph on every entry — a ghost
-- hi-hat and a slammed downbeat kick got identical responses. These columns
-- expose the per-beat character so the frontend can scale (or skip) morphs.
--
-- Parallel arrays, indices aligned with songs.beat_peaks:
--   beat_strengths[i]  full-band onset envelope at beat i, normalized 0..1
--                      per song. Use for any-onset-driven effects.
--   beat_kicks[i]      onset envelope restricted to ~20-160 Hz (kick drum
--                      fundamental + body), normalized 0..1 per song.
--                      High value = a kick is present on this beat.
-- tempo_bpm            global tempo from librosa.beat.beat_track, persisted
--                      for any beat-independent code that wants it later.
--
-- All three NULL = song hasn't been analyzed under the kick-aware pipeline.

ALTER TABLE songs
  ADD COLUMN beat_strengths float8[] DEFAULT NULL,
  ADD COLUMN beat_kicks     float8[] DEFAULT NULL,
  ADD COLUMN tempo_bpm      real     DEFAULT NULL;

COMMENT ON COLUMN songs.beat_strengths IS
  'Full-band onset strength sampled at each beat_peaks[i], normalized 0..1 per song.';

COMMENT ON COLUMN songs.beat_kicks IS
  'Kick-band (20-160 Hz) onset strength at each beat_peaks[i], normalized 0..1. High = kick on this beat.';

COMMENT ON COLUMN songs.tempo_bpm IS
  'Detected tempo in BPM from librosa.beat.beat_track.';
