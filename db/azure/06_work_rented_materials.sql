-- Materiais/equipamentos LOCADOS por obra (andaime, betoneira, caçamba...), com custo da locação.
-- Idempotente.
CREATE TABLE IF NOT EXISTS public.work_rented_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  supplier TEXT,
  quantity NUMERIC NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit TEXT NOT NULL DEFAULT 'un',
  -- valor unitário da locação, cobrado por dia, semana, mês ou uma única vez ("unico")
  rental_cost NUMERIC NOT NULL DEFAULT 0 CHECK (rental_cost >= 0),
  cost_period TEXT NOT NULL DEFAULT 'dia' CHECK (cost_period IN ('dia', 'semana', 'mes', 'unico')),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_return_date DATE,
  returned_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT rented_expected_after_start CHECK (expected_return_date IS NULL OR expected_return_date >= start_date),
  CONSTRAINT rented_returned_after_start CHECK (returned_date IS NULL OR returned_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_work_rented_materials_work_id ON public.work_rented_materials(work_id);
CREATE INDEX IF NOT EXISTS idx_work_rented_materials_returned ON public.work_rented_materials(returned_date);

ALTER TABLE public.work_rented_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated full access" ON public.work_rented_materials;
CREATE POLICY "Allow authenticated full access" ON public.work_rented_materials
  FOR ALL TO obras_authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_rented_materials TO obras_authenticated;
