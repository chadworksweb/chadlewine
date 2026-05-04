-- Polymorphic per-release cube face media for the simpler discography cube
-- (DiscographyCubeRadiant). 5 slots map to the visible cube faces:
--   1=front, 2=top, 3=right, 4=bottom, 5=left
-- Back face is omitted — at MAX_ANGLE=90 it's never visible.
-- Each slot holds either an image or a video, with a 1:1 focal crop.

CREATE TABLE IF NOT EXISTS release_cube_faces (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_type text NOT NULL CHECK (release_type IN ('album', 'song')),
  release_id   uuid NOT NULL,
  slot         smallint NOT NULL CHECK (slot BETWEEN 1 AND 5),
  media_type   text NOT NULL CHECK (media_type IN ('image', 'video')),
  media_path   text NOT NULL,
  focal_x      numeric,
  focal_y      numeric,
  zoom         numeric DEFAULT 1.0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (release_type, release_id, slot)
);

CREATE INDEX IF NOT EXISTS release_cube_faces_lookup_idx
  ON release_cube_faces (release_type, release_id);
