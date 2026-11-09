-- "Pessoa Responsável" volta a ser um MEMBRO DA EQUIPE (team_members), no lugar de um usuário do sistema (10).
--  * planner_tasks.assignee_id -> team_members(id)
--  * work_stages.manager_user_id vira manager_member_id (membro da equipe). Um gatilho o deriva do nome
--    digitado/escolhido em "Responsável" (work_stages.manager), como antes.
--  * o administrador vincula cada usuário a um membro (profiles.team_member_id, em Configurações);
--    quem não é Admin vê/edita só os cards em que o membro vinculado a ele é o responsável.
--  * work_goal_members.member_id guarda o membro de cada participante da meta (preenchido por gatilho)
--    para o indicador de premiação enxergar as etapas dele sem depender de ler perfis alheios.
-- Os responsáveis atuais eram USUÁRIOS e não têm correspondente na equipe: ficam em branco para reatribuir.
-- Os gatilhos de sincronia ficam desligados durante os acertos de dados para não recriar cards no Planner.
-- Idempotente.

BEGIN;

ALTER TABLE public.work_stages DISABLE TRIGGER trg_sync_stage_to_planner;
ALTER TABLE public.planner_tasks DISABLE TRIGGER trg_sync_planner_to_stage;

-- ------------------------------------------------------------------ vínculo usuário <-> membro
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS team_member_id UUID REFERENCES public.team_members(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_team_member_id ON public.profiles(team_member_id);

CREATE OR REPLACE FUNCTION public.current_team_member_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT team_member_id FROM public.profiles WHERE id = auth.uid()
$$;
GRANT EXECUTE ON FUNCTION public.current_team_member_id() TO obras_anon, obras_authenticated;

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

-- ------------------------------------------------------------------ etapas: responsável = membro
-- Responsável (texto na etapa) -> membro da equipe: nome igual ou começando pelo texto
-- ("Francisco" encontra "Francisco de Oliveira"). Prefere ativos e correspondência exata.
CREATE OR REPLACE FUNCTION public.match_team_member(p_name text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id
    FROM public.team_members t
   WHERE nullif(btrim(p_name), '') IS NOT NULL
     AND (
       lower(btrim(t.name)) = lower(btrim(p_name))
       OR starts_with(lower(btrim(t.name)), lower(btrim(p_name)) || ' ')
     )
   ORDER BY (t.status = 'active') DESC,
            (lower(btrim(t.name)) = lower(btrim(p_name))) DESC,
            t.created_at
   LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.match_team_member(text) TO obras_anon, obras_authenticated;

ALTER TABLE public.work_stages
  ADD COLUMN IF NOT EXISTS manager_member_id UUID REFERENCES public.team_members(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_work_stages_manager_member_id ON public.work_stages(manager_member_id);

CREATE OR REPLACE FUNCTION public.derive_stage_manager_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.manager IS DISTINCT FROM OLD.manager THEN
    NEW.manager_member_id := public.match_team_member(NEW.manager);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_derive_stage_manager_member ON public.work_stages;
CREATE TRIGGER trg_derive_stage_manager_member
  BEFORE INSERT OR UPDATE ON public.work_stages
  FOR EACH ROW EXECUTE FUNCTION public.derive_stage_manager_member();

-- Etapa -> tarefa: o membro responsável da etapa vira o responsável do card
CREATE OR REPLACE FUNCTION public.sync_stage_to_planner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.planner_tasks
    (stage_id, work_id, title, description, status, progress_percentage, start_date, due_date, assignee_id)
  VALUES (
    NEW.id,
    NEW.work_id,
    NEW.name,
    NULLIF(btrim(COALESCE(NEW.notes, '')), ''),
    CASE WHEN NEW.status = 'completed' THEN 'completed'
         WHEN NEW.status = 'delayed' THEN 'delayed'
         WHEN NEW.status IS NULL OR NEW.status = 'pending' THEN 'pending'
         ELSE 'in_progress' END,
    LEAST(100, GREATEST(0, ROUND(COALESCE(NEW.progress_percentage, 0))))::int,
    NEW.start_date,
    NEW.end_date_planned,
    COALESCE(NEW.manager_member_id, public.match_team_member(NEW.manager))
  )
  ON CONFLICT (stage_id) DO UPDATE SET
    work_id = EXCLUDED.work_id,
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    status = EXCLUDED.status,
    progress_percentage = EXCLUDED.progress_percentage,
    start_date = EXCLUDED.start_date,
    due_date = EXCLUDED.due_date,
    assignee_id = EXCLUDED.assignee_id;
  RETURN NEW;
END;
$$;

-- Tarefa espelho -> etapa: o membro responsável do card vira o responsável (membro e nome) da etapa
CREATE OR REPLACE FUNCTION public.sync_planner_to_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member text;
BEGIN
  IF pg_trigger_depth() > 1 OR NEW.stage_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.assignee_id IS NOT NULL THEN
    SELECT btrim(name) INTO v_member FROM public.team_members WHERE id = NEW.assignee_id;
  END IF;

  UPDATE public.work_stages s SET
    name = NEW.title,
    notes = NEW.description,
    work_id = COALESCE(NEW.work_id, s.work_id),
    start_date = COALESCE(NEW.start_date, s.start_date),
    end_date_planned = COALESCE(NEW.due_date, s.end_date_planned),
    progress_percentage = NEW.progress_percentage,
    status = CASE NEW.status
               WHEN 'completed' THEN 'completed'
               WHEN 'pending' THEN 'pending'
               WHEN 'delayed' THEN 'delayed'
               ELSE 'in_progress'
             END,
    manager_member_id = NEW.assignee_id,
    manager = CASE WHEN NEW.assignee_id IS NOT NULL THEN v_member
                   WHEN OLD.assignee_id IS NOT NULL THEN NULL
                   ELSE s.manager END,
    end_date_real = CASE WHEN NEW.status = 'completed' THEN COALESCE(s.end_date_real, CURRENT_DATE)
                         WHEN OLD.status = 'completed' THEN NULL
                         ELSE s.end_date_real END
  WHERE s.id = NEW.stage_id;
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------ acerto dos dados (só na 1ª execução)
DO $$
DECLARE
  refs_profiles boolean;
  has_old_col boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.confrelid
     WHERE c.conrelid = 'public.planner_tasks'::regclass AND c.contype = 'f'
       AND c.conname = 'planner_tasks_assignee_id_fkey' AND t.relname = 'profiles'
  ) INTO refs_profiles;

  IF refs_profiles THEN
    UPDATE public.planner_tasks SET assignee_id = NULL WHERE assignee_id IS NOT NULL;
    ALTER TABLE public.planner_tasks DROP CONSTRAINT planner_tasks_assignee_id_fkey;
    ALTER TABLE public.planner_tasks
      ADD CONSTRAINT planner_tasks_assignee_id_fkey
      FOREIGN KEY (assignee_id) REFERENCES public.team_members(id) ON DELETE SET NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'work_stages' AND column_name = 'manager_user_id'
  ) INTO has_old_col;

  IF has_old_col THEN
    -- o nome do "Responsável" dessas etapas veio de um usuário: limpa
    UPDATE public.work_stages SET manager = NULL WHERE manager_user_id IS NOT NULL;
    ALTER TABLE public.work_stages DROP COLUMN manager_user_id;
  END IF;
END $$;

-- etapas com "Responsável" digitado que corresponde a um membro da equipe passam a apontar para ele
-- (e o card espelho que já existe acompanha; nenhum card novo é criado)
UPDATE public.work_stages SET manager_member_id = public.match_team_member(manager)
 WHERE manager_member_id IS NULL AND nullif(btrim(manager), '') IS NOT NULL;
UPDATE public.planner_tasks t SET assignee_id = s.manager_member_id
  FROM public.work_stages s
 WHERE t.stage_id = s.id AND s.manager_member_id IS NOT NULL AND t.assignee_id IS DISTINCT FROM s.manager_member_id;

ALTER TABLE public.work_stages ENABLE TRIGGER trg_sync_stage_to_planner;
ALTER TABLE public.planner_tasks ENABLE TRIGGER trg_sync_planner_to_stage;

-- ------------------------------------------------------------------ RLS do Planner
-- quem não é Admin só enxerga/edita os cards em que o membro vinculado a ele é o responsável
DROP POLICY IF EXISTS "planner_tasks_own" ON public.planner_tasks;
CREATE POLICY "planner_tasks_own" ON public.planner_tasks
  FOR ALL TO obras_authenticated
  USING (NOT public.is_admin() AND assignee_id IS NOT NULL AND assignee_id = public.current_team_member_id())
  WITH CHECK (NOT public.is_admin() AND assignee_id IS NOT NULL AND assignee_id = public.current_team_member_id());

-- ------------------------------------------------------------------ metas: membro de cada participante
ALTER TABLE public.work_goal_members
  ADD COLUMN IF NOT EXISTS member_id UUID REFERENCES public.team_members(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.fill_goal_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.member_id := (SELECT team_member_id FROM public.profiles WHERE id = NEW.user_id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_fill_goal_member ON public.work_goal_members;
CREATE TRIGGER trg_fill_goal_member
  BEFORE INSERT ON public.work_goal_members
  FOR EACH ROW EXECUTE FUNCTION public.fill_goal_member();

-- trocar o vínculo do usuário atualiza as metas dele
CREATE OR REPLACE FUNCTION public.sync_goal_member_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.team_member_id IS DISTINCT FROM OLD.team_member_id THEN
    UPDATE public.work_goal_members SET member_id = NEW.team_member_id WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_sync_goal_member_link ON public.profiles;
CREATE TRIGGER trg_sync_goal_member_link
  AFTER UPDATE OF team_member_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_goal_member_link();

UPDATE public.work_goal_members m SET member_id = p.team_member_id
  FROM public.profiles p WHERE p.id = m.user_id AND m.member_id IS DISTINCT FROM p.team_member_id;

COMMIT;
