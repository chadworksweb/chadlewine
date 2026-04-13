-- CL Stream: personal song feed, displayed on chadlewine.com
-- Calls Rising Compass API for badge data (same as songs/albums)

CREATE TABLE cl_stream_songs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT,
  album_art_url TEXT,
  note TEXT,
  source_url TEXT,
  source_platform TEXT,
  rc_color TEXT,
  rc_charge INTEGER,
  rc_contaminated BOOLEAN DEFAULT FALSE,
  rc_charge_summary TEXT,
  status TEXT NOT NULL DEFAULT 'published',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX cl_stream_songs_status_created ON cl_stream_songs (status, created_at DESC);

ALTER TABLE cl_stream_songs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read published cl_stream_songs" ON cl_stream_songs FOR SELECT USING (status = 'published');
CREATE POLICY "Admin full access cl_stream_songs" ON cl_stream_songs FOR ALL USING (auth.role() = 'authenticated');
