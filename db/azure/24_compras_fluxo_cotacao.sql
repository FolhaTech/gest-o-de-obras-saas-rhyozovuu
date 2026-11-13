-- Compras: fluxo de cotação, aprovação do admin, compra, pagamento e recebimento.
--
--   1 Solicitação (qualquer usuário)             requested
--   2 Cotações (financeiro, 3 ou mais fornecedores)  quoting -> quotes_sent (enviadas ao admin que abriu)
--   3 Aprovação do admin                          approved  (ou volta para o financeiro refazer: quoting, rodada + 1)
--   4 Compra (financeiro)                         escolhe pagamento ANTECIPADO ou APÓS A ENTREGA
--   5 Pagamento / entrega
--       antecipado:     awaiting_payment (financeiro libera) -> awaiting_delivery -> recebe e confere -> closed
--       após a entrega: awaiting_delivery -> recebe e confere -> awaiting_release (financeiro libera) -> closed
--   6 Recebimento / encerramento (financeiro)     closed
--   cancelled: o solicitante (enquanto "requested") ou qualquer admin (antes da compra)
--
-- O gatilho de purchase_requests é a máquina de estados: valida quem pode cada passo, carimba datas e responsáveis
-- e protege os campos de cada etapa. Rotinas internas do banco (sem usuário logado: migrações, scripts) ficam livres.
-- As cotações ficam em purchase_quotes (histórico de todas as rodadas). Idempotente. Substitui o gatilho e a política
-- de UPDATE/DELETE das migrações 22 e 23.

-- ---------------------------------------------------------------- cotações
CREATE TABLE IF NOT EXISTS public.purchase_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.purchase_requests(id) ON DELETE CASCADE,
  round INTEGER NOT NULL DEFAULT 1,                                     -- rodada de cotação (sobe quando o admin recusa)
  supplier TEXT NOT NULL,
  quoted_value NUMERIC(14,2) NOT NULL CHECK (quoted_value >= 0),
  delivery_days INTEGER CHECK (delivery_days IS NULL OR delivery_days >= 0),
  payment_mode TEXT NOT NULL DEFAULT 'after_delivery' CHECK (payment_mode IN ('advance', 'after_delivery')),
  payment_terms TEXT,                                                   -- ex.: "30 dias", "PIX à vista"
  notes TEXT,
  created_by UUID DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);
CREATE INDEX IF NOT EXISTS idx_purchase_quotes_request ON public.purchase_quotes(request_id, round);
-- um fornecedor por rodada (sem diferenciar maiúsculas nem espaços nas pontas)
CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_quotes_supplier
  ON public.purchase_quotes (request_id, round, lower(btrim(supplier)));

-- ---------------------------------------------------------------- colunas novas da solicitação
ALTER TABLE public.purchase_requests
  ADD COLUMN IF NOT EXISTS quote_round INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS approved_quote_id UUID REFERENCES public.purchase_quotes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approver_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admin_notes TEXT,
  ADD COLUMN IF NOT EXISTS payment_mode TEXT,
  ADD COLUMN IF NOT EXISTS payment_released_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_released_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS received_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS receipt_notes TEXT,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

ALTER TABLE public.purchase_requests DROP CONSTRAINT IF EXISTS purchase_requests_payment_mode_check;
ALTER TABLE public.purchase_requests
  ADD CONSTRAINT purchase_requests_payment_mode_check
  CHECK (payment_mode IS NULL OR payment_mode IN ('advance', 'after_delivery'));
ALTER TABLE public.purchase_requests DROP CONSTRAINT IF EXISTS purchase_requests_status_check;

-- ---------------------------------------------------------------- máquina de estados da solicitação
CREATE OR REPLACE FUNCTION public.purchase_request_before_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_fin boolean := public.is_financeiro();
  v_admin boolean := public.is_admin();
  v_is_req boolean;
  v_req_admin boolean;
  v_approver boolean;
  v_to text;
  v_pick uuid;
  v_anotes text;
  v_fnotes text;
  v_inv text;
  v_rnotes text;
  v_purch date;
  v_mode text;
  v_n integer;
  q record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF v_uid IS NOT NULL THEN
      -- quem solicita não preenche nada do financeiro nem da decisão
      NEW.status := 'requested'; NEW.quote_round := 1;
      NEW.supplier := NULL; NEW.quoted_value := NULL; NEW.final_value := NULL;
      NEW.invoice_number := NULL; NEW.purchased_at := NULL; NEW.finance_notes := NULL; NEW.handled_by := NULL;
      NEW.approved_quote_id := NULL; NEW.approver_id := NULL; NEW.decided_at := NULL; NEW.admin_notes := NULL;
      NEW.payment_mode := NULL; NEW.payment_released_at := NULL; NEW.payment_released_by := NULL;
      NEW.received_at := NULL; NEW.received_by := NULL; NEW.receipt_notes := NULL; NEW.closed_at := NULL;
    END IF;
    NEW.status_changed_at := now();
    RETURN NEW;
  END IF;

  -- rotinas internas do banco: livres
  IF v_uid IS NULL THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN NEW.status_changed_at := now(); END IF;
    RETURN NEW;
  END IF;

  v_is_req := OLD.requested_by IS NOT DISTINCT FROM v_uid;
  SELECT COALESCE(lower(btrim(role)) = 'admin', false) INTO v_req_admin FROM public.profiles WHERE id = OLD.requested_by;
  v_req_admin := COALESCE(v_req_admin, false);
  -- aprova quem abriu a solicitação (se o admin abriu); se abriu outro usuário, qualquer admin
  v_approver := v_admin AND (v_is_req OR NOT v_req_admin);

  -- o que o usuário pediu; o resto é controlado pelo gatilho
  v_to := NEW.status; v_pick := NEW.approved_quote_id; v_anotes := NEW.admin_notes;
  v_fnotes := NEW.finance_notes; v_inv := NEW.invoice_number; v_rnotes := NEW.receipt_notes;
  v_purch := NEW.purchased_at; v_mode := NEW.payment_mode;

  NEW.requested_by := OLD.requested_by; NEW.created_at := OLD.created_at;
  NEW.status := OLD.status; NEW.quote_round := OLD.quote_round; NEW.status_changed_at := OLD.status_changed_at;
  NEW.supplier := OLD.supplier; NEW.quoted_value := OLD.quoted_value; NEW.final_value := OLD.final_value;
  NEW.purchased_at := OLD.purchased_at; NEW.handled_by := OLD.handled_by;
  NEW.approved_quote_id := OLD.approved_quote_id; NEW.approver_id := OLD.approver_id; NEW.decided_at := OLD.decided_at;
  NEW.admin_notes := OLD.admin_notes; NEW.payment_mode := OLD.payment_mode;
  NEW.payment_released_at := OLD.payment_released_at; NEW.payment_released_by := OLD.payment_released_by;
  NEW.received_at := OLD.received_at; NEW.received_by := OLD.received_by; NEW.closed_at := OLD.closed_at;
  NEW.finance_notes := OLD.finance_notes; NEW.invoice_number := OLD.invoice_number; NEW.receipt_notes := OLD.receipt_notes;

  -- quem só solicitou não mexe depois que a solicitação sai de "pendente pelo financeiro"
  IF NOT v_fin AND NOT v_admin AND OLD.status <> 'requested' THEN
    RAISE EXCEPTION 'Esta solicitação já está com o financeiro e não pode mais ser alterada.';
  END IF;

  -- os dados do pedido só mudam pelo solicitante, enquanto está pendente pelo financeiro
  IF NOT (v_is_req AND OLD.status = 'requested') THEN
    NEW.work_id := OLD.work_id; NEW.item := OLD.item; NEW.quantity := OLD.quantity; NEW.unit := OLD.unit;
    NEW.notes := OLD.notes; NEW.urgency := OLD.urgency; NEW.needed_by := OLD.needed_by;
  END IF;

  -- observações e nota fiscal: o financeiro
  IF v_fin THEN
    NEW.finance_notes := v_fnotes; NEW.invoice_number := v_inv; NEW.receipt_notes := v_rnotes;
  END IF;

  IF v_to IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- ---------------------------------------------------------------- mudança de situação
  NEW.status_changed_at := now();

  IF v_to = 'cancelled' THEN
    IF NOT ((v_is_req AND OLD.status = 'requested')
            OR (v_admin AND OLD.status IN ('requested', 'quoting', 'quotes_sent', 'approved'))) THEN
      RAISE EXCEPTION 'Você não pode cancelar esta solicitação nesta etapa (o solicitante cancela enquanto está pendente; o administrador, antes da compra).';
    END IF;
    NEW.status := 'cancelled';
    RETURN NEW;
  END IF;

  IF OLD.status = 'requested' AND v_to = 'quoting' THEN
    IF NOT v_fin THEN RAISE EXCEPTION 'Somente o financeiro inicia a cotação.'; END IF;
    NEW.status := 'quoting'; NEW.handled_by := v_uid;

  ELSIF OLD.status = 'quoting' AND v_to = 'quotes_sent' THEN
    IF NOT v_fin THEN RAISE EXCEPTION 'Somente o financeiro envia as cotações para o administrador.'; END IF;
    SELECT count(DISTINCT lower(btrim(supplier))) INTO v_n
      FROM public.purchase_quotes WHERE request_id = OLD.id AND round = OLD.quote_round;
    IF v_n < 3 THEN
      RAISE EXCEPTION 'Para enviar ao administrador são necessárias ao menos 3 cotações de fornecedores diferentes (hoje: %).', v_n;
    END IF;
    NEW.status := 'quotes_sent'; NEW.handled_by := v_uid;

  ELSIF OLD.status = 'quotes_sent' AND v_to = 'approved' THEN
    IF NOT v_approver THEN
      RAISE EXCEPTION 'Somente o administrador que abriu a solicitação aprova as cotações.';
    END IF;
    SELECT * INTO q FROM public.purchase_quotes WHERE id = v_pick AND request_id = OLD.id AND round = OLD.quote_round;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Escolha uma das cotações enviadas nesta rodada para aprovar.';
    END IF;
    NEW.status := 'approved'; NEW.approved_quote_id := q.id; NEW.approver_id := v_uid; NEW.decided_at := now();
    NEW.admin_notes := NULLIF(btrim(COALESCE(v_anotes, '')), '');
    NEW.supplier := q.supplier; NEW.quoted_value := q.quoted_value; NEW.final_value := q.quoted_value;
    NEW.payment_mode := q.payment_mode;

  ELSIF OLD.status = 'quotes_sent' AND v_to = 'quoting' THEN
    IF NOT v_approver THEN
      RAISE EXCEPTION 'Somente o administrador que abriu a solicitação recusa as cotações.';
    END IF;
    IF btrim(COALESCE(v_anotes, '')) = '' THEN
      RAISE EXCEPTION 'Informe o motivo da recusa para o financeiro refazer a cotação.';
    END IF;
    NEW.status := 'quoting'; NEW.quote_round := OLD.quote_round + 1; NEW.approved_quote_id := NULL;
    NEW.approver_id := v_uid; NEW.decided_at := now(); NEW.admin_notes := btrim(v_anotes);

  ELSIF OLD.status = 'approved' AND v_to IN ('awaiting_payment', 'awaiting_delivery') THEN
    IF NOT v_fin THEN RAISE EXCEPTION 'Somente o financeiro faz a compra.'; END IF;
    IF OLD.final_value IS NULL THEN RAISE EXCEPTION 'A compra precisa do valor da cotação aprovada.'; END IF;
    v_mode := COALESCE(v_mode, OLD.payment_mode);
    IF v_mode IS NULL OR v_mode NOT IN ('advance', 'after_delivery') THEN
      RAISE EXCEPTION 'Escolha o pagamento: antecipado (antes da entrega) ou após a entrega.';
    END IF;
    IF (v_mode = 'advance') <> (v_to = 'awaiting_payment') THEN
      RAISE EXCEPTION 'Pagamento antecipado vai para "aguardando pagamento"; após a entrega vai para "aguardando entrega".';
    END IF;
    NEW.status := v_to; NEW.payment_mode := v_mode; NEW.handled_by := v_uid;
    NEW.purchased_at := COALESCE(v_purch, CURRENT_DATE);

  ELSIF OLD.status = 'awaiting_payment' AND v_to = 'awaiting_delivery' THEN
    IF NOT v_fin THEN RAISE EXCEPTION 'Somente o financeiro libera o pagamento.'; END IF;
    NEW.status := 'awaiting_delivery'; NEW.payment_released_at := now(); NEW.payment_released_by := v_uid;
    NEW.handled_by := v_uid;

  ELSIF OLD.status = 'awaiting_delivery' AND v_to IN ('awaiting_release', 'closed') THEN
    IF NOT v_fin THEN RAISE EXCEPTION 'Somente o financeiro recebe e confere a entrega.'; END IF;
    IF (OLD.payment_mode = 'after_delivery') <> (v_to = 'awaiting_release') THEN
      RAISE EXCEPTION 'Após a entrega: recebe, confere e libera o pagamento. Antecipado: o recebimento encerra.';
    END IF;
    NEW.status := v_to; NEW.received_at := now(); NEW.received_by := v_uid; NEW.handled_by := v_uid;
    IF v_to = 'closed' THEN NEW.closed_at := now(); END IF;

  ELSIF OLD.status = 'awaiting_release' AND v_to = 'closed' THEN
    IF NOT v_fin THEN RAISE EXCEPTION 'Somente o financeiro libera o pagamento.'; END IF;
    NEW.status := 'closed'; NEW.payment_released_at := now(); NEW.payment_released_by := v_uid;
    NEW.closed_at := now(); NEW.handled_by := v_uid;

  ELSE
    RAISE EXCEPTION 'Mudança de situação não permitida (% para %).', OLD.status, v_to;
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_purchase_request_before_write ON public.purchase_requests;
CREATE TRIGGER trg_purchase_request_before_write
  BEFORE INSERT OR UPDATE ON public.purchase_requests
  FOR EACH ROW EXECUTE FUNCTION public.purchase_request_before_write();

-- solicitações antigas entram no fluxo novo (a tabela pode estar vazia): comprada -> aguardando entrega,
-- entregue -> encerrada, recusada -> cancelada
UPDATE public.purchase_requests SET status = 'awaiting_delivery' WHERE status = 'purchased';
UPDATE public.purchase_requests SET status = 'closed' WHERE status = 'delivered';
UPDATE public.purchase_requests SET status = 'cancelled' WHERE status = 'rejected';
ALTER TABLE public.purchase_requests
  ADD CONSTRAINT purchase_requests_status_check
  CHECK (status IN ('requested', 'quoting', 'quotes_sent', 'approved', 'awaiting_payment', 'awaiting_delivery',
                    'awaiting_release', 'closed', 'cancelled'));

-- ---------------------------------------------------------------- regras das cotações
CREATE OR REPLACE FUNCTION public.purchase_quote_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT status, quote_round INTO r FROM public.purchase_requests WHERE id = OLD.request_id;
    -- a solicitação está sendo excluída junto: libera
    IF NOT FOUND THEN RETURN OLD; END IF;
    IF auth.uid() IS NOT NULL AND (r.status NOT IN ('requested', 'quoting') OR OLD.round <> r.quote_round) THEN
      RAISE EXCEPTION 'As cotações já foram enviadas ao administrador e não podem mais ser removidas.';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.request_id := OLD.request_id; NEW.round := OLD.round; NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
  END IF;
  SELECT status, quote_round INTO r FROM public.purchase_requests WHERE id = NEW.request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitação não encontrada.'; END IF;
  IF auth.uid() IS NOT NULL THEN
    IF r.status NOT IN ('requested', 'quoting') OR (TG_OP = 'UPDATE' AND OLD.round <> r.quote_round) THEN
      RAISE EXCEPTION 'As cotações só podem ser lançadas enquanto a solicitação está em cotação.';
    END IF;
    IF TG_OP = 'INSERT' THEN NEW.round := r.quote_round; END IF;
  ELSIF TG_OP = 'INSERT' AND NEW.round IS NULL THEN
    NEW.round := r.quote_round;
  END IF;
  NEW.supplier := btrim(NEW.supplier);
  IF NEW.supplier = '' THEN RAISE EXCEPTION 'Informe o fornecedor.'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_purchase_quote_before_write ON public.purchase_quotes;
CREATE TRIGGER trg_purchase_quote_before_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_quotes
  FOR EACH ROW EXECUTE FUNCTION public.purchase_quote_before_write();

-- a primeira cotação lançada coloca a solicitação em cotação
CREATE OR REPLACE FUNCTION public.purchase_quote_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.purchase_requests
     SET status = 'quoting'
   WHERE id = NEW.request_id AND status = 'requested';
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_purchase_quote_after_insert ON public.purchase_quotes;
CREATE TRIGGER trg_purchase_quote_after_insert
  AFTER INSERT ON public.purchase_quotes
  FOR EACH ROW EXECUTE FUNCTION public.purchase_quote_after_insert();

-- ---------------------------------------------------------------- políticas
ALTER TABLE public.purchase_quotes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "purchase_quotes_read" ON public.purchase_quotes;
DROP POLICY IF EXISTS "purchase_quotes_write" ON public.purchase_quotes;
-- valores de cotação: só Admin e Financeiro (o Gestor e quem solicitou não veem)
CREATE POLICY "purchase_quotes_read" ON public.purchase_quotes
  FOR SELECT TO obras_authenticated
  USING (public.is_financeiro() OR public.is_admin());
-- só o financeiro lança, edita e remove cotações
CREATE POLICY "purchase_quotes_write" ON public.purchase_quotes
  FOR ALL TO obras_authenticated
  USING (public.is_financeiro())
  WITH CHECK (public.is_financeiro());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_quotes TO obras_authenticated;

-- UPDATE: financeiro (cotação, compra, pagamento, recebimento), admin (aprova, recusa, cancela) e o solicitante
-- (a própria, enquanto pendente); quem pode cada passo é decidido pelo gatilho
DROP POLICY IF EXISTS "purchase_requests_update" ON public.purchase_requests;
CREATE POLICY "purchase_requests_update" ON public.purchase_requests
  FOR UPDATE TO obras_authenticated
  USING (public.is_financeiro() OR public.is_admin() OR requested_by = auth.uid())
  WITH CHECK (public.is_financeiro() OR public.is_admin() OR requested_by = auth.uid());

-- DELETE: o admin exclui (histórico fica para quem acompanha); o solicitante, só a própria ainda pendente
DROP POLICY IF EXISTS "purchase_requests_delete" ON public.purchase_requests;
CREATE POLICY "purchase_requests_delete" ON public.purchase_requests
  FOR DELETE TO obras_authenticated
  USING (public.is_admin() OR (requested_by = auth.uid() AND status = 'requested'));
