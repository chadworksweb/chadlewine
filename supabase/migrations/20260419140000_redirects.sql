-- Redirects table — preserves SEO/link equity when slugs change
CREATE TABLE IF NOT EXISTS redirects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_path text NOT NULL UNIQUE,
  to_path text NOT NULL,
  status_code smallint NOT NULL DEFAULT 301 CHECK (status_code IN (301, 302, 307, 308)),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('auto', 'manual')),
  content_type text,
  content_id uuid,
  hits integer NOT NULL DEFAULT 0,
  last_hit_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT redirects_no_self_loop CHECK (from_path <> to_path)
);

CREATE INDEX IF NOT EXISTS idx_redirects_from_path_active ON redirects(from_path) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_redirects_content ON redirects(content_type, content_id);

ALTER TABLE redirects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read active redirects" ON redirects FOR SELECT USING (active = true);
CREATE POLICY "Admin full access to redirects" ON redirects FOR ALL USING (auth.role() = 'authenticated');

-- Atomic hit increment (SECURITY DEFINER so anon can invoke without write grant)
CREATE OR REPLACE FUNCTION increment_redirect_hit(p_from text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE redirects
  SET hits = hits + 1, last_hit_at = now()
  WHERE from_path = p_from AND active = true;
$$;

GRANT EXECUTE ON FUNCTION increment_redirect_hit(text) TO anon, authenticated;
