-- Permissões do papel Prestador.
--  * Planner: o prestador vê/edita somente as tarefas atribuídas ao membro da equipe vinculado ao usuário dele.
--  * Cronograma (work_stages): o prestador vê as etapas de todos, mas não altera nada.
--  * Perfis: fecha a brecha que deixava qualquer usuário logado editar o perfil (papel) de outros.
--  * Planner sem login (anon) deixa de existir.
-- Idempotente.

-- 1) Vínculo usuário -> membro da equipe (definido por um administrador em Configurações)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS team_member_id UUID REFERENCES public.team_members(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_team_member_id ON public.profiles(team_member_id);

-- 2) Funções auxiliares (SECURITY DEFINER para ler o perfil sem depender do RLS dele)
CREATE OR REPLACE FUNCTION public.current_team_member_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT team_member_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_prestador()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT lower(role) = 'prestador' FROM public.profiles WHERE id = auth.uid()), false)
$$;

GRANT EXECUTE ON FUNCTION public.current_team_member_id(), public.is_prestador()
  TO obras_anon, obras_authenticated;

-- 3) Só administrador altera o vínculo do próprio usuário (o papel já tem trava própria)
CREATE OR REPLACE FUNCTION public.prevent_profile_link_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() = NEW.id
     AND OLD.team_member_id IS DISTINCT FROM NEW.team_member_id
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem vincular o usuário a um membro da equipe.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_link_change ON public.profiles;
CREATE TRIGGER trg_prevent_profile_link_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_link_change();

-- 4) Perfis: a política "full access" deixava qualquer usuário logado alterar o perfil de qualquer outro
--    (inclusive promovê-lo a admin). Passa a valer: ler todos; alterar o próprio (papel/vínculo travados
--    por gatilho); administrador altera e exclui qualquer um.
DROP POLICY IF EXISTS "Allow authenticated full access" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_admin" ON public.profiles;
CREATE POLICY "profiles_delete_admin" ON public.profiles
  FOR DELETE TO obras_authenticated USING (public.is_admin());

-- 5) Planner: sem acesso anônimo; equipe interna vê tudo; prestador só o que é dele
DROP POLICY IF EXISTS "Allow anon full access" ON public.planner_tasks;
DROP POLICY IF EXISTS "Allow authenticated full access" ON public.planner_tasks;
DROP POLICY IF EXISTS "planner_tasks_staff_all" ON public.planner_tasks;
DROP POLICY IF EXISTS "planner_tasks_prestador_own" ON public.planner_tasks;
CREATE POLICY "planner_tasks_staff_all" ON public.planner_tasks
  FOR ALL TO obras_authenticated
  USING (NOT public.is_prestador()) WITH CHECK (NOT public.is_prestador());
CREATE POLICY "planner_tasks_prestador_own" ON public.planner_tasks
  FOR ALL TO obras_authenticated
  USING (public.is_prestador() AND assignee_id IS NOT NULL AND assignee_id = public.current_team_member_id())
  WITH CHECK (public.is_prestador() AND assignee_id IS NOT NULL AND assignee_id = public.current_team_member_id());

DROP POLICY IF EXISTS "Allow anon full access" ON public.planner_task_attachments;
DROP POLICY IF EXISTS "Allow authenticated full access" ON public.planner_task_attachments;
DROP POLICY IF EXISTS "planner_attachments_staff_all" ON public.planner_task_attachments;
DROP POLICY IF EXISTS "planner_attachments_prestador_own" ON public.planner_task_attachments;
CREATE POLICY "planner_attachments_staff_all" ON public.planner_task_attachments
  FOR ALL TO obras_authenticated
  USING (NOT public.is_prestador()) WITH CHECK (NOT public.is_prestador());
-- o EXISTS é filtrado pelo RLS de planner_tasks: só enxerga as tarefas do próprio prestador
CREATE POLICY "planner_attachments_prestador_own" ON public.planner_task_attachments
  FOR ALL TO obras_authenticated
  USING (public.is_prestador() AND EXISTS (SELECT 1 FROM public.planner_tasks t WHERE t.id = task_id))
  WITH CHECK (public.is_prestador() AND EXISTS (SELECT 1 FROM public.planner_tasks t WHERE t.id = task_id));

-- 6) Cronograma: todos leem; só a equipe interna altera
DROP POLICY IF EXISTS "Allow authenticated full access" ON public.work_stages;
DROP POLICY IF EXISTS "work_stages_read_all" ON public.work_stages;
DROP POLICY IF EXISTS "work_stages_staff_write" ON public.work_stages;
CREATE POLICY "work_stages_read_all" ON public.work_stages
  FOR SELECT TO obras_authenticated USING (true);
CREATE POLICY "work_stages_staff_write" ON public.work_stages
  FOR ALL TO obras_authenticated
  USING (NOT public.is_prestador()) WITH CHECK (NOT public.is_prestador());
