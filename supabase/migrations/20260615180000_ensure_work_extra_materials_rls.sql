-- Enable RLS safely
ALTER TABLE public.work_extra_materials ENABLE ROW LEVEL SECURITY;

-- Drop any previous conflicting policies
DROP POLICY IF EXISTS "allow_all_authenticated" ON public.work_extra_materials;
DROP POLICY IF EXISTS "authenticated_select" ON public.work_extra_materials;
DROP POLICY IF EXISTS "authenticated_insert" ON public.work_extra_materials;
DROP POLICY IF EXISTS "authenticated_update" ON public.work_extra_materials;
DROP POLICY IF EXISTS "authenticated_delete" ON public.work_extra_materials;

-- Create individual CRUD policies for authenticated users
CREATE POLICY "authenticated_select" ON public.work_extra_materials
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_insert" ON public.work_extra_materials
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated_update" ON public.work_extra_materials
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_delete" ON public.work_extra_materials
  FOR DELETE TO authenticated USING (true);
