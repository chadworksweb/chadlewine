-- Continuous amplitude envelope for the bass-synth stem.
--
-- The bass-synth track on most songs is sustained, not transient — onset
-- detection captures only the rare chord-change attacks (10 events on
-- "machine"), which makes the discrete bs dispatch in beat_data feel
-- sparse: most of the song has no ambient swell because no "hit" fires.
-- A continuous envelope (RMS sampled at ~20 Hz) lets the frontend drive
-- the ambient gradient by the synth's actual loudness at every moment,
-- so the background swells/dims smoothly with the sustained notes.
--
-- Sample rate stored explicitly: the analyzer picks a target rate
-- (default 20 Hz = 50 ms resolution) but the actual rate depends on
-- the audio's sample rate and hop length, so it's recorded for the
-- frontend to look up the right index at a given currentTime.
--
-- NULL = song has no stem-derived envelope; frontend falls back to the
-- discrete bs dispatch in beat_data (or nothing if that's empty too).

ALTER TABLE songs
  ADD COLUMN bass_synth_envelope     float8[] DEFAULT NULL,
  ADD COLUMN bass_synth_envelope_hz  real     DEFAULT NULL;

COMMENT ON COLUMN songs.bass_synth_envelope IS
  'Per-frame RMS amplitude of the bass-synth stem, normalized 0..1 via 95th-percentile. Use bass_synth_envelope_hz to map currentTime -> index. Drives the ambient gradient swell continuously instead of via discrete note attacks.';

COMMENT ON COLUMN songs.bass_synth_envelope_hz IS
  'Sample rate of bass_synth_envelope in Hz. index = floor(currentTime * hz). Typically ~20 Hz (50ms resolution).';
