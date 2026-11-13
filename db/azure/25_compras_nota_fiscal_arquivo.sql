-- Compras: foto ou PDF da nota fiscal.
--  * bucket PRIVADO "purchase-invoices" (nota fiscal é documento financeiro: nada de link público). Lê quem vê os valores
--    (Admin e Financeiro); só o Financeiro envia, troca e remove. Aceita PDF e imagem (jpeg, png, webp, heic) até 15 MB.
--  * purchase_requests ganha invoice_file_path / invoice_file_name / invoice_file_type, preenchidos só pelo Financeiro,
--    e o arquivo precisa estar na pasta da própria solicitação ("<id da solicitação>/arquivo").
--  * excluir a solicitação apaga os arquivos dela.
-- Substitui o gatilho da migração 24 (mesma máquina de estados, com os campos novos). Idempotente.

-- ---------------------------------------------------------------- bucket privado
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('purchase-invoices', 'purchase-invoices', false, 15728640,
        ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- o tipo e o tamanho vêm nos metadados gravados pela API de storage
DROP POLICY IF EXISTS "purchase_invoices_read" ON storage.objects;
DROP POLICY IF EXISTS "purchase_invoices_insert" ON storage.objects;
DROP POLICY IF EXISTS "purchase_invoices_update" ON storage.objects;
DROP POLICY IF EXISTS "purchase_invoices_delete" ON storage.objects;
CREATE POLICY "purchase_invoices_read" ON storage.objects
  FOR SELECT TO obras_authenticated
  USING (bucket_id = 'purchase-invoices' AND (public.is_admin() OR public.is_financeiro()));
CREATE POLICY "purchase_invoices_insert" ON storage.objects
  FOR INSERT TO obras_authenticated
  WITH CHECK (
    bucket_id = 'purchase-invoices' AND public.is_financeiro()
    AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$'
    AND (metadata->>'mimetype') IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif')
    AND COALESCE((metadata->>'size')::bigint, 0) <= 15728640
  );
CREATE POLICY "purchase_invoices_update" ON storage.objects
  FOR UPDATE TO obras_authenticated
  USING (bucket_id = 'purchase-invoices' AND public.is_financeiro())
  WITH CHECK (
    bucket_id = 'purchase-invoices' AND public.is_financeiro()
    AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$'
    AND (metadata->>'mimetype') IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif')
    AND COALESCE((metadata->>'size')::bigint, 0) <= 15728640
  );
CREATE POLICY "purchase_invoices_delete" ON storage.objects
  FOR DELETE TO obras_authenticated
  USING (bucket_id = 'purchase-invoices' AND public.is_financeiro());

-- ---------------------------------------------------------------- colunas
ALTER TABLE public.purchase_requests
  ADD COLUMN IF NOT EXISTS invoice_file_path TEXT,
  ADD COLUMN IF NOT EXISTS invoice_file_name TEXT,
  ADD COLUMN IF NOT EXISTS invoice_file_type TEXT;

-- ---------------------------------------------------------------- gatilho (mesma máquina de estados da 24 + arquivo da nota)
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

  -- quem só solicitou não mexe depois que a solicitação sai de "pendente pelo financeiro"
  IF NOT v_fin AND NOT v_admin AND OLD.status <> 'requested' THEN
    RAISE EXCEPTION 'Esta solicitação já está com o financeiro e não pode mais ser alterada.';
  END IF;

  -- os dados do pedido só mudam pelo solicitante, enquanto está pendente pelo financeiro
  IF NOT (v_is_req AND OLD.status = 'requested') THEN
    NEW.work_id := OLD.work_id; NEW.item := OLD.item; NEW.quantity := OLD.quantity; NEW.unit := OLD.unit;
    NEW.notes := OLD.notes; NEW.urgency := OLD.urgency; NEW.needed_by := OLD.needed_by;
  END IF;

  -- observações, nota fiscal (número e arquivo): o financeiro
  IF v_fin THEN
    NEW.finance_notes := v_fnotes; NEW.invoice_number := v_inv; NEW.receipt_notes := v_rnotes;
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

-- excluir a solicitação apaga os arquivos da nota (a pasta tem o id dela)
CREATE OR REPLACE FUNCTION public.purchase_request_after_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
BEGIN
  DELETE FROM storage.objects WHERE bucket_id = 'purchase-invoices' AND name LIKE OLD.id::text || '/%';
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS trg_purchase_request_after_delete ON public.purchase_requests;
CREATE TRIGGER trg_purchase_request_after_delete
  AFTER DELETE ON public.purchase_requests
  FOR EACH ROW EXECUTE FUNCTION public.purchase_request_after_delete();
