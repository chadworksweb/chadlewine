-- The demo recording itself, preserved as part of the song's state history.
-- A song that has moved on to released/published can still carry its original
-- demo file so it can be surfaced below the summary on the public detail page.
--
--   demo_streaming_path    = CDN url of the demo audio (separate from the
--                            released streaming_path).
--   demo_duration_seconds  = length of the demo, for the player UI.
--
-- Both nullable; inherit songs table grants + RLS.

ALTER TABLE songs
  ADD COLUMN IF NOT EXISTS demo_streaming_path TEXT,
  ADD COLUMN IF NOT EXISTS demo_duration_seconds INT;
