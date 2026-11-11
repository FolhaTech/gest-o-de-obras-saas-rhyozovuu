-- Equipamentos (em Materiais): data da compra, manutenções realizadas e alertas.
--  * equipment: o equipamento (compra, obra/local atual, intervalo de manutenção, manutenções anteriores ao cadastro)
--  * equipment_maintenances: cada manutenção registrada
-- Os alertas (manutenção a cada 6 meses; a partir de 5 manutenções, movimentar ou comprar outro) são calculados na tela
-- (src/lib/equipment.ts) a partir destes dados.
-- Leitura: qualquer usuário logado. Escrita: administrador e gestor. Valores (compra e custo da manutenção)
-- são escondidos de quem não é administrador pela API (server/mask.ts).
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT,                                   -- patrimônio / número de série
  category TEXT,
  purchase_date DATE,
  purchase_value NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (purchase_value >= 0),
  work_id UUID REFERENCES public.works(id) ON DELETE SET NULL,   -- obra/local atual (nulo = depósito)
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'retired')),
  maintenance_interval_months INTEGER NOT NULL DEFAULT 6 CHECK (maintenance_interval_months > 0),
  initial_maintenance_count INTEGER NOT NULL DEFAULT 0 CHECK (initial_maintenance_count >= 0),  -- feitas antes do cadastro
  last_maintenance_date DATE,                  -- data da última feita antes do cadastro
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);
CREATE INDEX IF NOT EXISTS idx_equipment_work_id ON public.equipment(work_id);

CREATE TABLE IF NOT EXISTS public.equipment_maintenances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id UUID NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  maintenance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT,
  performed_by TEXT,                           -- oficina / técnico
  maintenance_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (maintenance_cost >= 0),
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);
CREATE INDEX IF NOT EXISTS idx_equipment_maintenances_equipment_id ON public.equipment_maintenances(equipment_id);

ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_maintenances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "equipment_read" ON public.equipment;
DROP POLICY IF EXISTS "equipment_write_staff" ON public.equipment;
CREATE POLICY "equipment_read" ON public.equipment FOR SELECT TO obras_authenticated USING (true);
CREATE POLICY "equipment_write_staff" ON public.equipment
  FOR ALL TO obras_authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "equipment_maintenances_read" ON public.equipment_maintenances;
DROP POLICY IF EXISTS "equipment_maintenances_write_staff" ON public.equipment_maintenances;
CREATE POLICY "equipment_maintenances_read" ON public.equipment_maintenances FOR SELECT TO obras_authenticated USING (true);
CREATE POLICY "equipment_maintenances_write_staff" ON public.equipment_maintenances
  FOR ALL TO obras_authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipment, public.equipment_maintenances TO obras_authenticated;
