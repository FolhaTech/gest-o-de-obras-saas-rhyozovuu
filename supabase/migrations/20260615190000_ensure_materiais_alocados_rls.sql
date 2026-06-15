-- Ensure RLS on work_extra_materials
ALTER TABLE public.work_extra_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select" ON public.work_extra_materials;
CREATE POLICY "authenticated_select" ON public.work_extra_materials FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert" ON public.work_extra_materials;
CREATE POLICY "authenticated_insert" ON public.work_extra_materials FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update" ON public.work_extra_materials;
CREATE POLICY "authenticated_update" ON public.work_extra_materials FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete" ON public.work_extra_materials;
CREATE POLICY "authenticated_delete" ON public.work_extra_materials FOR DELETE TO authenticated USING (true);

-- Ensure RLS on compositions_history
ALTER TABLE public.compositions_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_authenticated" ON public.compositions_history;
CREATE POLICY "allow_all_authenticated" ON public.compositions_history FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Ensure RLS on work_services
ALTER TABLE public.work_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_authenticated" ON public.work_services;
CREATE POLICY "allow_all_authenticated" ON public.work_services FOR ALL TO authenticated USING (true) WITH CHECK (true);
