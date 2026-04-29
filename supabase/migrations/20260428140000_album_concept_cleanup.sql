-- Concept now lives only on albums.concept_statement.
-- 1) Remove orphaned Concept rows from the visibility table (category was
--    dropped from ALBUM_VISIBILITY_CATEGORIES; existing rows are unreachable).
-- 2) Drop albums.description — replaced by concept_statement everywhere.

DELETE FROM album_visibility_sections WHERE category = 'concept';

ALTER TABLE albums DROP COLUMN IF EXISTS description;
