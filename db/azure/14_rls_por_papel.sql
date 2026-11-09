-- Permissões por papel (mínimo privilégio) e Gestor sem valores.
--  * Fecha TODO acesso anônimo (sem login): antes, works/materials/work_stages/services/company_settings eram
--    legíveis só com a chave pública e airbnb_*/worker_groups aceitavam leitura E escrita.
--  * Substitui a política "Allow authenticated full access" (qualquer usuário logado lia/apagava tudo).
--  * Papéis: admin vê e faz tudo; gestor tem as mesmas permissões do admin, mas sem nenhum dado de valores
--    (receitas, despesas, preços e custos ficam fechados; o servidor ainda esconde as colunas de valor das
--    tabelas mistas, veja server/mask.ts); prestador só vê/lança o que a tela dele usa.
-- Idempotente.

-- ---------------------------------------------------------------- funções de papel
CREATE OR REPLACE FUNCTION public.is_gestor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT lower(btrim(role)) IN ('gestor', 'gerente', 'manager', 'engineer', 'engenheiro')
                     FROM public.profiles WHERE id = auth.uid()), false)
$$;

-- equipe interna: administrador ou gestor
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin() OR public.is_gestor()
$$;
GRANT EXECUTE ON FUNCTION public.is_gestor(), public.is_staff() TO obras_anon, obras_authenticated;

-- ---------------------------------------------------------------- limpa as políticas antigas
DO $$
DECLARE
  r record;
  t text;
  managed text[] := ARRAY[
    'action_types', 'airbnb_properties', 'airbnb_rentals', 'airbnb_transactions', 'attendance_extras',
    'attendance_records', 'company_settings', 'compositions', 'compositions_history', 'consumption_tracking',
    'dashboards', 'densidades_insumo', 'display_settings', 'external_contracts', 'material_movements',
    'materials', 'service_providers', 'services', 'team_member_documents', 'team_members', 'work_diaries',
    'work_extra_materials', 'work_rented_materials', 'work_services', 'worker_groups', 'works'
  ];
BEGIN
  FOREACH t IN ARRAY managed LOOP
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
    END LOOP;
  END LOOP;

  -- ------------------------------------------------------------ leitura: qualquer usuário logado; escrita: equipe interna
  FOREACH t IN ARRAY ARRAY[
    'action_types', 'compositions', 'compositions_history', 'densidades_insumo', 'services', 'materials',
    'material_movements', 'work_services', 'work_extra_materials', 'work_rented_materials', 'works',
    'team_members', 'company_settings', 'display_settings', 'dashboards'
  ] LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO obras_authenticated USING (true)', t || '_read', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO obras_authenticated USING (public.is_staff()) WITH CHECK (public.is_staff())',
      t || '_write_staff', t);
  END LOOP;

  -- ------------------------------------------------------------ só a equipe interna (Equipes e contratos)
  FOREACH t IN ARRAY ARRAY[
    'attendance_extras', 'attendance_records', 'external_contracts', 'service_providers',
    'team_member_documents', 'worker_groups'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO obras_authenticated USING (public.is_staff()) WITH CHECK (public.is_staff())',
      t || '_staff_all', t);
  END LOOP;

  -- ------------------------------------------------------------ só o administrador (financeiro do Airbnb)
  FOREACH t IN ARRAY ARRAY['airbnb_properties', 'airbnb_rentals', 'airbnb_transactions'] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO obras_authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())',
      t || '_admin_all', t);
  END LOOP;
END $$;

-- empresa/telas: só o administrador altera (a leitura continua para os logados)
DROP POLICY IF EXISTS "company_settings_write_staff" ON public.company_settings;
DROP POLICY IF EXISTS "display_settings_write_staff" ON public.display_settings;
DROP POLICY IF EXISTS "dashboards_write_staff" ON public.dashboards;
CREATE POLICY "company_settings_write_admin" ON public.company_settings
  FOR ALL TO obras_authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "display_settings_write_admin" ON public.display_settings
  FOR ALL TO obras_authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "dashboards_write_admin" ON public.dashboards
  FOR ALL TO obras_authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------- Diário de Obra
-- todos leem; cada um registra em seu nome e altera/exclui o que é seu; a equipe interna altera tudo
CREATE OR REPLACE FUNCTION public.work_diaries_set_author()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.author_id IS NULL THEN
    NEW.author_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_work_diaries_set_author ON public.work_diaries;
CREATE TRIGGER trg_work_diaries_set_author
  BEFORE INSERT ON public.work_diaries
  FOR EACH ROW EXECUTE FUNCTION public.work_diaries_set_author();

CREATE POLICY "work_diaries_read" ON public.work_diaries FOR SELECT TO obras_authenticated USING (true);
CREATE POLICY "work_diaries_insert" ON public.work_diaries FOR INSERT TO obras_authenticated
  WITH CHECK (public.is_staff() OR author_id = auth.uid());
CREATE POLICY "work_diaries_update" ON public.work_diaries FOR UPDATE TO obras_authenticated
  USING (public.is_staff() OR author_id = auth.uid())
  WITH CHECK (public.is_staff() OR author_id = auth.uid());
CREATE POLICY "work_diaries_delete" ON public.work_diaries FOR DELETE TO obras_authenticated
  USING (public.is_staff() OR author_id = auth.uid());

-- ---------------------------------------------------------------- consumo de materiais
-- o prestador lança consumo; corrigir/apagar é com a equipe interna
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'consumption_tracking' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.consumption_tracking', r.policyname);
  END LOOP;
END $$;
CREATE POLICY "consumption_tracking_read" ON public.consumption_tracking FOR SELECT TO obras_authenticated USING (true);
CREATE POLICY "consumption_tracking_insert" ON public.consumption_tracking FOR INSERT TO obras_authenticated WITH CHECK (true);
CREATE POLICY "consumption_tracking_write_staff" ON public.consumption_tracking FOR UPDATE TO obras_authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "consumption_tracking_delete_staff" ON public.consumption_tracking FOR DELETE TO obras_authenticated
  USING (public.is_staff());

-- ---------------------------------------------------------------- Cronograma (etapas): todos leem, equipe interna altera
DROP POLICY IF EXISTS "work_stages_read_all" ON public.work_stages;
DROP POLICY IF EXISTS "work_stages_staff_write" ON public.work_stages;
DROP POLICY IF EXISTS "Allow anon read access" ON public.work_stages;
CREATE POLICY "work_stages_read_all" ON public.work_stages FOR SELECT TO obras_authenticated USING (true);
CREATE POLICY "work_stages_staff_write" ON public.work_stages
  FOR ALL TO obras_authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

-- ---------------------------------------------------------------- Planner: admin e gestor veem todos os cards
DROP POLICY IF EXISTS "planner_tasks_admin_all" ON public.planner_tasks;
DROP POLICY IF EXISTS "planner_tasks_staff_all" ON public.planner_tasks;
DROP POLICY IF EXISTS "planner_tasks_own" ON public.planner_tasks;
CREATE POLICY "planner_tasks_staff_all" ON public.planner_tasks
  FOR ALL TO obras_authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "planner_tasks_own" ON public.planner_tasks
  FOR ALL TO obras_authenticated
  USING (NOT public.is_staff() AND assignee_id IS NOT NULL AND assignee_id = public.current_team_member_id())
  WITH CHECK (NOT public.is_staff() AND assignee_id IS NOT NULL AND assignee_id = public.current_team_member_id());

DROP POLICY IF EXISTS "planner_attachments_admin_all" ON public.planner_task_attachments;
DROP POLICY IF EXISTS "planner_attachments_staff_all" ON public.planner_task_attachments;
DROP POLICY IF EXISTS "planner_attachments_own" ON public.planner_task_attachments;
CREATE POLICY "planner_attachments_staff_all" ON public.planner_task_attachments
  FOR ALL TO obras_authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "planner_attachments_own" ON public.planner_task_attachments
  FOR ALL TO obras_authenticated
  USING (NOT public.is_staff() AND EXISTS (SELECT 1 FROM public.planner_tasks t WHERE t.id = task_id))
  WITH CHECK (NOT public.is_staff() AND EXISTS (SELECT 1 FROM public.planner_tasks t WHERE t.id = task_id));

-- ---------------------------------------------------------------- valores: só o administrador
DROP POLICY IF EXISTS "revenues_staff_all" ON public.revenues;
DROP POLICY IF EXISTS "revenues_admin_all" ON public.revenues;
CREATE POLICY "revenues_admin_all" ON public.revenues
  FOR ALL TO obras_authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "expenses_staff_all" ON public.expenses;
DROP POLICY IF EXISTS "expenses_admin_all" ON public.expenses;
CREATE POLICY "expenses_admin_all" ON public.expenses
  FOR ALL TO obras_authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "work_extra_material_values_staff_all" ON public.work_extra_material_values;
DROP POLICY IF EXISTS "work_extra_material_values_admin_all" ON public.work_extra_material_values;
CREATE POLICY "work_extra_material_values_admin_all" ON public.work_extra_material_values
  FOR ALL TO obras_authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
