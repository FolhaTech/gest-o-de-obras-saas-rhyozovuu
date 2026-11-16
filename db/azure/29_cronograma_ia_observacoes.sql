-- Cronograma com IA: observações do responsável pela obra.
-- Quando o responsável NÃO segue uma sugestão da IA (ou tem uma restrição geral, como "a equipe de gesso só chega dia 20"),
-- ele informa o motivo e a IA se adapta nas análises seguintes. As observações ficam guardadas por obra, valem enquanto
-- estiverem ativas e podem ser desativadas. Só Admin e Gestor (is_staff) leem e gravam. Idempotente.

CREATE TABLE IF NOT EXISTS public.schedule_ai_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  stage_id UUID REFERENCES public.work_stages(id) ON DELETE SET NULL,   -- etapa recusada (nulo = restrição geral)
  stage_name TEXT,                                                      -- nome guardado (a etapa pode ser excluída depois)
  kind TEXT NOT NULL CHECK (kind IN ('rejected', 'constraint')),
  from_list TEXT CHECK (from_list IS NULL OR from_list IN ('do_first', 'can_wait', 'in_parallel')),  -- lista da sugestão de onde a etapa foi recusada
  reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 3 AND 500),
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);
CREATE INDEX IF NOT EXISTS idx_schedule_ai_notes_work ON public.schedule_ai_notes(work_id, active, created_at DESC);

CREATE OR REPLACE FUNCTION public.schedule_ai_note_before_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_stage record;
BEGIN
  NEW.reason := btrim(NEW.reason);
  IF TG_OP = 'UPDATE' THEN
    -- depois de gravada, só liga e desliga (e o texto, se corrigido); a quem pertence não muda.
    -- (a etapa e o autor só podem virar nulos, que é o que o banco faz ao excluir a etapa ou o usuário)
    NEW.work_id := OLD.work_id; NEW.kind := OLD.kind; NEW.from_list := OLD.from_list;
    NEW.created_at := OLD.created_at; NEW.stage_name := OLD.stage_name;
    IF NEW.stage_id IS NOT NULL THEN NEW.stage_id := OLD.stage_id; END IF;
    IF NEW.created_by IS NOT NULL THEN NEW.created_by := OLD.created_by; END IF;
    RETURN NEW;
  END IF;
  IF NEW.kind NOT IN ('rejected', 'constraint') THEN RAISE EXCEPTION 'Tipo de observação inválido.'; END IF;
  IF NEW.kind = 'constraint' THEN
    -- restrição geral: não é de uma etapa nem de uma lista
    NEW.stage_id := NULL; NEW.stage_name := NULL; NEW.from_list := NULL;
  ELSE
    IF NEW.stage_id IS NULL THEN RAISE EXCEPTION 'Informe a etapa que você não vai seguir.'; END IF;
    IF NEW.from_list IS NULL THEN RAISE EXCEPTION 'Informe de qual lista da sugestão a etapa foi recusada.'; END IF;
    SELECT name, work_id INTO v_stage FROM public.work_stages WHERE id = NEW.stage_id;
    IF NOT FOUND OR v_stage.work_id IS DISTINCT FROM NEW.work_id THEN
      RAISE EXCEPTION 'A etapa não pertence a esta obra.';
    END IF;
    NEW.stage_name := btrim(v_stage.name);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_schedule_ai_note_before_write ON public.schedule_ai_notes;
CREATE TRIGGER trg_schedule_ai_note_before_write
  BEFORE INSERT OR UPDATE ON public.schedule_ai_notes
  FOR EACH ROW EXECUTE FUNCTION public.schedule_ai_note_before_write();

ALTER TABLE public.schedule_ai_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "schedule_ai_notes_staff" ON public.schedule_ai_notes;
CREATE POLICY "schedule_ai_notes_staff" ON public.schedule_ai_notes
  FOR ALL TO obras_authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_ai_notes TO obras_authenticated;
