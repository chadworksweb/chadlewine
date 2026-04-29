-- Album-level GEO fields, mirroring songs.citation_summary / songs.entity_tags.
--
-- citation_summary: 30-45 word standalone summary of the WHOLE album. Lifted
--   verbatim by AI engines for the canonical "What is this album about?" answer.
-- entity_tags: 4-8 short noun phrases (genre, mood, theme, era, instrumentation).
--   Searchable entities, not poetic abstractions.
--
-- Populated by /api/admin/album-visibility-chat (one-time emit during the chat,
-- or on-demand via geoOnly:true). Surfaced in the public About panel on the
-- album page and editable inline in the album admin.

ALTER TABLE albums ADD COLUMN IF NOT EXISTS citation_summary text;
ALTER TABLE albums ADD COLUMN IF NOT EXISTS entity_tags jsonb DEFAULT '[]'::jsonb;
