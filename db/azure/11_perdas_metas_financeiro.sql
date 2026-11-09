-- 1) Financeiro fechado para o Prestador: receitas e despesas (base do ROI) ficam só para a equipe interna.
-- 2) Controle de perdas de materiais (material_losses).
-- 3) Metas de pessoal com premiação (work_goals + work_goal_members).
-- Idempotente.

-- ---------------------------------------------------------------- 1) financeiro
DROP POLICY IF EXISTS "Allow authenticated full access" ON public.revenues;
DROP POLICY IF EXISTS "revenues_staff_all" ON public.revenues;
CREATE POLICY "revenues_staff_all" ON public.revenues
  FOR ALL TO obras_authenticated
  USING (NOT public.is_prestador()) WITH CHECK (NOT public.is_prestador());

DROP POLICY IF EXISTS "Allow authenticated full access" ON public.expenses;
DROP POLICY IF EXISTS "expenses_staff_all" ON public.expenses;
CREATE POLICY "expenses_staff_all" ON public.expenses
  FOR ALL TO obras_authenticated
  USING (NOT public.is_prestador()) WITH CHECK (NOT public.is_prestador());

-- ---------------------------------------------------------------- 2) perdas de materiais
CREATE TABLE IF NOT EXISTS public.material_losses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID REFERENCES public.works(id) ON DELETE SET NULL,          -- nulo = estoque geral
  material_id UUID REFERENCES public.materials(id) ON DELETE SET NULL,
  material_name TEXT NOT NULL,                                          -- nome na data do registro
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL DEFAULT 'un',
  unit_cost NUMERIC NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),          -- custo unitário na data do registro
  reason TEXT NOT NULL DEFAULT 'outro'
    CHECK (reason IN ('quebra', 'desperdicio', 'furto', 'clima', 'erro_execucao', 'vencimento', 'outro')),
  loss_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_material_losses_work_id ON public.material_losses(work_id);
CREATE INDEX IF NOT EXISTS idx_material_losses_material_id ON public.material_losses(material_id);
CREATE INDEX IF NOT EXISTS idx_material_losses_date ON public.material_losses(loss_date);

ALTER TABLE public.material_losses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "material_losses_select" ON public.material_losses;
DROP POLICY IF EXISTS "material_losses_insert" ON public.material_losses;
DROP POLICY IF EXISTS "material_losses_update" ON public.material_losses;
DROP POLICY IF EXISTS "material_losses_delete" ON public.material_losses;
-- todos leem e registram (o registro fica em nome de quem lançou); o prestador só altera/exclui o que ele mesmo lançou
CREATE POLICY "material_losses_select" ON public.material_losses
  FOR SELECT TO obras_authenticated USING (true);
CREATE POLICY "material_losses_insert" ON public.material_losses
  FOR INSERT TO obras_authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "material_losses_update" ON public.material_losses
  FOR UPDATE TO obras_authenticated
  USING (NOT public.is_prestador() OR created_by = auth.uid())
  WITH CHECK (NOT public.is_prestador() OR created_by = auth.uid());
CREATE POLICY "material_losses_delete" ON public.material_losses
  FOR DELETE TO obras_authenticated
  USING (NOT public.is_prestador() OR created_by = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_losses TO obras_authenticated;

-- ---------------------------------------------------------------- 3) metas de pessoal
CREATE TABLE IF NOT EXISTS public.work_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  reward_description TEXT NOT NULL,                 -- a premiação (ex.: "Bônus de R$ 500", "Churrasco da equipe")
  reward_amount NUMERIC NOT NULL DEFAULT 0 CHECK (reward_amount >= 0),
  due_date DATE,
  paid_at DATE,                                     -- quando a premiação foi entregue
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_work_goals_work_id ON public.work_goals(work_id);

-- quem participa da meta: 1 usuário = meta individual; vários = meta de equipe
CREATE TABLE IF NOT EXISTS public.work_goal_members (
  goal_id UUID NOT NULL REFERENCES public.work_goals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (goal_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_work_goal_members_user_id ON public.work_goal_members(user_id);

-- SECURITY DEFINER evita recursão de RLS ao consultar a própria tabela de membros
CREATE OR REPLACE FUNCTION public.is_goal_member(p_goal uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.work_goal_members WHERE goal_id = p_goal AND user_id = auth.uid())
$$;
GRANT EXECUTE ON FUNCTION public.is_goal_member(uuid) TO obras_authenticated;

ALTER TABLE public.work_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_goal_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "work_goals_admin_all" ON public.work_goals;
DROP POLICY IF EXISTS "work_goals_member_read" ON public.work_goals;
DROP POLICY IF EXISTS "work_goal_members_admin_all" ON public.work_goal_members;
DROP POLICY IF EXISTS "work_goal_members_member_read" ON public.work_goal_members;
-- administrador cria/edita tudo; cada participante só lê as metas em que está
CREATE POLICY "work_goals_admin_all" ON public.work_goals
  FOR ALL TO obras_authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "work_goals_member_read" ON public.work_goals
  FOR SELECT TO obras_authenticated USING (public.is_goal_member(id));
CREATE POLICY "work_goal_members_admin_all" ON public.work_goal_members
  FOR ALL TO obras_authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "work_goal_members_member_read" ON public.work_goal_members
  FOR SELECT TO obras_authenticated USING (public.is_goal_member(goal_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_goals, public.work_goal_members TO obras_authenticated;
