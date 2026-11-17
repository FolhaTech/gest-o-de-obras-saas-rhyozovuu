-- Equipe: conferência da semana toda sexta. O admin confere a presença de toda a equipe e APROVA a semana; só depois o
-- financeiro paga.
--  * team_week_approvals: uma linha por semana aprovada (sábado a sexta). Só o admin aprova e reabre; a semana precisa estar
--    fechada (a partir da sexta). Admin, Gestor e Financeiro leem.
--  * o pagamento calculado pela presença (migração 26) só passa para "pago" com a semana aprovada, além de fechada.
--  * se a presença, o extra semanal ou a diária mudarem depois da aprovação, a aprovação cai e a semana volta a precisar da
--    conferência (nada de pagar um valor que o admin não viu). Atualização sem mudança de valor não derruba a aprovação.
-- Idempotente.

-- ---------------------------------------------------------------- aprovações da semana
CREATE TABLE IF NOT EXISTS public.team_week_approvals (
  week_start DATE PRIMARY KEY CHECK (extract(dow FROM week_start) = 6),   -- sábado que abre a semana
  approved_by UUID DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);

CREATE OR REPLACE FUNCTION public.team_week_approval_before_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user = 'obras_authenticated' THEN
    -- quem aprova e quando vêm do login, não do pedido
    NEW.approved_by := auth.uid();
    NEW.approved_at := now();
    IF public.today_br() < NEW.week_start + 6 THEN
      RAISE EXCEPTION 'A semana de % a % ainda não fechou. A conferência abre na sexta-feira, último dia da semana.',
        to_char(NEW.week_start, 'DD/MM'), to_char(NEW.week_start + 6, 'DD/MM');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_team_week_approval_before_write ON public.team_week_approvals;
CREATE TRIGGER trg_team_week_approval_before_write
  BEFORE INSERT ON public.team_week_approvals
  FOR EACH ROW EXECUTE FUNCTION public.team_week_approval_before_write();

ALTER TABLE public.team_week_approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "team_week_approvals_read" ON public.team_week_approvals;
DROP POLICY IF EXISTS "team_week_approvals_insert" ON public.team_week_approvals;
DROP POLICY IF EXISTS "team_week_approvals_delete" ON public.team_week_approvals;
CREATE POLICY "team_week_approvals_read" ON public.team_week_approvals
  FOR SELECT TO obras_authenticated USING (public.is_staff() OR public.is_financeiro());
CREATE POLICY "team_week_approvals_insert" ON public.team_week_approvals
  FOR INSERT TO obras_authenticated WITH CHECK (public.is_admin());
CREATE POLICY "team_week_approvals_delete" ON public.team_week_approvals
  FOR DELETE TO obras_authenticated USING (public.is_admin());
GRANT SELECT, INSERT, DELETE ON public.team_week_approvals TO obras_authenticated;

-- derruba a aprovação de uma semana (usado quando a presença muda depois de aprovada)
CREATE OR REPLACE FUNCTION public.team_week_revoke(p_week date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.team_week_approvals WHERE week_start = public.team_week_start(p_week);
END;
$$;

-- ---------------------------------------------------------------- gatilhos que derrubam a aprovação quando algo muda
CREATE OR REPLACE FUNCTION public.team_week_from_attendance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.worker_id IS DISTINCT FROM NEW.worker_id OR OLD.date IS DISTINCT FROM NEW.date OR OLD.is_present IS DISTINCT FROM NEW.is_present THEN
      PERFORM public.team_week_revoke(OLD.date);
      PERFORM public.team_week_revoke(NEW.date);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.team_week_revoke(OLD.date);
  ELSE
    PERFORM public.team_week_revoke(NEW.date);
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN PERFORM public.team_week_sync(OLD.worker_id, public.team_week_start(OLD.date)); END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN PERFORM public.team_week_sync(NEW.worker_id, public.team_week_start(NEW.date)); END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.team_week_from_extras()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.worker_id IS DISTINCT FROM NEW.worker_id OR OLD.week_start_date IS DISTINCT FROM NEW.week_start_date
       OR COALESCE(OLD.extra_value, 0) IS DISTINCT FROM COALESCE(NEW.extra_value, 0) THEN
      PERFORM public.team_week_revoke(OLD.week_start_date);
      PERFORM public.team_week_revoke(NEW.week_start_date);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF COALESCE(OLD.extra_value, 0) <> 0 THEN PERFORM public.team_week_revoke(OLD.week_start_date); END IF;
  ELSIF COALESCE(NEW.extra_value, 0) <> 0 THEN
    PERFORM public.team_week_revoke(NEW.week_start_date);
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN PERFORM public.team_week_sync(OLD.worker_id, public.team_week_start(OLD.week_start_date)); END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN PERFORM public.team_week_sync(NEW.worker_id, public.team_week_start(NEW.week_start_date)); END IF;
  RETURN NULL;
END;
$$;

-- mudou a diária ou o tipo de pagamento: recalcula as semanas pendentes e a de hoje, e essas semanas voltam à conferência
CREATE OR REPLACE FUNCTION public.team_week_from_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w date;
  v_amount boolean := OLD.daily_cost IS DISTINCT FROM NEW.daily_cost OR OLD.payment_type IS DISTINCT FROM NEW.payment_type;
BEGIN
  FOR w IN
    SELECT week_start FROM public.team_payments
     WHERE member_id = NEW.id AND source = 'attendance' AND status = 'pending'
    UNION
    SELECT public.team_week_start(public.today_br())
  LOOP
    IF v_amount THEN PERFORM public.team_week_revoke(w); END IF;
    PERFORM public.team_week_sync(NEW.id, w);
  END LOOP;
  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------- pagamento só com a semana aprovada (migração 26 + trava)
CREATE OR REPLACE FUNCTION public.team_payment_before_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  -- sessão de um usuário da API; o cálculo da semana e as rotinas do banco rodam com outro papel
  v_user boolean := current_user = 'obras_authenticated';
BEGIN
  IF v_user THEN
    IF TG_OP = 'INSERT' THEN
      -- pagamento lançado à mão nunca nasce como calculado
      NEW.source := 'manual'; NEW.week_start := NULL; NEW.week_days := NULL; NEW.week_rate := NULL; NEW.week_extra := NULL;
    ELSIF OLD.source = 'attendance' THEN
      -- calculado pela presença: valor, pessoa e período não mudam à mão
      NEW.source := OLD.source; NEW.member_id := OLD.member_id; NEW.member_name := OLD.member_name;
      NEW.reference := OLD.reference; NEW.period_start := OLD.period_start; NEW.period_end := OLD.period_end;
      NEW.payment_amount := OLD.payment_amount; NEW.work_id := OLD.work_id; NEW.week_start := OLD.week_start;
      NEW.week_days := OLD.week_days; NEW.week_rate := OLD.week_rate; NEW.week_extra := OLD.week_extra;
      IF OLD.status = 'paid' AND NEW.status = 'pending' THEN
        RAISE EXCEPTION 'O pagamento desta semana já foi feito. Para corrigir, ajuste a presença: a diferença aparece como novo pagamento.';
      END IF;
    ELSIF NEW.source <> OLD.source THEN
      NEW.source := OLD.source;
    END IF;
    -- semana aberta não se paga: libera na sexta-feira, último dia da semana
    IF NEW.source = 'attendance' AND NEW.status = 'paid' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'paid')
       AND public.today_br() < NEW.week_start + 6 THEN
      RAISE EXCEPTION 'A semana de % a % ainda não fechou. O pagamento é liberado na sexta-feira, último dia da semana.',
        to_char(NEW.week_start, 'DD/MM'), to_char(NEW.week_start + 6, 'DD/MM');
    END IF;
    -- semana fechada só se paga depois que o admin conferiu a presença e aprovou a semana
    IF NEW.source = 'attendance' AND NEW.status = 'paid' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'paid')
       AND NOT EXISTS (SELECT 1 FROM public.team_week_approvals a WHERE a.week_start = NEW.week_start) THEN
      RAISE EXCEPTION 'A semana de % a % ainda não foi conferida e aprovada pelo admin.',
        to_char(NEW.week_start, 'DD/MM'), to_char(NEW.week_start + 6, 'DD/MM');
    END IF;
  END IF;

  IF NEW.member_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.member_id IS DISTINCT FROM OLD.member_id OR COALESCE(NEW.member_name, '') = '') THEN
    SELECT btrim(name) INTO NEW.member_name FROM public.team_members WHERE id = NEW.member_id;
  END IF;
  -- pago sem data = hoje; voltar para pendente limpa a data
  IF NEW.status = 'paid' AND NEW.paid_at IS NULL THEN
    NEW.paid_at := public.today_br();
  ELSIF NEW.status = 'pending' THEN
    NEW.paid_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_team_payment_before_write ON public.team_payments;
CREATE TRIGGER trg_team_payment_before_write
  BEFORE INSERT OR UPDATE ON public.team_payments
  FOR EACH ROW EXECUTE FUNCTION public.team_payment_before_write();
