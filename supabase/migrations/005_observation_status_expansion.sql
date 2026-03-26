-- Add 'private' and 'trash' to observations status constraint

ALTER TABLE observations DROP CONSTRAINT observations_status_check;
ALTER TABLE observations ADD CONSTRAINT observations_status_check
  CHECK (status IN ('draft', 'published', 'private', 'trash', 'volume-collected'));
