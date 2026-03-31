-- Phase 9B.1: Curation tables
-- Run in Supabase SQL Editor

-- curated_entries
CREATE TABLE IF NOT EXISTS curated_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('album', 'single', 'playlist')),
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  artist_name text NOT NULL,
  description text,
  body text,
  cover_image_path text,
  outbound_url text,
  outbound_links jsonb DEFAULT '[]'::jsonb,
  rising_compass_score numeric(5,2),
  rising_compass_classification text,
  genre text,
  mood_tags text[] DEFAULT '{}',
  seo_title text,
  seo_description text,
  focus_keyphrase text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  display_order integer DEFAULT 0,
  published_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- curated_playlist_tracks (junction for playlist contents)
CREATE TABLE IF NOT EXISTS curated_playlist_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id uuid NOT NULL REFERENCES curated_entries(id) ON DELETE CASCADE,
  track_title text NOT NULL,
  artist_name text NOT NULL,
  outbound_url text,
  rising_compass_score numeric(5,2),
  display_order integer DEFAULT 0
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_curated_entries_status ON curated_entries(status);
CREATE INDEX IF NOT EXISTS idx_curated_entries_slug ON curated_entries(slug);
CREATE INDEX IF NOT EXISTS idx_curated_entries_type ON curated_entries(type);
CREATE INDEX IF NOT EXISTS idx_curated_playlist_tracks_playlist ON curated_playlist_tracks(playlist_id);

-- RLS
ALTER TABLE curated_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE curated_playlist_tracks ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "curated_entries_public_select" ON curated_entries
  FOR SELECT USING (true);

CREATE POLICY "curated_playlist_tracks_public_select" ON curated_playlist_tracks
  FOR SELECT USING (true);

-- Authenticated write
CREATE POLICY "curated_entries_auth_insert" ON curated_entries
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "curated_entries_auth_update" ON curated_entries
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "curated_entries_auth_delete" ON curated_entries
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "curated_playlist_tracks_auth_insert" ON curated_playlist_tracks
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "curated_playlist_tracks_auth_update" ON curated_playlist_tracks
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "curated_playlist_tracks_auth_delete" ON curated_playlist_tracks
  FOR DELETE TO authenticated USING (true);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Only create trigger if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_curated_entries_updated_at') THEN
    CREATE TRIGGER set_curated_entries_updated_at
      BEFORE UPDATE ON curated_entries
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
