-- If You Like — manual structured entries for song landing page section 2.
--
-- Replaces the chat-driven if-you-like visibility section with a structured
-- admin-entered list of artist/song comparisons. Each entry is a discovery
-- hook that AI engines can extract as a structured comparison.
--
-- if_you_like_blurb: optional one-sentence section intro shown in the public
--   page's sticky aside.
-- if_you_like_entries: ordered array of {artist, title, reason}. Reason is a
--   10-20 word human description of the shared feeling, stance, or musical move.
--
-- Populated by /api/admin/song-if-you-like via SongIfYouLikePanel admin UI.
-- The legacy if-you-like row in song_visibility_sections is no longer read
-- after this change and can be deleted at any time.

ALTER TABLE songs ADD COLUMN IF NOT EXISTS if_you_like_blurb text;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS if_you_like_entries jsonb NOT NULL DEFAULT '[]'::jsonb;
