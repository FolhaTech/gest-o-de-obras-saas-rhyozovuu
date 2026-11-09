-- Status "Em atraso" (delayed) nas tarefas do Planner, espelhado no status "Atrasado" das etapas.
-- Idempotente.

-- 1) CHECK de status passa a aceitar 'delayed'
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.planner_tasks'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%status%in_progress%'
  LOOP
    EXECUTE format('ALTER TABLE public.planner_tasks DROP CONSTRAINT %I', c.conname);
  END LOOP;
  ALTER TABLE public.planner_tasks
    ADD CONSTRAINT planner_tasks_status_check
    CHECK (status IN ('pending', 'in_progress', 'delayed', 'completed'));
END $$;

-- 2) Etapa -> tarefa: "delayed" da etapa vira "delayed" na tarefa
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

-- 3) Tarefa espelho -> etapa: "delayed" da tarefa vira "delayed" na etapa
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

-- 4) Tarefas espelho de etapas já atrasadas acompanham o status da etapa
UPDATE public.planner_tasks t
   SET status = 'delayed'
  FROM public.work_stages s
 WHERE t.stage_id = s.id AND s.status = 'delayed' AND t.status <> 'delayed';
