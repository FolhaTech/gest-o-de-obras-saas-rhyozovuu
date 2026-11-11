-- Planner: histórico do progresso de cada card.
-- Toda vez que a porcentagem do card muda (pelo Planner, pelo Cronograma/Etapas ou por mudança de status), grava-se:
-- de quanto para quanto, quando e quem alterou. Quando chega a 100%, guarda também quantos dias o card levou
-- desde a criação até concluir. A criação do card também entra (com a porcentagem inicial).
-- Cards que já existiam não têm histórico anterior (a tela mostra só a data de criação deles).
-- Leitura: quem enxerga o card (a RLS do card vale). Escrita: só o gatilho. Idempotente.

CREATE TABLE IF NOT EXISTS public.planner_task_progress_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.planner_tasks(id) ON DELETE CASCADE,
  old_percentage INTEGER,                      -- nulo = criação do card
  new_percentage INTEGER NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),   -- hora real (não now(): várias linhas na mesma transação precisam manter a ordem)
  changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  days_to_complete INTEGER                     -- só quando new_percentage = 100: dias desde a criação do card
);
ALTER TABLE public.planner_task_progress_history ALTER COLUMN changed_at SET DEFAULT clock_timestamp();
CREATE INDEX IF NOT EXISTS idx_planner_progress_history_task ON public.planner_task_progress_history(task_id, changed_at);

CREATE OR REPLACE FUNCTION public.log_planner_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new integer := COALESCE(NEW.progress_percentage, 0);
  v_old integer;
  v_days integer;
  v_by uuid;
BEGIN
  -- auth.uid() é nulo quando a mudança vem de um gatilho/rotina interna sem usuário
  BEGIN
    v_by := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_by := NULL;
  END;
  IF v_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_by) THEN
    v_by := NULL;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.planner_task_progress_history (task_id, old_percentage, new_percentage, changed_by, days_to_complete)
    VALUES (NEW.id, NULL, v_new, COALESCE(v_by, NEW.created_by), CASE WHEN v_new >= 100 THEN 0 END);
    RETURN NEW;
  END IF;

  v_old := COALESCE(OLD.progress_percentage, 0);
  IF v_new IS DISTINCT FROM v_old THEN
    IF v_new >= 100 THEN
      -- dias corridos desde a criação do card até hoje (data de Brasília)
      v_days := GREATEST(
        0,
        (timezone('America/Sao_Paulo', NOW())::date - timezone('America/Sao_Paulo', COALESCE(NEW.created_at, NOW()))::date)
      );
    END IF;
    INSERT INTO public.planner_task_progress_history (task_id, old_percentage, new_percentage, changed_by, days_to_complete)
    VALUES (NEW.id, v_old, v_new, v_by, v_days);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_planner_progress_insert ON public.planner_tasks;
CREATE TRIGGER trg_log_planner_progress_insert
  AFTER INSERT ON public.planner_tasks
  FOR EACH ROW EXECUTE FUNCTION public.log_planner_progress();

DROP TRIGGER IF EXISTS trg_log_planner_progress_update ON public.planner_tasks;
CREATE TRIGGER trg_log_planner_progress_update
  AFTER UPDATE OF progress_percentage ON public.planner_tasks
  FOR EACH ROW
  WHEN (OLD.progress_percentage IS DISTINCT FROM NEW.progress_percentage)
  EXECUTE FUNCTION public.log_planner_progress();

ALTER TABLE public.planner_task_progress_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "planner_progress_history_read" ON public.planner_task_progress_history;
-- o EXISTS é filtrado pela RLS de planner_tasks: Admin/Gestor veem tudo; os demais só os cards deles
CREATE POLICY "planner_progress_history_read" ON public.planner_task_progress_history
  FOR SELECT TO obras_authenticated
  USING (EXISTS (SELECT 1 FROM public.planner_tasks t WHERE t.id = task_id));

GRANT SELECT ON public.planner_task_progress_history TO obras_authenticated;
