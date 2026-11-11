-- Compras: SÓ o Financeiro atende a solicitação (situação, fornecedor, valores, nota fiscal). O Admin acompanha
-- (vê todas e os valores) e exclui, mas não atende. Quem solicitou vê o pedido como "pendente pelo financeiro" até
-- ele ser atendido (o texto fica na tela). Rotinas internas do banco (sem usuário logado) continuam livres.
-- Substitui o gatilho e a política de UPDATE da migração 22. Idempotente.

CREATE OR REPLACE FUNCTION public.purchase_request_before_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  -- só o Financeiro atende; rotinas internas do banco (sem usuário logado: migrações, scripts) também
  v_finance boolean := public.is_financeiro() OR auth.uid() IS NULL;
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
    -- o solicitante só mexe na própria solicitação enquanto ela ainda está pendente pelo financeiro
    IF OLD.status <> 'requested' THEN
      RAISE EXCEPTION 'Esta solicitação já está com o financeiro e não pode mais ser alterada.';
    END IF;
    IF NEW.status NOT IN ('requested', 'cancelled') THEN
      RAISE EXCEPTION 'Somente o financeiro atende a solicitação. Você só pode mantê-la ou cancelá-la.';
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

-- UPDATE: o Financeiro (atende) e o solicitante (a própria, pelas regras do gatilho); o Admin não atende
DROP POLICY IF EXISTS "purchase_requests_update" ON public.purchase_requests;
CREATE POLICY "purchase_requests_update" ON public.purchase_requests
  FOR UPDATE TO obras_authenticated
  USING (public.is_financeiro() OR requested_by = auth.uid())
  WITH CHECK (public.is_financeiro() OR requested_by = auth.uid());
