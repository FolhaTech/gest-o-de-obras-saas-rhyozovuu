DO $$
BEGIN
  -- Ensure RLS is enabled
  ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.works ENABLE ROW LEVEL SECURITY;

  -- RLS for materials
  DROP POLICY IF EXISTS "allow_all_authenticated" ON public.materials;
  CREATE POLICY "allow_all_authenticated" ON public.materials
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

  -- RLS for works
  DROP POLICY IF EXISTS "allow_all_authenticated" ON public.works;
  CREATE POLICY "allow_all_authenticated" ON public.works
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
END $$;
