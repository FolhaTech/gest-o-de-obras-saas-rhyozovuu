-- Materiais Alocados com valores (importação de planilhas de compras).
-- 1) work_extra_materials ganha código, nome, unidade e origem próprios: o item não precisa existir
--    no catálogo (materials), então listas grandes de compra não poluem o estoque.
-- 2) Os valores (R$) ficam numa tabela à parte, fechada ao Prestador (mesma regra do financeiro).
-- Idempotente.

ALTER TABLE public.work_extra_materials
  ADD COLUMN IF NOT EXISTS code TEXT,      -- código do fornecedor/ERP
  ADD COLUMN IF NOT EXISTS name TEXT,      -- descrição quando o item não vem do catálogo
  ADD COLUMN IF NOT EXISTS unit TEXT,      -- UN, KG, M3, SC...
  ADD COLUMN IF NOT EXISTS source TEXT;    -- origem do lançamento (ex.: planilha-arimura)

CREATE INDEX IF NOT EXISTS idx_work_extra_materials_source ON public.work_extra_materials(work_id, source);

CREATE TABLE IF NOT EXISTS public.work_extra_material_values (
  extra_material_id UUID PRIMARY KEY REFERENCES public.work_extra_materials(id) ON DELETE CASCADE,
  unit_price NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  total_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

ALTER TABLE public.work_extra_material_values ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated full access" ON public.work_extra_material_values;
DROP POLICY IF EXISTS "work_extra_material_values_staff_all" ON public.work_extra_material_values;
CREATE POLICY "work_extra_material_values_staff_all" ON public.work_extra_material_values
  FOR ALL TO obras_authenticated
  USING (NOT public.is_prestador()) WITH CHECK (NOT public.is_prestador());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_extra_material_values TO obras_authenticated;
