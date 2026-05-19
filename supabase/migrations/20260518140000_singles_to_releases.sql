/*
  Promote single-flagged songs to first-class release entities.

  Before: songs.is_single boolean. A single was just a checkbox on a song.
  After:  every "single" is a release of type 'single' with one track linked
          via release_songs. The is_single column is dropped.

  For each song with is_single = true, insert:
    - A release row (release_type = 'single', release_format = 'digital'),
      copying title, slug, release_date, cover art, alt text, and status
      from the song. If the song slug collides with an existing release
      slug, suffix with -single.
    - A release_songs row linking the new release to the song.

  Idempotent: skips songs that already have a single-type release via
  release_songs.
*/

DO $singles_block$
DECLARE
  s record;
  new_release_id uuid;
  new_slug text;
  mapped_status text;
BEGIN
  FOR s IN
    SELECT s2.* FROM songs s2
    WHERE s2.is_single = true
    AND NOT EXISTS (
      SELECT 1 FROM release_songs rs
      JOIN releases r ON r.id = rs.release_id
      WHERE rs.song_id = s2.id AND r.release_type = 'single'
    )
  LOOP
    new_slug := s.slug;
    IF EXISTS (SELECT 1 FROM releases WHERE slug = new_slug) THEN
      new_slug := s.slug || '-single';
    END IF;

    IF s.status IN ('draft', 'published', 'unreleased') THEN
      mapped_status := s.status;
    ELSE
      mapped_status := 'draft';
    END IF;

    INSERT INTO releases (
      title, slug, release_date, cover_art_path, cover_art_alt,
      release_type, release_format, status, display_order
    ) VALUES (
      s.title, new_slug, s.release_date, s.art_image_path, s.art_alt,
      'single', 'digital', mapped_status, 0
    ) RETURNING id INTO new_release_id;

    INSERT INTO release_songs (release_id, song_id, track_number)
    VALUES (new_release_id, s.id, 1);
  END LOOP;
END $singles_block$;

ALTER TABLE songs DROP COLUMN is_single;
