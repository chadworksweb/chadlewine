-- Per-beat snare-band energy, parallel to beat_peaks / beat_kicks.
--
-- beat_snares[i] = onset envelope restricted to ~200-450 Hz on the
-- percussive stem (HPSS), normalized 0..1 per song via 95th-percentile.
-- High value = snare-like transient present on that beat. The visualizer
-- uses this to fire a different morph (corner-spike) distinct from the
-- kick morph (radial face bulge), so kicks and snares look different.

ALTER TABLE songs
  ADD COLUMN beat_snares float8[] DEFAULT NULL;

COMMENT ON COLUMN songs.beat_snares IS
  'Snare-band (200-450 Hz) onset strength at each beat_peaks[i], normalized 0..1 per song.';
