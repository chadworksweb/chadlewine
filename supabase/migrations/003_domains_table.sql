CREATE TABLE IF NOT EXISTS public.domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  label text NOT NULL,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read domains" ON public.domains
  FOR SELECT USING (true);

CREATE POLICY "Admin manage domains" ON public.domains
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed existing domains
INSERT INTO public.domains (slug, label, sort_order) VALUES
  ('on-me', 'On Me', 1),
  ('music', 'Music', 2),
  ('the-internet', 'The Internet', 3),
  ('ai', 'AI', 4),
  ('singing-and-vocalization', 'Singing & Vocalization', 5),
  ('society', 'Society', 6),
  ('marketing', 'Marketing', 7),
  ('energy-and-spirituality', 'Energy & Spirituality', 8),
  ('relationships', 'Relationships', 9),
  ('sex-and-sexuality', 'Sex & Sexuality', 10),
  ('faith', 'Faith', 11),
  ('crime-and-punishment', 'Crime & Punishment', 12),
  ('food', 'Food', 13),
  ('health', 'Health', 14),
  ('war', 'War', 15),
  ('identity', 'Identity', 16),
  ('entertainment', 'Entertainment', 17),
  ('industry', 'Industry', 18),
  ('consciousness', 'Consciousness', 19),
  ('education', 'Education', 20),
  ('work-and-labor', 'Work & Labor', 21),
  ('money', 'Money', 22),
  ('death', 'Death', 23),
  ('nature', 'Nature', 24),
  ('sleep-and-dreams', 'Sleep & Dreams', 25),
  ('social-media', 'Social Media', 26),
  ('general', 'General', 27),
  ('personal', 'Personal', 28)
ON CONFLICT (slug) DO NOTHING;
