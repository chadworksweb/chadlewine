-- Rename tracks → songs and extract track_number into album_songs junction

-- 0. Fix duplicate track_numbers before migration
-- Renumber duplicates within each album using row_number
UPDATE tracks t
SET track_number = sub.new_num
FROM (
  SELECT id,
         row_number() OVER (PARTITION BY album_id ORDER BY track_number, created_at) AS new_num
  FROM tracks
  WHERE album_id IS NOT NULL
) sub
WHERE t.id = sub.id;

-- 1. Rename the table
ALTER TABLE tracks RENAME TO songs;

-- 2. Create junction table
CREATE TABLE album_songs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  album_id uuid NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  song_id uuid NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  track_number int NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  UNIQUE(album_id, song_id),
  UNIQUE(album_id, track_number)
);

-- 3. Migrate existing relationships
INSERT INTO album_songs (album_id, song_id, track_number)
SELECT album_id, id, track_number
FROM songs
WHERE album_id IS NOT NULL;

-- 4. Drop album_id and track_number from songs
ALTER TABLE songs DROP COLUMN track_number;
ALTER TABLE songs DROP COLUMN album_id;

-- 5. RLS on album_songs
ALTER TABLE album_songs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "album_songs_public_read"
  ON album_songs FOR SELECT
  USING (true);

CREATE POLICY "album_songs_admin_all"
  ON album_songs FOR ALL
  USING (true)
  WITH CHECK (true);
