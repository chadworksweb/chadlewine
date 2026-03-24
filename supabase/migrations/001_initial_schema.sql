-- chadlewine.com — Initial Schema
-- Next.js 16 + Supabase

-- ============================================================
-- CONTENT TABLES
-- ============================================================

CREATE TABLE observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  body text NOT NULL,
  date_captured date NOT NULL,
  art_image_path text,
  art_alt text,
  hook_line text,
  tension_line text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'volume-collected')),
  seo_title text,
  seo_description text,
  merch_lines text[] DEFAULT '{}',
  merch_enabled boolean DEFAULT false,
  audio_file_path text,
  volume_ref text,
  volume_sequence integer,
  source text,
  published_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE foundations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  body text NOT NULL,
  display_order integer NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE tldrs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  body text NOT NULL,
  plain_text text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE thoughts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- JUNCTION TABLES
-- ============================================================

CREATE TABLE observation_domains (
  observation_id uuid REFERENCES observations(id) ON DELETE CASCADE,
  domain_slug text NOT NULL,
  PRIMARY KEY (observation_id, domain_slug)
);

CREATE TABLE tldr_domains (
  tldr_id uuid REFERENCES tldrs(id) ON DELETE CASCADE,
  domain_slug text NOT NULL,
  PRIMARY KEY (tldr_id, domain_slug)
);

CREATE TABLE observation_thoughts (
  observation_id uuid REFERENCES observations(id) ON DELETE CASCADE,
  thought_id uuid REFERENCES thoughts(id) ON DELETE CASCADE,
  PRIMARY KEY (observation_id, thought_id)
);

CREATE TABLE tldr_thoughts (
  tldr_id uuid REFERENCES tldrs(id) ON DELETE CASCADE,
  thought_id uuid REFERENCES thoughts(id) ON DELETE CASCADE,
  PRIMARY KEY (tldr_id, thought_id)
);

-- ============================================================
-- THREAD PULL
-- ============================================================

CREATE TABLE thread_pulls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL CHECK (source_type IN ('observation', 'tldr', 'foundation')),
  source_id uuid NOT NULL,
  target_type text NOT NULL CHECK (target_type IN ('observation', 'tldr', 'foundation')),
  target_id uuid NOT NULL,
  direction text NOT NULL CHECK (direction IN ('continues', 'originates', 'applies', 'challenges', 'expands', 'responds', 'parallels', 'seeds', 'distills')),
  description text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (source_type, source_id, target_type, target_id, direction)
);

-- ============================================================
-- MERCH & PRODUCTS
-- ============================================================

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier text NOT NULL CHECK (tier IN ('art', 'line', 'fusion', 'pick', 'diddy')),
  title text NOT NULL,
  description text,
  source_observation_id uuid REFERENCES observations(id) ON DELETE SET NULL,
  source_tldr_id uuid REFERENCES tldrs(id) ON DELETE SET NULL,
  printify_product_id text,
  price_cents integer,
  is_catalog_item boolean DEFAULT false,
  submitted_by_email text,
  rev_share_pct numeric(5,2),
  status text DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending_review')),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE product_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_email text NOT NULL,
  product_config jsonb NOT NULL,
  printify_order_id text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'passed')),
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- SUBSCRIBERS & PATRONS
-- ============================================================

CREATE TABLE subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  source_page text,
  source_observation_id uuid REFERENCES observations(id) ON DELETE SET NULL,
  status text DEFAULT 'active' CHECK (status IN ('active', 'unsubscribed')),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE patrons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  stripe_payment_intent_id text,
  amount_cents integer NOT NULL,
  is_recurring boolean DEFAULT false,
  stripe_subscription_id text,
  source_observation_id uuid REFERENCES observations(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- ANALYTICS
-- ============================================================

CREATE TABLE analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  page_path text,
  observation_id uuid,
  tldr_id uuid,
  metadata jsonb,
  session_id text,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- VOICE MACHINE
-- ============================================================

CREATE TABLE voice_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audio_storage_path text NOT NULL,
  duration_seconds integer,
  status text DEFAULT 'new' CHECK (status IN ('new', 'listened', 'archived')),
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_observations_status ON observations(status);
CREATE INDEX idx_observations_slug ON observations(slug);
CREATE INDEX idx_observations_date ON observations(date_captured DESC);
CREATE INDEX idx_tldrs_status ON tldrs(status);
CREATE INDEX idx_tldrs_published ON tldrs(published_at DESC);
CREATE INDEX idx_observation_domains_slug ON observation_domains(domain_slug);
CREATE INDEX idx_tldr_domains_slug ON tldr_domains(domain_slug);
CREATE INDEX idx_analytics_events_type ON analytics_events(event_type);
CREATE INDEX idx_analytics_events_created ON analytics_events(created_at DESC);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER observations_updated_at BEFORE UPDATE ON observations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER foundations_updated_at BEFORE UPDATE ON foundations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tldrs_updated_at BEFORE UPDATE ON tldrs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE foundations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tldrs ENABLE ROW LEVEL SECURITY;
ALTER TABLE thoughts ENABLE ROW LEVEL SECURITY;
ALTER TABLE observation_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE tldr_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE observation_thoughts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tldr_thoughts ENABLE ROW LEVEL SECURITY;
ALTER TABLE thread_pulls ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE patrons ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_messages ENABLE ROW LEVEL SECURITY;

-- Public read policies (anon)
CREATE POLICY "Public can read published observations" ON observations FOR SELECT USING (status = 'published');
CREATE POLICY "Public can read foundations" ON foundations FOR SELECT USING (true);
CREATE POLICY "Public can read published tldrs" ON tldrs FOR SELECT USING (status = 'published');
CREATE POLICY "Public can read thoughts" ON thoughts FOR SELECT USING (true);
CREATE POLICY "Public can read observation_domains" ON observation_domains FOR SELECT USING (true);
CREATE POLICY "Public can read tldr_domains" ON tldr_domains FOR SELECT USING (true);
CREATE POLICY "Public can read observation_thoughts" ON observation_thoughts FOR SELECT USING (true);
CREATE POLICY "Public can read tldr_thoughts" ON tldr_thoughts FOR SELECT USING (true);
CREATE POLICY "Public can read thread_pulls" ON thread_pulls FOR SELECT USING (true);
CREATE POLICY "Public can read active products" ON products FOR SELECT USING (status = 'active');

-- Public write policies (anon)
CREATE POLICY "Anyone can submit analytics" ON analytics_events FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can record voice message" ON voice_messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can subscribe" ON subscribers FOR INSERT WITH CHECK (true);

-- Admin policies (authenticated)
CREATE POLICY "Admin full access observations" ON observations FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin full access foundations" ON foundations FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin full access tldrs" ON tldrs FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin full access thoughts" ON thoughts FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin full access observation_domains" ON observation_domains FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin full access tldr_domains" ON tldr_domains FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin full access observation_thoughts" ON observation_thoughts FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin full access tldr_thoughts" ON tldr_thoughts FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin full access thread_pulls" ON thread_pulls FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin full access products" ON products FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin full access product_submissions" ON product_submissions FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin full access subscribers" ON subscribers FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin full access patrons" ON patrons FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin read analytics" ON analytics_events FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admin full access voice_messages" ON voice_messages FOR ALL USING (auth.role() = 'authenticated');
