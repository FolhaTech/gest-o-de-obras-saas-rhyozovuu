CREATE TABLE IF NOT EXISTS public.work_extra_materials (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    work_id uuid REFERENCES public.works(id) ON DELETE CASCADE,
    material_id uuid REFERENCES public.materials(id) ON DELETE CASCADE,
    quantity numeric NOT NULL,
    notes text,
    created_at timestamptz DEFAULT now()
);

ALTER TABLE public.work_extra_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_authenticated" ON public.work_extra_materials;
CREATE POLICY "allow_all_authenticated" ON public.work_extra_materials
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
