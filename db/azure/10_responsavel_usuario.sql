-- "Pessoa Responsável" passa a ser um USUÁRIO do sistema (profiles), não mais um membro da equipe.
--  * planner_tasks.assignee_id -> profiles(id)
--  * work_stages.manager_user_id (novo) espelha o responsável do Cronograma no Planner
--  * quem não é Admin vê/edita só os cards em que é o responsável (assignee_id = auth.uid())
--  * some o vínculo usuário<->membro da equipe (profiles.team_member_id) e o que dependia dele
-- Roda só com o Planner sem cards (a coluna muda de tabela de referência). Idempotente após a 1ª execução.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.confrelid
     WHERE c.conrelid = 'public.planner_tasks'::regclass AND c.contype = 'f'
       AND c.conname = 'planner_tasks_assignee_id_fkey' AND t.relname = 'team_members'
  ) THEN
    IF EXISTS (SELECT 1 FROM public.planner_tasks WHERE assignee_id IS NOT NULL) THEN
      RAISE EXCEPTION 'Há cards com responsável da equipe; esvazie ou migre antes de trocar a referência.';
    END IF;
    ALTER TABLE public.planner_tasks DROP CONSTRAINT planner_tasks_assignee_id_fkey;
    ALTER TABLE public.planner_tasks
      ADD CONSTRAINT planner_tasks_assignee_id_fkey
      FOREIGN KEY (assignee_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.work_stages
  ADD COLUMN IF NOT EXISTS manager_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_work_stages_manager_user_id ON public.work_stages(manager_user_id);

-- Etapa -> tarefa: o responsável (usuário) da etapa vira o responsável do card
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
    NEW.manager_user_id
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

-- Tarefa espelho -> etapa: o responsável do card vira o responsável (usuário e nome) da etapa
CREATE OR REPLACE FUNCTION public.sync_planner_to_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  IF pg_trigger_depth() > 1 OR NEW.stage_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.assignee_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(btrim(full_name), ''), email) INTO v_name
      FROM public.profiles WHERE id = NEW.assignee_id;
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
    manager_user_id = NEW.assignee_id,
    manager = CASE WHEN NEW.assignee_id IS NOT NULL THEN v_name
                   WHEN OLD.assignee_id IS NOT NULL THEN NULL
                   ELSE s.manager END,
    end_date_real = CASE WHEN NEW.status = 'completed' THEN COALESCE(s.end_date_real, CURRENT_DATE)
                         WHEN OLD.status = 'completed' THEN NULL
                         ELSE s.end_date_real END
  WHERE s.id = NEW.stage_id;
  RETURN NEW;
END;
$$;

-- RLS: quem não é Admin só enxerga/edita os cards em que é o responsável (usuário logado)
DROP POLICY IF EXISTS "planner_tasks_own" ON public.planner_tasks;
CREATE POLICY "planner_tasks_own" ON public.planner_tasks
  FOR ALL TO obras_authenticated
  USING (NOT public.is_admin() AND assignee_id IS NOT NULL AND assignee_id = auth.uid())
  WITH CHECK (NOT public.is_admin() AND assignee_id IS NOT NULL AND assignee_id = auth.uid());

-- O vínculo usuário<->membro da equipe deixou de existir
DROP TRIGGER IF EXISTS trg_prevent_profile_link_change ON public.profiles;
DROP FUNCTION IF EXISTS public.prevent_profile_link_change();
DROP FUNCTION IF EXISTS public.current_team_member_id();
DROP FUNCTION IF EXISTS public.match_team_member(text);
ALTER TABLE public.profiles DROP COLUMN IF EXISTS team_member_id;
