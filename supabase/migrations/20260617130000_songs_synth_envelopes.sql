-- Transcend the Machine: per-song extra continuous synth-envelope channels for
-- the reactive engine, beyond the fixed kick / snare / hat / tom / bass-pulse /
-- bass-synth set. Maps a channel key -> { "env": [0..1, ...], "hz": number },
-- e.g. the sustained "chord" pad and the "warp" texture in See Through Me. Each
-- song maps whichever of its synth stems fit; the game drives a fixed visual per
-- channel key (chord -> harmonic glow, warp -> spatial warp). Written
-- server-side by analyze_drums_stems.py via the service role.
ALTER TABLE songs ADD COLUMN IF NOT EXISTS synth_envelopes jsonb;
