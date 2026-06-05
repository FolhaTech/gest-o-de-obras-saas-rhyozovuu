CREATE TABLE IF NOT EXISTS public.revenues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID REFERENCES public.works(id) ON DELETE CASCADE,
  source TEXT,
  value NUMERIC NOT NULL,
  date DATE NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'received',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.revenues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_authenticated" ON public.revenues;
CREATE POLICY "allow_all_authenticated" ON public.revenues
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
