-- Add format stack columns to song_visibility_sections
-- Each section now stores three extraction layers:
--   direct_answer: 40-60 word standalone block (Perplexity, Gemini AI Overview)
--   key_points: bullet summary array (Perplexity, Gemini structured extraction)
--   content (existing): prose narrative (ChatGPT, all engines)

ALTER TABLE song_visibility_sections
  ADD COLUMN IF NOT EXISTS direct_answer text,
  ADD COLUMN IF NOT EXISTS key_points text[] DEFAULT '{}';
