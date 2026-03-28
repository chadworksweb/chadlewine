-- Phase 7A: Door Pages
-- Discovery landing pages shaped around query clusters

CREATE TABLE door_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  body text,
  meta_title text,
  meta_description text,
  target_queries jsonb DEFAULT '[]',
  funnel_targets jsonb DEFAULT '[]',
  og_image_path text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_door_pages_slug ON door_pages(slug);
CREATE INDEX idx_door_pages_status ON door_pages(status);

CREATE TRIGGER door_pages_updated_at BEFORE UPDATE ON door_pages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE door_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read published door_pages" ON door_pages FOR SELECT USING (status = 'published');
CREATE POLICY "Admin full access door_pages" ON door_pages FOR ALL USING (auth.role() = 'authenticated');
