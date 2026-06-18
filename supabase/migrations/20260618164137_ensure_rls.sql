DO $$
BEGIN
  -- compositions
  DROP POLICY IF EXISTS "allow_all_authenticated" ON public.compositions;
  CREATE POLICY "allow_all_authenticated" ON public.compositions
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

  -- work_services
  DROP POLICY IF EXISTS "allow_all_authenticated" ON public.work_services;
  CREATE POLICY "allow_all_authenticated" ON public.work_services
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

  -- work_extra_materials
  DROP POLICY IF EXISTS "authenticated_select" ON public.work_extra_materials;
  CREATE POLICY "authenticated_select" ON public.work_extra_materials
    FOR SELECT TO authenticated USING (true);

  DROP POLICY IF EXISTS "authenticated_insert" ON public.work_extra_materials;
  CREATE POLICY "authenticated_insert" ON public.work_extra_materials
    FOR INSERT TO authenticated WITH CHECK (true);

  DROP POLICY IF EXISTS "authenticated_update" ON public.work_extra_materials;
  CREATE POLICY "authenticated_update" ON public.work_extra_materials
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS "authenticated_delete" ON public.work_extra_materials;
  CREATE POLICY "authenticated_delete" ON public.work_extra_materials
    FOR DELETE TO authenticated USING (true);
END $$;
