-- Faturamento: papel FINANCEIRO, solicitações de compra (Faturamento > Compras) e pagamentos da equipe
-- (Faturamento > Pagamento (Equipe)).
--  * papel "financeiro": recebe e atende as solicitações de compra e controla os pagamentos da equipe. NÃO é equipe
--    interna (is_staff): não altera obras, materiais etc.
--  * purchase_requests: qualquer usuário solicita o que precisa ser comprado (item, quantidade, obra, urgência, prazo).
--    O solicitante vê as dele e pode editar/cancelar enquanto estiver "solicitada"; Admin, Gestor e Financeiro veem todas;
--    só Admin e Financeiro atendem (situação, fornecedor, valores, nota fiscal). Valores: Admin e Financeiro.
--  * team_payments: pagamentos aos membros da equipe (inclui Prestadores): só Admin e Financeiro.
-- Idempotente.

-- ---------------------------------------------------------------- papel financeiro
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['admin', 'gestor', 'prestador', 'engineer', 'manager', 'financeiro']));

CREATE OR REPLACE FUNCTION public.is_financeiro()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT lower(btrim(role)) IN ('financeiro', 'finance') FROM public.profiles WHERE id = auth.uid()), false)
$$;
GRANT EXECUTE ON FUNCTION public.is_financeiro() TO obras_anon, obras_authenticated;

-- ---------------------------------------------------------------- solicitações de compra
CREATE TABLE IF NOT EXISTS public.purchase_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID REFERENCES public.works(id) ON DELETE SET NULL,          -- obra/casa (nulo = geral)
  item TEXT NOT NULL,                                                   -- o que precisa ser comprado
  quantity NUMERIC(14,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit TEXT,
  notes TEXT,
  urgency TEXT NOT NULL DEFAULT 'normal' CHECK (urgency IN ('low', 'normal', 'high', 'urgent')),
  needed_by DATE,                                                       -- precisa até
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'quoting', 'approved', 'purchased', 'delivered', 'rejected', 'cancelled')),
  requested_by UUID DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- preenchidos pelo financeiro
  supplier TEXT,
  quoted_value NUMERIC(14,2) CHECK (quoted_value IS NULL OR quoted_value >= 0),   -- valor cotado
  final_value NUMERIC(14,2) CHECK (final_value IS NULL OR final_value >= 0),      -- valor da compra
  invoice_number TEXT,
  purchased_at DATE,
  finance_notes TEXT,
  handled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status_changed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_status ON public.purchase_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_requested_by ON public.purchase_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_work ON public.purchase_requests(work_id);

CREATE OR REPLACE FUNCTION public.purchase_request_before_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  -- Admin, Financeiro e rotinas internas do banco (sem usuário logado: migrações, scripts) atendem; a API sempre tem usuário
  v_finance boolean := public.is_admin() OR public.is_financeiro() OR auth.uid() IS NULL;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT v_finance THEN
      -- quem solicita não preenche a parte do financeiro
      NEW.status := 'requested';
      NEW.supplier := NULL; NEW.quoted_value := NULL; NEW.final_value := NULL;
      NEW.invoice_number := NULL; NEW.purchased_at := NULL; NEW.finance_notes := NULL; NEW.handled_by := NULL;
    END IF;
    NEW.status_changed_at := now();
    RETURN NEW;
  END IF;

  NEW.requested_by := OLD.requested_by;
  IF v_finance THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      NEW.status_changed_at := now();
      NEW.handled_by := auth.uid();
      IF NEW.status IN ('purchased', 'delivered') AND NEW.purchased_at IS NULL THEN
        NEW.purchased_at := CURRENT_DATE;
      END IF;
    END IF;
  ELSE
    -- o solicitante só mexe na própria solicitação enquanto ela ainda não foi atendida
    IF OLD.status <> 'requested' THEN
      RAISE EXCEPTION 'Esta solicitação já está com o financeiro e não pode mais ser alterada.';
    END IF;
    IF NEW.status NOT IN ('requested', 'cancelled') THEN
      RAISE EXCEPTION 'Você só pode manter a solicitação ou cancelá-la.';
    END IF;
    NEW.supplier := OLD.supplier; NEW.quoted_value := OLD.quoted_value; NEW.final_value := OLD.final_value;
    NEW.invoice_number := OLD.invoice_number; NEW.purchased_at := OLD.purchased_at;
    NEW.finance_notes := OLD.finance_notes; NEW.handled_by := OLD.handled_by;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      NEW.status_changed_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_purchase_request_before_write ON public.purchase_requests;
CREATE TRIGGER trg_purchase_request_before_write
  BEFORE INSERT OR UPDATE ON public.purchase_requests
  FOR EACH ROW EXECUTE FUNCTION public.purchase_request_before_write();

ALTER TABLE public.purchase_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "purchase_requests_read" ON public.purchase_requests;
DROP POLICY IF EXISTS "purchase_requests_insert" ON public.purchase_requests;
DROP POLICY IF EXISTS "purchase_requests_update" ON public.purchase_requests;
DROP POLICY IF EXISTS "purchase_requests_delete" ON public.purchase_requests;
CREATE POLICY "purchase_requests_read" ON public.purchase_requests
  FOR SELECT TO obras_authenticated
  USING (public.is_staff() OR public.is_financeiro() OR requested_by = auth.uid());
CREATE POLICY "purchase_requests_insert" ON public.purchase_requests
  FOR INSERT TO obras_authenticated WITH CHECK (requested_by = auth.uid());
CREATE POLICY "purchase_requests_update" ON public.purchase_requests
  FOR UPDATE TO obras_authenticated
  USING (public.is_admin() OR public.is_financeiro() OR requested_by = auth.uid())
  WITH CHECK (public.is_admin() OR public.is_financeiro() OR requested_by = auth.uid());
CREATE POLICY "purchase_requests_delete" ON public.purchase_requests
  FOR DELETE TO obras_authenticated
  USING (public.is_admin() OR public.is_financeiro() OR (requested_by = auth.uid() AND status = 'requested'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_requests TO obras_authenticated;

-- ---------------------------------------------------------------- pagamento da equipe
CREATE TABLE IF NOT EXISTS public.team_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID REFERENCES public.team_members(id) ON DELETE SET NULL,   -- membro da equipe (ou prestador)
  member_name TEXT NOT NULL DEFAULT '',                                    -- nome guardado no lançamento
  reference TEXT NOT NULL,                                                 -- ex.: "Semana 10 a 16/11", "Diárias de outubro"
  period_start DATE,
  period_end DATE,
  work_id UUID REFERENCES public.works(id) ON DELETE SET NULL,
  payment_amount NUMERIC(14,2) NOT NULL CHECK (payment_amount >= 0),
  payment_method TEXT,                                                     -- PIX, transferência, dinheiro...
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  paid_at DATE,
  notes TEXT,
  created_by UUID DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()),
  CONSTRAINT team_payments_period_order CHECK (period_start IS NULL OR period_end IS NULL OR period_end >= period_start)
);
CREATE INDEX IF NOT EXISTS idx_team_payments_member ON public.team_payments(member_id);
CREATE INDEX IF NOT EXISTS idx_team_payments_status ON public.team_payments(status, created_at DESC);

CREATE OR REPLACE FUNCTION public.team_payment_before_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.member_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.member_id IS DISTINCT FROM OLD.member_id OR COALESCE(NEW.member_name, '') = '') THEN
    SELECT btrim(name) INTO NEW.member_name FROM public.team_members WHERE id = NEW.member_id;
  END IF;
  -- pago sem data = hoje; voltar para pendente limpa a data
  IF NEW.status = 'paid' AND NEW.paid_at IS NULL THEN
    NEW.paid_at := CURRENT_DATE;
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

ALTER TABLE public.team_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "team_payments_finance_all" ON public.team_payments;
CREATE POLICY "team_payments_finance_all" ON public.team_payments
  FOR ALL TO obras_authenticated
  USING (public.is_admin() OR public.is_financeiro())
  WITH CHECK (public.is_admin() OR public.is_financeiro());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_payments TO obras_authenticated;
