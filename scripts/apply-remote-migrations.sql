-- Combined migrations 009-019 for Supabase SQL Editor
-- Tables that already exist are wrapped in IF NOT EXISTS
-- Run this in the Supabase Dashboard SQL Editor

-- ═══ 009: Junction tables (categories/thoughtlines/tags tables already exist) ═══

CREATE TABLE IF NOT EXISTS observation_categories (
  observation_id uuid REFERENCES observations(id) ON DELETE CASCADE,
  category_id uuid REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (observation_id, category_id)
);
CREATE TABLE IF NOT EXISTS observation_thoughtlines (
  observation_id uuid REFERENCES observations(id) ON DELETE CASCADE,
  thoughtline_id uuid REFERENCES thoughtlines(id) ON DELETE CASCADE,
  PRIMARY KEY (observation_id, thoughtline_id)
);
CREATE TABLE IF NOT EXISTS observation_tags (
  observation_id uuid REFERENCES observations(id) ON DELETE CASCADE,
  tag_id uuid REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (observation_id, tag_id)
);
CREATE TABLE IF NOT EXISTS meditation_categories (
  meditation_id uuid REFERENCES meditations(id) ON DELETE CASCADE,
  category_id uuid REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (meditation_id, category_id)
);
CREATE TABLE IF NOT EXISTS meditation_thoughtlines (
  meditation_id uuid REFERENCES meditations(id) ON DELETE CASCADE,
  thoughtline_id uuid REFERENCES thoughtlines(id) ON DELETE CASCADE,
  PRIMARY KEY (meditation_id, thoughtline_id)
);
CREATE TABLE IF NOT EXISTS meditation_tags (
  meditation_id uuid REFERENCES meditations(id) ON DELETE CASCADE,
  tag_id uuid REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (meditation_id, tag_id)
);

ALTER TABLE observation_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE observation_thoughtlines ENABLE ROW LEVEL SECURITY;
ALTER TABLE observation_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE meditation_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE meditation_thoughtlines ENABLE ROW LEVEL SECURITY;
ALTER TABLE meditation_tags ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Public read observation_categories" ON observation_categories FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Public read observation_thoughtlines" ON observation_thoughtlines FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Public read observation_tags" ON observation_tags FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Public read meditation_categories" ON meditation_categories FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Public read meditation_thoughtlines" ON meditation_thoughtlines FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Public read meditation_tags" ON meditation_tags FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admin observation_categories" ON observation_categories FOR ALL USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admin observation_thoughtlines" ON observation_thoughtlines FOR ALL USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admin observation_tags" ON observation_tags FOR ALL USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admin meditation_categories" ON meditation_categories FOR ALL USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admin meditation_thoughtlines" ON meditation_thoughtlines FOR ALL USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admin meditation_tags" ON meditation_tags FOR ALL USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═══ 010: Drop observation source column ═══
ALTER TABLE observations DROP COLUMN IF EXISTS source;

-- ═══ 011: SEO/GEO fields ═══
ALTER TABLE observations ADD COLUMN IF NOT EXISTS focus_keyphrase text;
ALTER TABLE observations ADD COLUMN IF NOT EXISTS secondary_keyphrases jsonb DEFAULT '[]'::jsonb;
ALTER TABLE observations ADD COLUMN IF NOT EXISTS search_intent text DEFAULT 'informational';
ALTER TABLE observations ADD COLUMN IF NOT EXISTS citation_summary text;
ALTER TABLE observations ADD COLUMN IF NOT EXISTS first_sentence_extractable boolean DEFAULT false;
ALTER TABLE observations ADD COLUMN IF NOT EXISTS paa_pairs jsonb DEFAULT '[]'::jsonb;
ALTER TABLE observations ADD COLUMN IF NOT EXISTS entity_tags jsonb DEFAULT '[]'::jsonb;
ALTER TABLE observations ADD COLUMN IF NOT EXISTS article_type text DEFAULT 'article';
ALTER TABLE observations ADD COLUMN IF NOT EXISTS word_count integer;
ALTER TABLE observations ADD COLUMN IF NOT EXISTS reading_time_minutes numeric(4,1);
ALTER TABLE observations ADD COLUMN IF NOT EXISTS geo_readiness_score integer DEFAULT 0;

-- ═══ 012: Voice profile ═══
ALTER TABLE observations ADD COLUMN IF NOT EXISTS voice_profile jsonb;

-- ═══ 013: Rename TLDRs to Meditations (already done if meditations exists) ═══
-- Skipped — meditations table already exists

-- ═══ 014: Meditation title ═══
ALTER TABLE meditations ADD COLUMN IF NOT EXISTS title text;

-- ═══ 015: Door pages ═══
CREATE TABLE IF NOT EXISTS door_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  body text,
  meta_title text,
  meta_description text,
  target_queries jsonb DEFAULT '[]'::jsonb,
  funnel_targets jsonb DEFAULT '[]'::jsonb,
  og_image_path text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE door_pages ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Public can read published door_pages" ON door_pages FOR SELECT USING (status = 'published');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admin full access door_pages" ON door_pages FOR ALL USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═══ 016: Thoughts table ═══
CREATE TABLE IF NOT EXISTS thoughts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS observation_thoughts (
  observation_id uuid REFERENCES observations(id) ON DELETE CASCADE,
  thought_id uuid REFERENCES thoughts(id) ON DELETE CASCADE,
  PRIMARY KEY (observation_id, thought_id)
);
CREATE TABLE IF NOT EXISTS meditation_thoughts (
  meditation_id uuid REFERENCES meditations(id) ON DELETE CASCADE,
  thought_id uuid REFERENCES thoughts(id) ON DELETE CASCADE,
  PRIMARY KEY (meditation_id, thought_id)
);
ALTER TABLE thoughts ENABLE ROW LEVEL SECURITY;
ALTER TABLE observation_thoughts ENABLE ROW LEVEL SECURITY;
ALTER TABLE meditation_thoughts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Public read published thoughts" ON thoughts FOR SELECT USING (status = 'published');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admin full access thoughts" ON thoughts FOR ALL USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Public read observation_thoughts" ON observation_thoughts FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admin observation_thoughts" ON observation_thoughts FOR ALL USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Public read meditation_thoughts" ON meditation_thoughts FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admin meditation_thoughts" ON meditation_thoughts FOR ALL USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═══ 017: Music, Lyrics & Video ═══
CREATE TABLE IF NOT EXISTS albums (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  release_date date,
  cover_art_path text,
  cover_art_alt text,
  description text,
  display_order integer DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid REFERENCES albums(id) ON DELETE CASCADE,
  title text NOT NULL,
  slug text NOT NULL,
  track_number integer NOT NULL DEFAULT 1,
  duration_seconds integer,
  streaming_path text,
  lyrics text,
  price_cents integer,
  is_single boolean DEFAULT false,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (album_id, slug)
);
CREATE TABLE IF NOT EXISTS video_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  category_id uuid REFERENCES video_categories(id) ON DELETE SET NULL,
  stream_id text,
  embed_url text,
  thumbnail_path text,
  description text,
  duration_seconds integer,
  is_featured boolean DEFAULT false,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_email text NOT NULL,
  item_type text NOT NULL CHECK (item_type IN ('track', 'album')),
  item_id uuid NOT NULL,
  stripe_payment_intent_id text,
  amount_cents integer NOT NULL,
  download_url text,
  download_expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_albums_slug ON albums(slug);
CREATE INDEX IF NOT EXISTS idx_albums_status ON albums(status);
CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album_id);
CREATE INDEX IF NOT EXISTS idx_tracks_status ON tracks(status);
CREATE INDEX IF NOT EXISTS idx_videos_category ON videos(category_id);
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);
CREATE INDEX IF NOT EXISTS idx_videos_featured ON videos(is_featured) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_purchases_email ON purchases(buyer_email);
CREATE INDEX IF NOT EXISTS idx_purchases_item ON purchases(item_type, item_id);

-- updated_at triggers (create function if not exists)
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS albums_updated_at ON albums;
CREATE TRIGGER albums_updated_at BEFORE UPDATE ON albums FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS tracks_updated_at ON tracks;
CREATE TRIGGER tracks_updated_at BEFORE UPDATE ON tracks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS videos_updated_at ON videos;
CREATE TRIGGER videos_updated_at BEFORE UPDATE ON videos FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE POLICY "Public can read published albums" ON albums FOR SELECT USING (status = 'published'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Public can read published tracks" ON tracks FOR SELECT USING (status = 'published'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Public can read video_categories" ON video_categories FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Public can read published videos" ON videos FOR SELECT USING (status = 'published'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admin full access albums" ON albums FOR ALL USING (auth.role() = 'authenticated'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admin full access tracks" ON tracks FOR ALL USING (auth.role() = 'authenticated'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admin full access video_categories" ON video_categories FOR ALL USING (auth.role() = 'authenticated'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admin full access videos" ON videos FOR ALL USING (auth.role() = 'authenticated'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admin full access purchases" ON purchases FOR ALL USING (auth.role() = 'authenticated'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═══ 018: Art Portfolio ═══
CREATE TABLE IF NOT EXISTS art_pieces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  medium text,
  image_path text NOT NULL,
  image_alt text,
  description text,
  display_order integer DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_art_pieces_status ON art_pieces(status);
CREATE INDEX IF NOT EXISTS idx_art_pieces_order ON art_pieces(display_order);
DROP TRIGGER IF EXISTS art_pieces_updated_at ON art_pieces;
CREATE TRIGGER art_pieces_updated_at BEFORE UPDATE ON art_pieces FOR EACH ROW EXECUTE FUNCTION update_updated_at();
ALTER TABLE art_pieces ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Public can read published art_pieces" ON art_pieces FOR SELECT USING (status = 'published'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admin full access art_pieces" ON art_pieces FOR ALL USING (auth.role() = 'authenticated'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═══ 019: Track download path ═══
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS download_path text;
