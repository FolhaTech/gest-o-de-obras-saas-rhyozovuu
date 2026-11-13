-- Pagamento semanal da equipe calculado pela presença.
--  * Cada presença marcada (Equipes > Presença) alimenta, na hora, o Faturamento > Pagamento (Equipe): um pagamento
--    PENDENTE por pessoa e por semana (sábado a sexta, a mesma semana da tela de Presença) com
--    dias presentes x diária + extra semanal. Marcar ou desmarcar presença, mudar o extra ou a diária atualiza o valor.
--  * Quando a semana fecha (a partir da sexta-feira, último dia), o financeiro paga o valor daquela semana, pessoa
--    por pessoa. Antes disso o banco não deixa marcar como pago.
--  * Pago é pago: se a presença mudar depois do pagamento, aparece só a DIFERENÇA a pagar (um "complemento"), usando a
--    diária que valeu na semana paga. Se o valor devido cair abaixo do que já foi pago, não sobra nada pendente.
--  * Mensalistas (tipo "monthly") não entram no pagamento semanal. Semanas antes da data de início
--    (team_payment_config.auto_from = a semana em que esta migração roda) não geram pagamento: o histórico antigo
--    não vira pendência.
--  * Os valores calculados (membro, período, valor, dias, diária, extra) não são editados à mão; o financeiro marca como
--    pago e anota a forma de pagamento. Só o admin exclui um pagamento calculado.
-- Idempotente.

-- ---------------------------------------------------------------- data de início da contagem automática
CREATE TABLE IF NOT EXISTS public.team_payment_config (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  auto_from DATE NOT NULL
);
ALTER TABLE public.team_payment_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "team_payment_config_read" ON public.team_payment_config;
DROP POLICY IF EXISTS "team_payment_config_write" ON public.team_payment_config;
CREATE POLICY "team_payment_config_read" ON public.team_payment_config
  FOR SELECT TO obras_authenticated USING (public.is_admin() OR public.is_financeiro());
CREATE POLICY "team_payment_config_write" ON public.team_payment_config
  FOR ALL TO obras_authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_payment_config TO obras_authenticated;

-- hoje no horário de Brasília e início da semana (sábado)
CREATE OR REPLACE FUNCTION public.today_br()
RETURNS date LANGUAGE sql STABLE AS $$ SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date $$;
CREATE OR REPLACE FUNCTION public.team_week_start(d date)
RETURNS date LANGUAGE sql IMMUTABLE AS $$ SELECT d - ((extract(dow FROM d)::int + 1) % 7) $$;
GRANT EXECUTE ON FUNCTION public.today_br(), public.team_week_start(date) TO obras_anon, obras_authenticated;

INSERT INTO public.team_payment_config (id, auto_from)
VALUES (true, public.team_week_start(public.today_br()))
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------- colunas do pagamento calculado
ALTER TABLE public.team_payments
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'attendance')),
  ADD COLUMN IF NOT EXISTS week_start DATE,                       -- sábado da semana (pagamentos calculados)
  ADD COLUMN IF NOT EXISTS week_days INTEGER,                     -- dias presentes na semana
  ADD COLUMN IF NOT EXISTS week_rate NUMERIC(14,2),               -- diária que valeu na semana
  ADD COLUMN IF NOT EXISTS week_extra NUMERIC(14,2);              -- extra semanal
-- no máximo um pagamento pendente calculado por pessoa e semana
CREATE UNIQUE INDEX IF NOT EXISTS uq_team_payments_week_pending
  ON public.team_payments (member_id, week_start) WHERE source = 'attendance' AND status = 'pending';
CREATE INDEX IF NOT EXISTS idx_team_payments_week ON public.team_payments (week_start) WHERE source = 'attendance';

-- ---------------------------------------------------------------- cálculo da semana de uma pessoa
CREATE OR REPLACE FUNCTION public.team_week_sync(p_member uuid, p_week date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m record;
  v_from date;
  v_days integer;
  v_extra numeric;
  v_rate numeric;
  v_paid numeric;
  v_due numeric;
  v_diff numeric;
  v_ref text;
BEGIN
  p_week := public.team_week_start(p_week);
  SELECT auto_from INTO v_from FROM public.team_payment_config WHERE id;
  IF v_from IS NULL OR p_week < v_from THEN RETURN; END IF;
  SELECT id, name, payment_type, daily_cost, work_id INTO m FROM public.team_members WHERE id = p_member;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT count(*)::int INTO v_days FROM public.attendance_records
   WHERE worker_id = p_member AND date BETWEEN p_week AND p_week + 6 AND is_present;
  SELECT COALESCE(sum(extra_value), 0) INTO v_extra FROM public.attendance_extras
   WHERE worker_id = p_member AND week_start_date = p_week;
  -- a diária da semana é a que já foi paga; sem pagamento ainda, a de hoje
  SELECT week_rate INTO v_rate FROM public.team_payments
   WHERE member_id = p_member AND week_start = p_week AND source = 'attendance' AND status = 'paid'
   ORDER BY created_at LIMIT 1;
  IF v_rate IS NULL THEN v_rate := COALESCE(m.daily_cost, 0); END IF;
  SELECT COALESCE(sum(payment_amount), 0) INTO v_paid FROM public.team_payments
   WHERE member_id = p_member AND week_start = p_week AND source = 'attendance' AND status = 'paid';

  -- mensalista não entra no pagamento semanal
  v_due := CASE WHEN COALESCE(m.payment_type, 'daily') = 'monthly' THEN 0 ELSE v_days * v_rate + v_extra END;
  v_diff := round(v_due - v_paid, 2);

  IF v_diff > 0 THEN
    v_ref := 'Semana ' || to_char(p_week, 'DD/MM') || ' a ' || to_char(p_week + 6, 'DD/MM')
             || CASE WHEN v_paid > 0 THEN ' (complemento)' ELSE '' END;
    INSERT INTO public.team_payments
      (member_id, member_name, reference, period_start, period_end, work_id, payment_amount, status, source,
       week_start, week_days, week_rate, week_extra)
    VALUES
      (p_member, btrim(m.name), v_ref, p_week, p_week + 6, m.work_id, v_diff, 'pending', 'attendance',
       p_week, v_days, v_rate, v_extra)
    ON CONFLICT (member_id, week_start) WHERE source = 'attendance' AND status = 'pending'
    DO UPDATE SET payment_amount = EXCLUDED.payment_amount, reference = EXCLUDED.reference,
                  work_id = EXCLUDED.work_id, member_name = EXCLUDED.member_name,
                  week_days = EXCLUDED.week_days, week_rate = EXCLUDED.week_rate, week_extra = EXCLUDED.week_extra;
  ELSE
    DELETE FROM public.team_payments
     WHERE member_id = p_member AND week_start = p_week AND source = 'attendance' AND status = 'pending';
  END IF;
END;
$$;

-- ---------------------------------------------------------------- gatilhos que alimentam o cálculo
CREATE OR REPLACE FUNCTION public.team_week_from_attendance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN PERFORM public.team_week_sync(OLD.worker_id, public.team_week_start(OLD.date)); END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN PERFORM public.team_week_sync(NEW.worker_id, public.team_week_start(NEW.date)); END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_team_week_from_attendance ON public.attendance_records;
CREATE TRIGGER trg_team_week_from_attendance
  AFTER INSERT OR UPDATE OR DELETE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.team_week_from_attendance();

CREATE OR REPLACE FUNCTION public.team_week_from_extras()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN PERFORM public.team_week_sync(OLD.worker_id, public.team_week_start(OLD.week_start_date)); END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN PERFORM public.team_week_sync(NEW.worker_id, public.team_week_start(NEW.week_start_date)); END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_team_week_from_extras ON public.attendance_extras;
CREATE TRIGGER trg_team_week_from_extras
  AFTER INSERT OR UPDATE OR DELETE ON public.attendance_extras
  FOR EACH ROW EXECUTE FUNCTION public.team_week_from_extras();

-- mudou a diária, o tipo de pagamento, a obra ou o nome: recalcula as semanas pendentes e a semana de hoje
CREATE OR REPLACE FUNCTION public.team_week_from_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w date;
BEGIN
  FOR w IN
    SELECT week_start FROM public.team_payments
     WHERE member_id = NEW.id AND source = 'attendance' AND status = 'pending'
    UNION
    SELECT public.team_week_start(public.today_br())
  LOOP
    PERFORM public.team_week_sync(NEW.id, w);
  END LOOP;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_team_week_from_member ON public.team_members;
CREATE TRIGGER trg_team_week_from_member
  AFTER UPDATE OF daily_cost, payment_type, work_id, name ON public.team_members
  FOR EACH ROW
  WHEN (OLD.daily_cost IS DISTINCT FROM NEW.daily_cost OR OLD.payment_type IS DISTINCT FROM NEW.payment_type
        OR OLD.work_id IS DISTINCT FROM NEW.work_id OR OLD.name IS DISTINCT FROM NEW.name)
  EXECUTE FUNCTION public.team_week_from_member();

-- ---------------------------------------------------------------- regras do pagamento (gatilho da migração 22 + calculados)
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

-- só o admin exclui um pagamento calculado pela presença
CREATE OR REPLACE FUNCTION public.team_payment_before_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user = 'obras_authenticated' AND OLD.source = 'attendance' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Pagamentos calculados pela presença só o administrador exclui.';
  END IF;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS trg_team_payment_before_delete ON public.team_payments;
CREATE TRIGGER trg_team_payment_before_delete
  BEFORE DELETE ON public.team_payments
  FOR EACH ROW EXECUTE FUNCTION public.team_payment_before_delete();

-- ---------------------------------------------------------------- começa a contar: presença da semana atual em diante
DO $$
DECLARE
  r record;
  v_from date;
BEGIN
  SELECT auto_from INTO v_from FROM public.team_payment_config WHERE id;
  FOR r IN
    SELECT DISTINCT worker_id, public.team_week_start(date) AS ws FROM public.attendance_records WHERE date >= v_from
    UNION
    SELECT DISTINCT worker_id, public.team_week_start(week_start_date) FROM public.attendance_extras WHERE week_start_date >= v_from
  LOOP
    PERFORM public.team_week_sync(r.worker_id, r.ws);
  END LOOP;
END;
$$;
