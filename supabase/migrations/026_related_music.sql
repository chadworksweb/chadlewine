-- Add related_music jsonb to observations and meditations
-- Format: [{ "type": "song"|"album", "id": "uuid" }, ...]

ALTER TABLE observations ADD COLUMN related_music jsonb DEFAULT '[]'::jsonb;
ALTER TABLE meditations ADD COLUMN related_music jsonb DEFAULT '[]'::jsonb;
