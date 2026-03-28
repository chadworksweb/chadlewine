-- Phase 13: Music, Lyrics & Video
-- Albums, tracks, videos, purchases — all migrated from Chad Rising

CREATE TABLE albums (
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

CREATE TABLE tracks (
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

CREATE TABLE video_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE videos (
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

CREATE TABLE purchases (
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

-- Indexes
CREATE INDEX idx_albums_slug ON albums(slug);
CREATE INDEX idx_albums_status ON albums(status);
CREATE INDEX idx_tracks_album ON tracks(album_id);
CREATE INDEX idx_tracks_status ON tracks(status);
CREATE INDEX idx_videos_category ON videos(category_id);
CREATE INDEX idx_videos_status ON videos(status);
CREATE INDEX idx_videos_featured ON videos(is_featured) WHERE is_featured = true;
CREATE INDEX idx_purchases_email ON purchases(buyer_email);
CREATE INDEX idx_purchases_item ON purchases(item_type, item_id);

-- Updated_at triggers
CREATE TRIGGER albums_updated_at BEFORE UPDATE ON albums
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tracks_updated_at BEFORE UPDATE ON tracks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER videos_updated_at BEFORE UPDATE ON videos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read published albums" ON albums FOR SELECT USING (status = 'published');
CREATE POLICY "Public can read published tracks" ON tracks FOR SELECT USING (status = 'published');
CREATE POLICY "Public can read video_categories" ON video_categories FOR SELECT USING (true);
CREATE POLICY "Public can read published videos" ON videos FOR SELECT USING (status = 'published');

CREATE POLICY "Admin full access albums" ON albums FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin full access tracks" ON tracks FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin full access video_categories" ON video_categories FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin full access videos" ON videos FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin full access purchases" ON purchases FOR ALL USING (auth.role() = 'authenticated');
