CREATE TABLE IF NOT EXISTS public.domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  label text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read domains" ON public.domains
  FOR SELECT USING (true);

CREATE POLICY "Admin manage domains" ON public.domains
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed existing domains
INSERT INTO public.domains (slug, label) VALUES
  ('narrative', 'Narrative'),
  ('music', 'Music'),
  ('the-internet', 'The Internet'),
  ('ai', 'AI'),
  ('singing-and-vocalization', 'Singing & Vocalization'),
  ('society', 'Society'),
  ('marketing', 'Marketing'),
  ('energy-and-spirituality', 'Energy & Spirituality'),
  ('relationships', 'Relationships'),
  ('sex-and-sexuality', 'Sex & Sexuality'),
  ('faith', 'Faith'),
  ('crime-and-punishment', 'Crime & Punishment'),
  ('food', 'Food'),
  ('health', 'Health'),
  ('war', 'War'),
  ('identity', 'Identity'),
  ('entertainment', 'Entertainment'),
  ('industry', 'Industry'),
  ('consciousness', 'Consciousness'),
  ('education', 'Education'),
  ('work-and-labor', 'Work & Labor'),
  ('money', 'Money'),
  ('death', 'Death'),
  ('nature', 'Nature'),
  ('sleep-and-dreams', 'Sleep & Dreams'),
  ('social-media', 'Social Media'),
  ('general', 'General'),
  ('personal', 'Personal')
ON CONFLICT (slug) DO NOTHING;
