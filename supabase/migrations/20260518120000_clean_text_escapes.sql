/*
  Clean JSON-style backslash-escape corruption in text columns.

  Pattern: a literal backslash followed by a double quote, or a literal
  backslash followed by a single quote. These came from a one-off import
  that double-encoded quotes.

  Uses chr(92) for backslash, chr(34) for double quote, chr(39) for single
  quote to keep this SQL fully ASCII and avoid embedding literal escape
  sequences in this file.

  Each UPDATE is gated by a WHERE clause so this is idempotent and safe to
  run on tables that are not affected. Lyrics and other free-form prose
  columns are deliberately excluded because legitimate backslash usage is
  possible there.
*/

UPDATE videos
SET title = REPLACE(REPLACE(title, chr(92) || chr(34), chr(34)), chr(92) || chr(39), chr(39))
WHERE title LIKE '%' || chr(92) || chr(34) || '%'
   OR title LIKE '%' || chr(92) || chr(39) || '%';

UPDATE videos
SET description = REPLACE(REPLACE(description, chr(92) || chr(34), chr(34)), chr(92) || chr(39), chr(39))
WHERE description LIKE '%' || chr(92) || chr(34) || '%'
   OR description LIKE '%' || chr(92) || chr(39) || '%';

UPDATE songs
SET title = REPLACE(REPLACE(title, chr(92) || chr(34), chr(34)), chr(92) || chr(39), chr(39))
WHERE title LIKE '%' || chr(92) || chr(34) || '%'
   OR title LIKE '%' || chr(92) || chr(39) || '%';

UPDATE songs
SET song_summary = REPLACE(REPLACE(song_summary, chr(92) || chr(34), chr(34)), chr(92) || chr(39), chr(39))
WHERE song_summary LIKE '%' || chr(92) || chr(34) || '%'
   OR song_summary LIKE '%' || chr(92) || chr(39) || '%';

UPDATE albums
SET title = REPLACE(REPLACE(title, chr(92) || chr(34), chr(34)), chr(92) || chr(39), chr(39))
WHERE title LIKE '%' || chr(92) || chr(34) || '%'
   OR title LIKE '%' || chr(92) || chr(39) || '%';

UPDATE art_pieces
SET title = REPLACE(REPLACE(title, chr(92) || chr(34), chr(34)), chr(92) || chr(39), chr(39))
WHERE title LIKE '%' || chr(92) || chr(34) || '%'
   OR title LIKE '%' || chr(92) || chr(39) || '%';

UPDATE art_pieces
SET art_summary = REPLACE(REPLACE(art_summary, chr(92) || chr(34), chr(34)), chr(92) || chr(39), chr(39))
WHERE art_summary LIKE '%' || chr(92) || chr(34) || '%'
   OR art_summary LIKE '%' || chr(92) || chr(39) || '%';

UPDATE observations
SET title = REPLACE(REPLACE(title, chr(92) || chr(34), chr(34)), chr(92) || chr(39), chr(39))
WHERE title LIKE '%' || chr(92) || chr(34) || '%'
   OR title LIKE '%' || chr(92) || chr(39) || '%';

UPDATE products
SET title = REPLACE(REPLACE(title, chr(92) || chr(34), chr(34)), chr(92) || chr(39), chr(39))
WHERE title LIKE '%' || chr(92) || chr(34) || '%'
   OR title LIKE '%' || chr(92) || chr(39) || '%';

UPDATE products
SET description = REPLACE(REPLACE(description, chr(92) || chr(34), chr(34)), chr(92) || chr(39), chr(39))
WHERE description LIKE '%' || chr(92) || chr(34) || '%'
   OR description LIKE '%' || chr(92) || chr(39) || '%';
