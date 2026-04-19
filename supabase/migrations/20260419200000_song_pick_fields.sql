-- The Pick on songs — mirror of observation Pick fields.
-- Lets visitors put a song's hook line / curated lyric lines onto merch, and
-- configurator-driven product submissions can attribute back to the source song.

ALTER TABLE songs
  ADD COLUMN IF NOT EXISTS hook_line     text,
  ADD COLUMN IF NOT EXISTS merch_lines   text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS merch_enabled boolean DEFAULT false;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS source_song_id uuid REFERENCES songs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_source_song ON products(source_song_id);
