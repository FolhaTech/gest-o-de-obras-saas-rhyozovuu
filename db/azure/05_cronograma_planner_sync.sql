-- Sincronia entre o Cronograma (work_stages) e o Planner (planner_tasks).
-- Cada etapa do cronograma tem UMA tarefa espelho no Planner (planner_tasks.stage_id) e vice-versa:
--   etapa criada/alterada  -> tarefa criada/atualizada
--   tarefa espelho alterada -> etapa atualizada (nome, datas, progresso, status, responsável)
--   tarefa espelho excluída -> etapa excluída;  etapa excluída -> tarefa excluída (FK em cascata)
-- Os gatilhos usam pg_trigger_depth() para não gerar "eco" (um lado não reescreve o outro em loop).
-- Idempotente.

ALTER TABLE public.planner_tasks
  ADD COLUMN IF NOT EXISTS stage_id UUID UNIQUE REFERENCES public.work_stages(id) ON DELETE CASCADE;

-- Responsável (texto livre na etapa) -> membro da equipe: nome igual ou começando pelo texto
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

-- Etapa do cronograma -> tarefa do Planner
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
         WHEN NEW.status IS NULL OR NEW.status = 'pending' THEN 'pending'
         ELSE 'in_progress' END,
    LEAST(100, GREATEST(0, ROUND(COALESCE(NEW.progress_percentage, 0))))::int,
    NEW.start_date,
    NEW.end_date_planned,
    public.match_team_member(NEW.manager)
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

DROP TRIGGER IF EXISTS trg_sync_stage_to_planner ON public.work_stages;
CREATE TRIGGER trg_sync_stage_to_planner
  AFTER INSERT OR UPDATE ON public.work_stages
  FOR EACH ROW EXECUTE FUNCTION public.sync_stage_to_planner();

-- Tarefa espelho do Planner -> etapa do cronograma
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
               ELSE CASE WHEN s.status = 'delayed' THEN 'delayed' ELSE 'in_progress' END
             END,
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

DROP TRIGGER IF EXISTS trg_sync_planner_to_stage ON public.planner_tasks;
CREATE TRIGGER trg_sync_planner_to_stage
  AFTER UPDATE ON public.planner_tasks
  FOR EACH ROW WHEN (NEW.stage_id IS NOT NULL)
  EXECUTE FUNCTION public.sync_planner_to_stage();

CREATE OR REPLACE FUNCTION public.sync_planner_task_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  DELETE FROM public.work_stages WHERE id = OLD.stage_id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_planner_task_delete ON public.planner_tasks;
CREATE TRIGGER trg_sync_planner_task_delete
  AFTER DELETE ON public.planner_tasks
  FOR EACH ROW WHEN (OLD.stage_id IS NOT NULL)
  EXECUTE FUNCTION public.sync_planner_task_delete();

-- Etapas que já existiam ganham a tarefa espelho (não mexe nas etapas).
INSERT INTO public.planner_tasks
  (stage_id, work_id, title, description, status, progress_percentage, start_date, due_date, assignee_id, created_at)
SELECT s.id,
       s.work_id,
       s.name,
       NULLIF(btrim(COALESCE(s.notes, '')), ''),
       CASE WHEN s.status = 'completed' THEN 'completed'
            WHEN s.status IS NULL OR s.status = 'pending' THEN 'pending'
            ELSE 'in_progress' END,
       LEAST(100, GREATEST(0, ROUND(COALESCE(s.progress_percentage, 0))))::int,
       s.start_date,
       s.end_date_planned,
       public.match_team_member(s.manager),
       COALESCE(s.created_at, now())
  FROM public.work_stages s
ON CONFLICT (stage_id) DO NOTHING;

GRANT EXECUTE ON FUNCTION public.match_team_member(text) TO obras_anon, obras_authenticated;
