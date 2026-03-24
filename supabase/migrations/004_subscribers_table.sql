CREATE TABLE IF NOT EXISTS public.subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  source_page text,
  source_observation_id uuid REFERENCES public.observations(id),
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public subscribe" ON public.subscribers
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Admin full access subscribers" ON public.subscribers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
