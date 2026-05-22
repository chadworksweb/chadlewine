-- Precomputed beat timestamps for the press-play cube visualizer.
--
-- Live FFT-based onset detection in the browser is unreliable through dense
-- vocal sections (single-band detection can't separate kick attacks from
-- vocal energy in the same frequency range). librosa's beat tracker runs
-- once per song offline, locks onto the tempo grid, and produces accurate
-- timestamps even where individual kicks are masked. Frontend fires morphs
-- by playback time crossing each timestamp instead of analyzing live.
--
-- Stored as a sorted array of seconds (float8 to keep millisecond precision
-- without rounding artifacts). NULL = not yet analyzed; visualizer falls
-- back to live FFT detection in that case.

ALTER TABLE songs
  ADD COLUMN beat_peaks float8[] DEFAULT NULL;

-- When the song's streaming_path changes (re-master, replaced audio file),
-- the cached beats are stale. Worth nulling at upload time in the API
-- handler — but the schema doesn't enforce; that's a process choice.

COMMENT ON COLUMN songs.beat_peaks IS
  'Sorted array of beat-onset timestamps in seconds (from librosa.beat.beat_track). '
  'NULL = not analyzed yet; visualizer falls back to live FFT detection.';
