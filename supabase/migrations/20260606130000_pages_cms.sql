-- Pages CMS: full DB-driven standalone pages, composed from typed sections.
--
-- A "page" is a standalone route (slug = full path, e.g. music/songs-over-5-minutes)
-- with native SEO (seo_title / seo_description / og_image_path, same pattern as
-- every other entity -- reuses SeoFieldsPanel and the exact-title { absolute }
-- rule). Pages form a hierarchy via parent_id (self-ref).
--
-- A page is rendered from its ordered page_sections. Each section has a TYPE
-- (hero / prose / track-grid / research / prompt / faq ...) that the renderer
-- maps to an existing React component. Section content lives in heading / body
-- (text) plus a free-form `data` jsonb bag for type-specific config.
--
-- Prompts are first-class: a section of type 'prompt' carries status open|filled,
-- so the admin can surface pages with outstanding (open) prompts. page_prompts is
-- a reporting VIEW over those sections.
--
-- This supersedes the page_meta / MANAGED_PAGES SEO-override path for any page
-- that moves into the CMS; those pages take SEO from pages.seo_* instead.
-- door_pages (legacy meta_* DB pages) is left untouched.

-- ===== pages =====
CREATE TABLE pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  parent_id uuid REFERENCES pages(id) ON DELETE SET NULL,
  title text NOT NULL,
  template text NOT NULL DEFAULT 'standard',
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published')),
  seo_title text,
  seo_description text,
  og_image_path text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pages_status ON pages(status);
CREATE INDEX idx_pages_parent ON pages(parent_id);
CREATE INDEX idx_pages_sort   ON pages(sort_order);

ALTER TABLE pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read published pages"
  ON pages FOR SELECT
  USING (status = 'published');

CREATE POLICY "Admin full access pages"
  ON pages FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

GRANT SELECT ON pages TO anon;
GRANT ALL    ON pages TO authenticated, service_role;

CREATE TRIGGER pages_updated_at BEFORE UPDATE ON pages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ===== page_sections =====
-- status is NULL for non-prompt sections; for type='prompt' it is open|filled.
CREATE TABLE page_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  type text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  heading text,
  body text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text
    CHECK (status IS NULL OR status IN ('open', 'filled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_page_sections_page ON page_sections(page_id, position);
CREATE INDEX idx_page_sections_type ON page_sections(type);
CREATE INDEX idx_page_sections_open_prompts
  ON page_sections(page_id)
  WHERE type = 'prompt' AND status = 'open';

ALTER TABLE page_sections ENABLE ROW LEVEL SECURITY;

-- Public reads sections only for published parent pages. The renderer decides
-- what to display (e.g. it skips open prompts); RLS just gates row access.
CREATE POLICY "Public can read sections of published pages"
  ON page_sections FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM pages p
    WHERE p.id = page_sections.page_id AND p.status = 'published'
  ));

CREATE POLICY "Admin full access page_sections"
  ON page_sections FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

GRANT SELECT ON page_sections TO anon;
GRANT ALL    ON page_sections TO authenticated, service_role;

CREATE TRIGGER page_sections_updated_at BEFORE UPDATE ON page_sections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ===== page_prompts (reporting view over prompt-type sections) =====
-- security_invoker so the view honors the underlying RLS of the caller.
CREATE VIEW page_prompts
  WITH (security_invoker = true)
AS
  SELECT
    s.id            AS section_id,
    s.page_id,
    p.slug          AS page_slug,
    p.title         AS page_title,
    s.position,
    s.heading,
    s.body,
    s.status,
    s.created_at,
    s.updated_at
  FROM page_sections s
  JOIN pages p ON p.id = s.page_id
  WHERE s.type = 'prompt';

GRANT SELECT ON page_prompts TO authenticated, service_role;
