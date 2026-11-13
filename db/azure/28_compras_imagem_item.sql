-- Compras: imagem do item no pedido e imagem em cada cotação.
--  * bucket PRIVADO "purchase-images" (PDF não; só imagem: jpeg, png, webp, heic, até 10 MB), com duas pastas por solicitação:
--      "<id da solicitação>/item/<arquivo>"                  imagem do item pedido
--      "<id da solicitação>/quotes/<id da cotação>/<arquivo>" imagem da cotação
--  * imagem do item: quem vê a solicitação vê a imagem (a regra de leitura consulta purchase_requests, que já filtra por quem
--    pode ver); só o solicitante envia, troca e remove, enquanto o pedido está pendente pelo financeiro.
--  * imagem da cotação: só Admin e Financeiro leem (cotação é valor); só o Financeiro envia, troca e remove, enquanto a
--    solicitação está em cotação.
--  * colunas: purchase_requests.item_image_path/name e purchase_quotes.image_path/name. O gatilho confere que o caminho é da
--    própria solicitação (e da própria cotação).
--  * excluir a solicitação (ou uma cotação) apaga as imagens.
-- Substitui o gatilho da migração 25 (mesma máquina de estados, com a imagem do item). Idempotente.

-- ---------------------------------------------------------------- bucket privado
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('purchase-images', 'purchase-images', false, 10485760,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "purchase_images_read" ON storage.objects;
DROP POLICY IF EXISTS "purchase_images_insert" ON storage.objects;
DROP POLICY IF EXISTS "purchase_images_update" ON storage.objects;
DROP POLICY IF EXISTS "purchase_images_delete" ON storage.objects;
-- a subconsulta em purchase_requests roda com as regras de quem lê: só enxerga a solicitação quem pode vê-la
CREATE POLICY "purchase_images_read" ON storage.objects
  FOR SELECT TO obras_authenticated
  USING (
    bucket_id = 'purchase-images' AND (
      (name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/item/[^/]+$' AND EXISTS (SELECT 1 FROM public.purchase_requests r WHERE r.id::text = split_part(name, '/', 1)))
      OR (name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/quotes/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$' AND (public.is_admin() OR public.is_financeiro()))
    )
  );
CREATE POLICY "purchase_images_insert" ON storage.objects
  FOR INSERT TO obras_authenticated
  WITH CHECK (
    bucket_id = 'purchase-images' AND (metadata->>'mimetype') IN ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif') AND COALESCE((metadata->>'size')::bigint, 0) <= 10485760
    AND ((name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/item/[^/]+$' AND EXISTS (SELECT 1 FROM public.purchase_requests r WHERE r.id::text = split_part(name, '/', 1) AND r.requested_by = auth.uid() AND r.status = 'requested')) OR (name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/quotes/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$' AND public.is_financeiro() AND EXISTS (SELECT 1 FROM public.purchase_requests r WHERE r.id::text = split_part(name, '/', 1) AND r.status IN ('requested', 'quoting'))))
  );
CREATE POLICY "purchase_images_update" ON storage.objects
  FOR UPDATE TO obras_authenticated
  USING (bucket_id = 'purchase-images' AND ((name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/item/[^/]+$' AND EXISTS (SELECT 1 FROM public.purchase_requests r WHERE r.id::text = split_part(name, '/', 1) AND r.requested_by = auth.uid() AND r.status = 'requested')) OR (name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/quotes/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$' AND public.is_financeiro() AND EXISTS (SELECT 1 FROM public.purchase_requests r WHERE r.id::text = split_part(name, '/', 1) AND r.status IN ('requested', 'quoting')))))
  WITH CHECK (
    bucket_id = 'purchase-images' AND (metadata->>'mimetype') IN ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif') AND COALESCE((metadata->>'size')::bigint, 0) <= 10485760
    AND ((name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/item/[^/]+$' AND EXISTS (SELECT 1 FROM public.purchase_requests r WHERE r.id::text = split_part(name, '/', 1) AND r.requested_by = auth.uid() AND r.status = 'requested')) OR (name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/quotes/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$' AND public.is_financeiro() AND EXISTS (SELECT 1 FROM public.purchase_requests r WHERE r.id::text = split_part(name, '/', 1) AND r.status IN ('requested', 'quoting'))))
  );
CREATE POLICY "purchase_images_delete" ON storage.objects
  FOR DELETE TO obras_authenticated
  USING (bucket_id = 'purchase-images' AND ((name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/item/[^/]+$' AND EXISTS (SELECT 1 FROM public.purchase_requests r WHERE r.id::text = split_part(name, '/', 1) AND r.requested_by = auth.uid() AND r.status = 'requested')) OR (name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/quotes/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$' AND public.is_financeiro() AND EXISTS (SELECT 1 FROM public.purchase_requests r WHERE r.id::text = split_part(name, '/', 1) AND r.status IN ('requested', 'quoting')))));

-- ---------------------------------------------------------------- colunas
ALTER TABLE public.purchase_requests
  ADD COLUMN IF NOT EXISTS item_image_path TEXT,
  ADD COLUMN IF NOT EXISTS item_image_name TEXT;
ALTER TABLE public.purchase_quotes
  ADD COLUMN IF NOT EXISTS image_path TEXT,
  ADD COLUMN IF NOT EXISTS image_name TEXT;

-- ---------------------------------------------------------------- gatilho da solicitação (migração 25 + imagem do item)
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
      NEW.item_image_path := NULL; NEW.item_image_name := NULL;
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
  v_ipath := NEW.item_image_path; v_iname := NEW.item_image_name;

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

  -- quem só solicitou não mexe depois que a solicitação sai de "pendente pelo financeiro"
  IF NOT v_fin AND NOT v_admin AND OLD.status <> 'requested' THEN
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

-- ---------------------------------------------------------------- gatilho das cotações (migração 24 + imagem da cotação)
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
  -- a imagem da cotação fica na pasta da própria cotação
  IF NEW.image_path IS NOT NULL AND NEW.image_path NOT LIKE NEW.request_id::text || '/quotes/' || NEW.id::text || '/%' THEN
    RAISE EXCEPTION 'A imagem da cotação precisa ficar na pasta desta cotação.';
  END IF;
  IF NEW.image_path IS NULL THEN NEW.image_name := NULL; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_purchase_quote_before_write ON public.purchase_quotes;
CREATE TRIGGER trg_purchase_quote_before_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_quotes
  FOR EACH ROW EXECUTE FUNCTION public.purchase_quote_before_write();

-- ---------------------------------------------------------------- limpeza das imagens
-- excluir a solicitação apaga as notas e as imagens (a pasta de cada uma tem o id dela)
CREATE OR REPLACE FUNCTION public.purchase_request_after_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
BEGIN
  DELETE FROM storage.objects
   WHERE bucket_id IN ('purchase-invoices', 'purchase-images') AND name LIKE OLD.id::text || '/%';
  RETURN OLD;
END;
$$;

-- excluir uma cotação apaga a imagem dela
CREATE OR REPLACE FUNCTION public.purchase_quote_after_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
BEGIN
  DELETE FROM storage.objects
   WHERE bucket_id = 'purchase-images' AND name LIKE OLD.request_id::text || '/quotes/' || OLD.id::text || '/%';
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS trg_purchase_quote_after_delete ON public.purchase_quotes;
CREATE TRIGGER trg_purchase_quote_after_delete
  AFTER DELETE ON public.purchase_quotes
  FOR EACH ROW EXECUTE FUNCTION public.purchase_quote_after_delete();
