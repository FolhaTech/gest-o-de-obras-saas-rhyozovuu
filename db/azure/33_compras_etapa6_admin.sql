-- Compras: a etapa 6 (Recebimento / encerramento) é do ADMIN que abriu a solicitação, não do financeiro.
--  * Recebe e confere a entrega o admin que abriu a solicitação. Se quem abriu não é admin (ou a solicitação ficou sem
--    solicitante), qualquer admin recebe, e também quem pediu (exceto o financeiro). O financeiro não recebe mais.
--  * O pagamento depois da entrega (financeiro libera o pagamento e a compra se encerra) continua do financeiro: não é a etapa 6.
-- Substitui o gatilho da migração 30 (mesma máquina de estados). Idempotente.

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
  v_fpath text;
  v_fname text;
  v_ftype text;
  v_ipath text;
  v_iname text;
  v_deliv date;
  v_receiver boolean;
  v_n integer;
  q record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF v_uid IS NOT NULL THEN
      -- quem solicita não preenche nada do financeiro nem da decisão
      NEW.status := 'requested'; NEW.quote_round := 1;
      NEW.supplier := NULL; NEW.quoted_value := NULL; NEW.final_value := NULL;
      NEW.invoice_number := NULL; NEW.purchased_at := NULL; NEW.finance_notes := NULL; NEW.handled_by := NULL;
      NEW.invoice_file_path := NULL; NEW.invoice_file_name := NULL; NEW.invoice_file_type := NULL;
      NEW.item_image_path := NULL; NEW.item_image_name := NULL; NEW.delivery_date := NULL;
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
  v_fpath := NEW.invoice_file_path; v_fname := NEW.invoice_file_name; v_ftype := NEW.invoice_file_type;
  v_ipath := NEW.item_image_path; v_iname := NEW.item_image_name; v_deliv := NEW.delivery_date;

  NEW.requested_by := OLD.requested_by; NEW.created_at := OLD.created_at;
  NEW.status := OLD.status; NEW.quote_round := OLD.quote_round; NEW.status_changed_at := OLD.status_changed_at;
  NEW.supplier := OLD.supplier; NEW.quoted_value := OLD.quoted_value; NEW.final_value := OLD.final_value;
  NEW.purchased_at := OLD.purchased_at; NEW.handled_by := OLD.handled_by;
  NEW.approved_quote_id := OLD.approved_quote_id; NEW.approver_id := OLD.approver_id; NEW.decided_at := OLD.decided_at;
  NEW.admin_notes := OLD.admin_notes; NEW.payment_mode := OLD.payment_mode;
  NEW.payment_released_at := OLD.payment_released_at; NEW.payment_released_by := OLD.payment_released_by;
  NEW.received_at := OLD.received_at; NEW.received_by := OLD.received_by; NEW.closed_at := OLD.closed_at;
  NEW.finance_notes := OLD.finance_notes; NEW.invoice_number := OLD.invoice_number; NEW.receipt_notes := OLD.receipt_notes;
  NEW.invoice_file_path := OLD.invoice_file_path; NEW.invoice_file_name := OLD.invoice_file_name;
  NEW.invoice_file_type := OLD.invoice_file_type;
  NEW.item_image_path := OLD.item_image_path; NEW.item_image_name := OLD.item_image_name;
  NEW.delivery_date := OLD.delivery_date;

  -- quem recebe e confere a entrega (etapa 6): o ADMIN que abriu a solicitação; se quem abriu não é admin (ou não existe
  -- mais), qualquer admin e também quem pediu (menos o financeiro, que não tem a etapa 6)
  v_receiver := OLD.status = 'awaiting_delivery' AND (
    (v_admin AND (v_is_req OR NOT v_req_admin))
    OR (v_is_req AND NOT v_fin AND NOT v_admin)
  );

  -- quem só solicitou não mexe depois que a solicitação sai de "pendente pelo financeiro" (exceto para receber a entrega)
  IF NOT v_fin AND NOT v_admin AND OLD.status <> 'requested' AND NOT v_receiver THEN
    RAISE EXCEPTION 'Esta solicitação já está com o financeiro e não pode mais ser alterada.';
  END IF;

  -- os dados do pedido só mudam pelo solicitante, enquanto está pendente pelo financeiro
  IF NOT (v_is_req AND OLD.status = 'requested') THEN
    NEW.work_id := OLD.work_id; NEW.item := OLD.item; NEW.quantity := OLD.quantity; NEW.unit := OLD.unit;
    NEW.notes := OLD.notes; NEW.urgency := OLD.urgency; NEW.needed_by := OLD.needed_by;
  END IF;

  -- a imagem do item: o solicitante, enquanto está pendente pelo financeiro, e só na pasta do item desta solicitação
  IF v_is_req AND OLD.status = 'requested' THEN
    IF v_ipath IS NOT NULL AND v_ipath NOT LIKE OLD.id::text || '/item/%' THEN
      RAISE EXCEPTION 'A imagem do item precisa ficar na pasta desta solicitação.';
    END IF;
    NEW.item_image_path := v_ipath;
    NEW.item_image_name := CASE WHEN v_ipath IS NULL THEN NULL ELSE v_iname END;
  END IF;

  -- observações do recebimento (a conferência): quem recebe
  IF v_receiver THEN
    NEW.receipt_notes := v_rnotes;
  END IF;

  -- observações, nota fiscal (número e arquivo) e data de entrega: o financeiro
  IF v_fin THEN
    NEW.finance_notes := v_fnotes; NEW.invoice_number := v_inv;
    -- a data de entrega muda enquanto a compra não chegou; depois de informada não pode ser apagada
    IF OLD.status IN ('approved', 'awaiting_payment', 'awaiting_delivery') THEN
      IF v_deliv IS NULL AND OLD.delivery_date IS NOT NULL THEN
        RAISE EXCEPTION 'A data de entrega não pode ficar em branco depois de informada.';
      END IF;
      IF v_deliv IS NOT NULL AND OLD.purchased_at IS NOT NULL AND v_deliv < OLD.purchased_at THEN
        RAISE EXCEPTION 'A data de entrega não pode ser anterior à data da compra.';
      END IF;
      NEW.delivery_date := v_deliv;
    END IF;
    IF v_fpath IS NOT NULL AND v_fpath NOT LIKE OLD.id::text || '/%' THEN
      RAISE EXCEPTION 'O arquivo da nota fiscal precisa ficar na pasta desta solicitação.';
    END IF;
    NEW.invoice_file_path := v_fpath;
    NEW.invoice_file_name := CASE WHEN v_fpath IS NULL THEN NULL ELSE v_fname END;
    NEW.invoice_file_type := CASE WHEN v_fpath IS NULL THEN NULL ELSE v_ftype END;
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
    IF NEW.delivery_date IS NULL THEN
      RAISE EXCEPTION 'Informe a data de entrega da compra.';
    END IF;
    IF NEW.delivery_date < NEW.purchased_at THEN
      RAISE EXCEPTION 'A data de entrega não pode ser anterior à data da compra.';
    END IF;

  ELSIF OLD.status = 'awaiting_payment' AND v_to = 'awaiting_delivery' THEN
    IF NOT v_fin THEN RAISE EXCEPTION 'Somente o financeiro libera o pagamento.'; END IF;
    NEW.status := 'awaiting_delivery'; NEW.payment_released_at := now(); NEW.payment_released_by := v_uid;
    NEW.handled_by := v_uid;

  ELSIF OLD.status = 'awaiting_delivery' AND v_to IN ('awaiting_release', 'closed') THEN
    IF NOT v_receiver THEN RAISE EXCEPTION 'Somente o administrador que abriu a solicitação recebe e confere a entrega.'; END IF;
    IF (OLD.payment_mode = 'after_delivery') <> (v_to = 'awaiting_release') THEN
      RAISE EXCEPTION 'Após a entrega: recebe, confere e o financeiro libera o pagamento. Antecipado: o recebimento encerra.';
    END IF;
    NEW.status := v_to; NEW.received_at := now(); NEW.received_by := v_uid;
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
