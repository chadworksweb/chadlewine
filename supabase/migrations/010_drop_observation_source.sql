-- Remove source column from observations (no longer needed)
ALTER TABLE observations DROP COLUMN IF EXISTS source;
