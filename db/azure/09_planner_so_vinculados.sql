-- Planner: só o Administrador vê todos os cards. Qualquer outro papel (Prestador, Gestor/colaborador)
-- vê e edita somente os cards em que é a "Pessoa Responsável", ou seja, o membro da equipe vinculado
-- ao usuário em Configurações. Usuário sem perfil também fica restrito. Idempotente.

DROP POLICY IF EXISTS "planner_tasks_staff_all" ON public.planner_tasks;
DROP POLICY IF EXISTS "planner_tasks_prestador_own" ON public.planner_tasks;
DROP POLICY IF EXISTS "planner_tasks_admin_all" ON public.planner_tasks;
DROP POLICY IF EXISTS "planner_tasks_own" ON public.planner_tasks;
CREATE POLICY "planner_tasks_admin_all" ON public.planner_tasks
  FOR ALL TO obras_authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "planner_tasks_own" ON public.planner_tasks
  FOR ALL TO obras_authenticated
  USING (NOT public.is_admin() AND assignee_id IS NOT NULL AND assignee_id = public.current_team_member_id())
  WITH CHECK (NOT public.is_admin() AND assignee_id IS NOT NULL AND assignee_id = public.current_team_member_id());

DROP POLICY IF EXISTS "planner_attachments_staff_all" ON public.planner_task_attachments;
DROP POLICY IF EXISTS "planner_attachments_prestador_own" ON public.planner_task_attachments;
DROP POLICY IF EXISTS "planner_attachments_admin_all" ON public.planner_task_attachments;
DROP POLICY IF EXISTS "planner_attachments_own" ON public.planner_task_attachments;
CREATE POLICY "planner_attachments_admin_all" ON public.planner_task_attachments
  FOR ALL TO obras_authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
-- o EXISTS é filtrado pelo RLS de planner_tasks: só enxerga os cards do próprio usuário
CREATE POLICY "planner_attachments_own" ON public.planner_task_attachments
  FOR ALL TO obras_authenticated
  USING (NOT public.is_admin() AND EXISTS (SELECT 1 FROM public.planner_tasks t WHERE t.id = task_id))
  WITH CHECK (NOT public.is_admin() AND EXISTS (SELECT 1 FROM public.planner_tasks t WHERE t.id = task_id));
