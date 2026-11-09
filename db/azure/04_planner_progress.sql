-- Porcentagem de conclusão por tarefa do Planner (espelhada nas Etapas do Projeto da obra).
-- Idempotente. Em bancos novos a coluna já vem de 02_schema.sql.
ALTER TABLE public.planner_tasks
  ADD COLUMN IF NOT EXISTS progress_percentage INTEGER NOT NULL DEFAULT 0
  CHECK (progress_percentage BETWEEN 0 AND 100);

-- Tarefas já concluídas passam a valer 100%.
UPDATE public.planner_tasks SET progress_percentage = 100
 WHERE status = 'completed' AND progress_percentage = 0;
