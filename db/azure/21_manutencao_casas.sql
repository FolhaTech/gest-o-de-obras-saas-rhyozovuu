-- Manutenção das casas (diarista, piscineiro, jardineiro...): o colaborador registra a data, a casa (obra) e os
-- materiais que usou; cada material usado dá BAIXA no estoque (materials.stock_quantity).
--  * house_maintenances: a manutenção (data, casa, tipo, quem fez, observações, quem registrou)
--  * house_maintenance_materials: os materiais usados (nome e unidade ficam gravados no momento do uso)
-- Estoque: ao lançar, o gatilho trava a linha do material, recusa se faltar ("Estoque insuficiente") e desconta;
-- ao excluir a linha (ou a manutenção) o material VOLTA ao estoque. Cada baixa/estorno também entra em
-- material_movements. Material e quantidade de uma linha não se editam (exclui e lança de novo).
-- Check-in / check-out: ao fazer o check-in o registro nasce "em andamento" com a hora do SERVIDOR; o check-out
-- (status "done") grava a hora de saída, também do servidor. A tela mostra entrada, saída e o tempo que ficou.
-- Registro retroativo pode informar as horas à mão.
-- Acesso: Admin e Gestor veem e alteram tudo; os demais (colaborador/Prestador) registram e veem/alteram só as suas.
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.house_maintenances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,   -- a casa
  maintenance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  service_type TEXT NOT NULL,                  -- diarista, piscineiro, jardineiro...
  performed_by TEXT,                           -- quem executou (nome)
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'done' CHECK (status IN ('in_progress', 'done')),   -- em andamento (fez check-in) ou concluída
  check_in_at TIMESTAMPTZ,                     -- hora da entrada
  check_out_at TIMESTAMPTZ,                    -- hora da saída
  created_by UUID DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,   -- quem registrou
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()),
  CONSTRAINT house_maintenances_clock_order CHECK (check_out_at IS NULL OR check_in_at IS NULL OR check_out_at >= check_in_at),
  CONSTRAINT house_maintenances_clock_not_future CHECK (
    (check_in_at IS NULL OR check_in_at <= now() + interval '10 minutes')
    AND (check_out_at IS NULL OR check_out_at <= now() + interval '10 minutes')
  )
);
CREATE INDEX IF NOT EXISTS idx_house_maintenances_work ON public.house_maintenances(work_id, maintenance_date DESC);
CREATE INDEX IF NOT EXISTS idx_house_maintenances_created_by ON public.house_maintenances(created_by);

CREATE TABLE IF NOT EXISTS public.house_maintenance_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  maintenance_id UUID NOT NULL REFERENCES public.house_maintenances(id) ON DELETE CASCADE,
  material_id UUID REFERENCES public.materials(id) ON DELETE SET NULL,
  material_name TEXT NOT NULL DEFAULT '',      -- preenchidos pelo gatilho
  unit TEXT NOT NULL DEFAULT '',
  quantity NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);
CREATE INDEX IF NOT EXISTS idx_house_maintenance_materials_maintenance ON public.house_maintenance_materials(maintenance_id);
CREATE INDEX IF NOT EXISTS idx_house_maintenance_materials_material ON public.house_maintenance_materials(material_id);

-- quem registrou não muda; check-in e check-out usam a hora do servidor
CREATE OR REPLACE FUNCTION public.house_maintenance_before_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'in_progress' THEN
      NEW.check_in_at := COALESCE(NEW.check_in_at, now());   -- check-in agora
      NEW.check_out_at := NULL;
    END IF;
  ELSE
    NEW.created_by := OLD.created_by;
    IF NEW.status = 'done' AND OLD.status = 'in_progress' AND NEW.check_out_at IS NULL THEN
      NEW.check_out_at := now();                              -- check-out agora
    END IF;
    IF NEW.status = 'in_progress' THEN
      NEW.check_out_at := NULL;                               -- reaberta: ainda sem saída
      NEW.check_in_at := COALESCE(NEW.check_in_at, OLD.check_in_at, now());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_keep_house_maintenance_creator ON public.house_maintenances;
DROP FUNCTION IF EXISTS public.keep_house_maintenance_creator();
DROP TRIGGER IF EXISTS trg_house_maintenance_before_write ON public.house_maintenances;
CREATE TRIGGER trg_house_maintenance_before_write
  BEFORE INSERT OR UPDATE ON public.house_maintenances
  FOR EACH ROW EXECUTE FUNCTION public.house_maintenance_before_write();

-- baixa de estoque ao lançar o material
CREATE OR REPLACE FUNCTION public.house_material_take()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock numeric;
  v_name text;
  v_unit text;
  v_work uuid;
  v_date date;
  v_type text;
BEGIN
  IF NEW.material_id IS NULL THEN
    RAISE EXCEPTION 'Escolha o material utilizado.';
  END IF;

  -- trava o material: dois lançamentos ao mesmo tempo não gastam o mesmo estoque duas vezes
  SELECT stock_quantity, name, COALESCE(NULLIF(btrim(unit_of_measure), ''), NULLIF(btrim(unidade_nativa), ''), 'un')
    INTO v_stock, v_name, v_unit
    FROM public.materials WHERE id = NEW.material_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Material não encontrado no estoque.';
  END IF;

  IF COALESCE(v_stock, 0) < NEW.quantity THEN
    RAISE EXCEPTION 'Estoque insuficiente de "%": disponível % %, utilizado % %.',
      v_name, COALESCE(v_stock, 0), v_unit, NEW.quantity, v_unit;
  END IF;

  UPDATE public.materials SET stock_quantity = COALESCE(stock_quantity, 0) - NEW.quantity WHERE id = NEW.material_id;
  NEW.material_name := v_name;
  NEW.unit := v_unit;

  SELECT work_id, maintenance_date, service_type INTO v_work, v_date, v_type
    FROM public.house_maintenances WHERE id = NEW.maintenance_id;
  INSERT INTO public.material_movements (material_id, work_id, author_id, type, quantity, date, notes)
  VALUES (NEW.material_id, v_work, auth.uid(), 'saida', NEW.quantity, COALESCE(v_date, CURRENT_DATE),
          'Manutenção da casa: ' || COALESCE(v_type, ''));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_house_material_take ON public.house_maintenance_materials;
CREATE TRIGGER trg_house_material_take
  BEFORE INSERT ON public.house_maintenance_materials
  FOR EACH ROW EXECUTE FUNCTION public.house_material_take();

-- estorno: excluir a linha (ou a manutenção, em cascata) devolve o material ao estoque
CREATE OR REPLACE FUNCTION public.house_material_return()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.material_id IS NOT NULL THEN
    UPDATE public.materials SET stock_quantity = COALESCE(stock_quantity, 0) + OLD.quantity WHERE id = OLD.material_id;
    -- na exclusão em cascata a manutenção já não existe: a obra do estorno fica vazia
    INSERT INTO public.material_movements (material_id, work_id, author_id, type, quantity, date, notes)
    VALUES (OLD.material_id, (SELECT work_id FROM public.house_maintenances WHERE id = OLD.maintenance_id),
            auth.uid(), 'entrada', OLD.quantity, CURRENT_DATE, 'Estorno: material de manutenção da casa excluído');
  END IF;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS trg_house_material_return ON public.house_maintenance_materials;
CREATE TRIGGER trg_house_material_return
  AFTER DELETE ON public.house_maintenance_materials
  FOR EACH ROW EXECUTE FUNCTION public.house_material_return();

-- ---------------------------------------------------------------- permissões
ALTER TABLE public.house_maintenances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.house_maintenance_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "house_maintenances_read" ON public.house_maintenances;
DROP POLICY IF EXISTS "house_maintenances_insert" ON public.house_maintenances;
DROP POLICY IF EXISTS "house_maintenances_update" ON public.house_maintenances;
DROP POLICY IF EXISTS "house_maintenances_delete" ON public.house_maintenances;
CREATE POLICY "house_maintenances_read" ON public.house_maintenances
  FOR SELECT TO obras_authenticated USING (public.is_staff() OR created_by = auth.uid());
CREATE POLICY "house_maintenances_insert" ON public.house_maintenances
  FOR INSERT TO obras_authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "house_maintenances_update" ON public.house_maintenances
  FOR UPDATE TO obras_authenticated
  USING (public.is_staff() OR created_by = auth.uid())
  WITH CHECK (public.is_staff() OR created_by = auth.uid());
CREATE POLICY "house_maintenances_delete" ON public.house_maintenances
  FOR DELETE TO obras_authenticated USING (public.is_staff() OR created_by = auth.uid());

-- as linhas seguem a manutenção (o EXISTS passa pela RLS dela); sem política de UPDATE: não se edita linha
DROP POLICY IF EXISTS "house_maintenance_materials_read" ON public.house_maintenance_materials;
DROP POLICY IF EXISTS "house_maintenance_materials_insert" ON public.house_maintenance_materials;
DROP POLICY IF EXISTS "house_maintenance_materials_delete" ON public.house_maintenance_materials;
CREATE POLICY "house_maintenance_materials_read" ON public.house_maintenance_materials
  FOR SELECT TO obras_authenticated
  USING (EXISTS (SELECT 1 FROM public.house_maintenances h WHERE h.id = maintenance_id));
CREATE POLICY "house_maintenance_materials_insert" ON public.house_maintenance_materials
  FOR INSERT TO obras_authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.house_maintenances h WHERE h.id = maintenance_id AND (public.is_staff() OR h.created_by = auth.uid())));
CREATE POLICY "house_maintenance_materials_delete" ON public.house_maintenance_materials
  FOR DELETE TO obras_authenticated
  USING (EXISTS (SELECT 1 FROM public.house_maintenances h WHERE h.id = maintenance_id AND (public.is_staff() OR h.created_by = auth.uid())));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.house_maintenances TO obras_authenticated;
GRANT SELECT, INSERT, DELETE ON public.house_maintenance_materials TO obras_authenticated;
