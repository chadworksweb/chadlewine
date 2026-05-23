-- Per-frame pitch of the bass-synth stem, normalized 0..1 over the
-- song's own MIDI-pitch range. Aligned with songs.bass_synth_envelope
-- (same sample rate, same length).
--
-- The bass-synth track on most songs progresses through pitched notes
-- (not chords). Envelope tells us "how loud" but not "what note" —
-- without the latter the ambient color cast stays static across pitch
-- changes that the listener can hear. Frontend drives ambient + glow
-- HUE rotation by this column, gated by envelope intensity (so silent
-- sections don't leak a stale color).
--
-- Normalization: in MIDI semitone space (perceptual / linear-in-pitch),
-- not Hz space (perceptually log-skewed). Lowest detected note in the
-- song maps to 0, highest to 1. Unvoiced / unpitched frames hold the
-- last valid value so brief gaps in the synth line don't snap the
-- ambient color.
--
-- NULL = no pitch data; frontend skips pitch-driven hue and falls back
-- to the static hue-rotate multiplier on bass_synth alone.

ALTER TABLE songs
  ADD COLUMN bass_synth_pitch float8[] DEFAULT NULL;

COMMENT ON COLUMN songs.bass_synth_pitch IS
  'Per-frame pitch of the bass-synth stem, normalized 0..1 over the song''s own MIDI range. Aligned with bass_synth_envelope (same sample rate + length). Drives ambient/glow hue rotation, gated by envelope intensity.';
