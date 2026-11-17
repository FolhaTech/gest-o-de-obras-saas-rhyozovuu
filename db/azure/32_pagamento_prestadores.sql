-- Financeiro: pagamento de PRESTADORES de serviços externos por solicitação.
--  * O ADMIN abre a solicitação de pagamento para o contas a pagar (Financeiro) com os dados do prestador:
--      Nome, PIX, Tratativa (tipo de serviço prestado), NF, Casa (obra onde o serviço foi prestado), Valor e Vencimento.
--    Todos são obrigatórios. O prestador pode ser escolhido entre os cadastrados em Equipes > Prestadores.
--  * O FINANCEIRO (contas a pagar) paga: marca como pago com a forma de pagamento, a data e uma observação.
--    Não altera os dados da solicitação. O admin edita e cancela enquanto ela está aberta.
--  * Pago e cancelado são finais. Só Admin e Financeiro leem (são valores).
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.provider_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID REFERENCES public.service_providers(id) ON DELETE SET NULL,   -- prestador cadastrado (opcional)
  provider_name TEXT NOT NULL,                                                   -- Nome
  pix_key TEXT NOT NULL,                                                         -- PIX
  service_type TEXT NOT NULL,                                                    -- Tratativa: tipo de serviço prestado
  invoice_number TEXT NOT NULL,                                                  -- NF
  work_id UUID REFERENCES public.works(id) ON DELETE SET NULL,                   -- Casa
  work_name TEXT,                                                                -- nome da casa guardado na solicitação
  payment_amount NUMERIC(14,2) NOT NULL CHECK (payment_amount > 0),              -- Valor
  due_date DATE NOT NULL,                                                        -- Vencimento
  notes TEXT,                                                                    -- observação do admin
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'paid', 'cancelled')),
  requested_by UUID DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,
  paid_at DATE,
  paid_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  payment_method TEXT,
  finance_notes TEXT,
  status_changed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);
CREATE INDEX IF NOT EXISTS idx_provider_payments_status ON public.provider_payments(status, due_date);
CREATE INDEX IF NOT EXISTS idx_provider_payments_provider ON public.provider_payments(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_payments_work ON public.provider_payments(work_id);

CREATE OR REPLACE FUNCTION public.provider_payment_before_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  -- sessão de um usuário da API; rotinas internas do banco (migrações, scripts) ficam livres
  v_user boolean := current_user = 'obras_authenticated';
  v_admin boolean := public.is_admin();
  v_fin boolean := public.is_financeiro();
  v_to text := NEW.status;
  v_fnotes text := NEW.finance_notes;
  v_method text := NEW.payment_method;
  v_paid date := NEW.paid_at;
BEGIN
  NEW.provider_name := btrim(NEW.provider_name);
  NEW.pix_key := btrim(NEW.pix_key);
  NEW.service_type := btrim(NEW.service_type);
  NEW.invoice_number := btrim(NEW.invoice_number);
  NEW.notes := NULLIF(btrim(COALESCE(NEW.notes, '')), '');

  IF TG_OP = 'INSERT' THEN
    IF v_user THEN
      NEW.status := 'requested'; NEW.requested_by := auth.uid();
      NEW.paid_at := NULL; NEW.paid_by := NULL; NEW.payment_method := NULL; NEW.finance_notes := NULL;
    END IF;
    NEW.status_changed_at := now();
  ELSIF v_user THEN
    NEW.requested_by := OLD.requested_by; NEW.created_at := OLD.created_at;
    IF OLD.status = 'cancelled' THEN
      RAISE EXCEPTION 'Esta solicitação foi cancelada e não pode mais ser alterada.';
    END IF;
    IF OLD.status = 'paid' THEN
      -- pago é final: só o financeiro ainda pode anotar
      IF NOT v_fin THEN RAISE EXCEPTION 'Este pagamento já foi feito e não pode mais ser alterado.'; END IF;
      NEW.provider_id := OLD.provider_id; NEW.provider_name := OLD.provider_name; NEW.pix_key := OLD.pix_key;
      NEW.service_type := OLD.service_type; NEW.invoice_number := OLD.invoice_number; NEW.work_id := OLD.work_id;
      NEW.work_name := OLD.work_name; NEW.payment_amount := OLD.payment_amount; NEW.due_date := OLD.due_date;
      NEW.notes := OLD.notes; NEW.status := OLD.status; NEW.status_changed_at := OLD.status_changed_at;
      NEW.paid_at := OLD.paid_at; NEW.paid_by := OLD.paid_by; NEW.payment_method := OLD.payment_method;
      RETURN NEW;
    END IF;

    -- aberta (requested): quem pode o quê
    IF NOT v_admin THEN
      -- o financeiro não altera os dados da solicitação
      NEW.provider_id := OLD.provider_id; NEW.provider_name := OLD.provider_name; NEW.pix_key := OLD.pix_key;
      NEW.service_type := OLD.service_type; NEW.invoice_number := OLD.invoice_number; NEW.work_id := OLD.work_id;
      NEW.work_name := OLD.work_name; NEW.payment_amount := OLD.payment_amount; NEW.due_date := OLD.due_date;
      NEW.notes := OLD.notes;
    END IF;
    -- o que é do pagamento só muda no pagamento
    NEW.status := OLD.status; NEW.paid_at := OLD.paid_at; NEW.paid_by := OLD.paid_by;
    NEW.payment_method := OLD.payment_method; NEW.finance_notes := OLD.finance_notes;
    NEW.status_changed_at := OLD.status_changed_at;

    IF v_to = 'cancelled' THEN
      IF NOT v_admin THEN RAISE EXCEPTION 'Só o administrador cancela a solicitação de pagamento.'; END IF;
      NEW.status := 'cancelled'; NEW.status_changed_at := now();
      RETURN NEW;
    ELSIF v_to = 'paid' THEN
      IF NOT v_fin THEN RAISE EXCEPTION 'Só o financeiro (contas a pagar) paga a solicitação.'; END IF;
      v_paid := COALESCE(v_paid, public.today_br());
      IF v_paid > public.today_br() THEN RAISE EXCEPTION 'A data do pagamento não pode estar no futuro.'; END IF;
      NEW.status := 'paid'; NEW.paid_at := v_paid; NEW.paid_by := auth.uid();
      NEW.payment_method := COALESCE(NULLIF(btrim(COALESCE(v_method, '')), ''), 'PIX');
      NEW.finance_notes := NULLIF(btrim(COALESCE(v_fnotes, '')), '');
      NEW.status_changed_at := now();
    ELSIF v_to <> 'requested' THEN
      RAISE EXCEPTION 'Mudança de situação não permitida (% para %).', OLD.status, v_to;
    ELSIF v_fin THEN
      NEW.finance_notes := NULLIF(btrim(COALESCE(v_fnotes, '')), '')  ;
    END IF;
  END IF;

  -- a casa fica guardada pelo nome (a obra pode ser excluída depois)
  IF NEW.work_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.work_id IS DISTINCT FROM OLD.work_id OR COALESCE(NEW.work_name, '') = '') THEN
    SELECT btrim(name) INTO NEW.work_name FROM public.works WHERE id = NEW.work_id;
  END IF;
  IF NEW.provider_id IS NOT NULL AND NEW.provider_name = '' THEN
    SELECT btrim(name) INTO NEW.provider_name FROM public.service_providers WHERE id = NEW.provider_id;
  END IF;

  -- dados obrigatórios da solicitação aberta (rotinas internas ficam livres)
  IF v_user AND NEW.status = 'requested' THEN
    IF NEW.provider_name = '' THEN RAISE EXCEPTION 'Informe o nome do prestador.'; END IF;
    IF NEW.pix_key = '' THEN RAISE EXCEPTION 'Informe o PIX.'; END IF;
    IF NEW.service_type = '' THEN RAISE EXCEPTION 'Informe a tratativa (o tipo de serviço prestado).'; END IF;
    IF NEW.invoice_number = '' THEN RAISE EXCEPTION 'Informe a NF (se não houver, escreva "sem NF").'; END IF;
    IF NEW.work_id IS NULL THEN RAISE EXCEPTION 'Informe a casa em que o serviço foi prestado.'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_provider_payment_before_write ON public.provider_payments;
CREATE TRIGGER trg_provider_payment_before_write
  BEFORE INSERT OR UPDATE ON public.provider_payments
  FOR EACH ROW EXECUTE FUNCTION public.provider_payment_before_write();

-- pagamento feito não se exclui
CREATE OR REPLACE FUNCTION public.provider_payment_before_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user = 'obras_authenticated' AND OLD.status = 'paid' THEN
    RAISE EXCEPTION 'Um pagamento já feito não pode ser excluído.';
  END IF;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS trg_provider_payment_before_delete ON public.provider_payments;
CREATE TRIGGER trg_provider_payment_before_delete
  BEFORE DELETE ON public.provider_payments
  FOR EACH ROW EXECUTE FUNCTION public.provider_payment_before_delete();

-- ---------------------------------------------------------------- acesso
ALTER TABLE public.provider_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "provider_payments_read" ON public.provider_payments;
DROP POLICY IF EXISTS "provider_payments_insert" ON public.provider_payments;
DROP POLICY IF EXISTS "provider_payments_update" ON public.provider_payments;
DROP POLICY IF EXISTS "provider_payments_delete" ON public.provider_payments;
-- valores: só Admin e Financeiro leem
CREATE POLICY "provider_payments_read" ON public.provider_payments
  FOR SELECT TO obras_authenticated USING (public.is_admin() OR public.is_financeiro());
-- só o admin abre a solicitação
CREATE POLICY "provider_payments_insert" ON public.provider_payments
  FOR INSERT TO obras_authenticated WITH CHECK (public.is_admin() AND requested_by = auth.uid());
-- admin (edita e cancela) e financeiro (paga); o gatilho decide o que cada um altera
CREATE POLICY "provider_payments_update" ON public.provider_payments
  FOR UPDATE TO obras_authenticated
  USING (public.is_admin() OR public.is_financeiro())
  WITH CHECK (public.is_admin() OR public.is_financeiro());
CREATE POLICY "provider_payments_delete" ON public.provider_payments
  FOR DELETE TO obras_authenticated USING (public.is_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_payments TO obras_authenticated;
