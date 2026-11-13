import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/formatters'
import {
  PAYMENT_MODE_LABEL,
  STATUS_LABEL,
  URGENCY_LABEL,
  currentRound,
  waitingText,
  type PurchaseQuoteRow,
  type PurchaseRequestRow,
} from '@/lib/purchases'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import PurchaseTimeline from './PurchaseTimeline'
import { STATUS_CLASS, fmtDateTime, fmtQty, who } from './helpers'

interface Props {
  request: PurchaseRequestRow | null
  /** Admin e Financeiro veem as cotações (são valores). */
  canSeeQuotes: boolean
  onClose: () => void
}

/** Andamento da solicitação: linha do tempo, dados do pedido e (para Admin e Financeiro) as cotações de cada rodada. */
export default function DetailsDialog({ request, canSeeQuotes, onClose }: Props) {
  const [quotes, setQuotes] = useState<PurchaseQuoteRow[]>([])
  const id = request?.id

  useEffect(() => {
    setQuotes([])
    if (!id || !canSeeQuotes) return
    let alive = true
    supabase
      .from('purchase_quotes' as any)
      .select('*')
      .eq('request_id', id)
      .order('created_at', { ascending: true })
      .then(({ data }) => alive && setQuotes((data ?? []) as unknown as PurchaseQuoteRow[]))
    return () => {
      alive = false
    }
  }, [id, canSeeQuotes])

  if (!request) return null
  const rounds = [...new Set(quotes.map((q) => q.round))].sort((a, b) => b - a)

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {request.item}
            <Badge variant="outline" className={`font-normal ${STATUS_CLASS[request.status]}`}>{STATUS_LABEL[request.status]}</Badge>
          </DialogTitle>
          <DialogDescription>{waitingText(request.status, request.payment_mode)}</DialogDescription>
        </DialogHeader>

        <PurchaseTimeline r={request} quoteCount={currentRound(quotes, request.quote_round).length} />

        <div className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div><span className="text-muted-foreground">Quantidade:</span> {fmtQty(Number(request.quantity))} {request.unit ?? ''}</div>
          <div><span className="text-muted-foreground">Obra:</span> {request.works?.name?.trim() ?? 'Geral'}</div>
          <div><span className="text-muted-foreground">Urgência:</span> {URGENCY_LABEL[request.urgency]}</div>
          <div><span className="text-muted-foreground">Precisa até:</span> {request.needed_by ? formatDate(request.needed_by) : '-'}</div>
          <div><span className="text-muted-foreground">Solicitante:</span> {who(request.requester)}</div>
          <div><span className="text-muted-foreground">Solicitada em:</span> {fmtDateTime(request.created_at)}</div>
          {request.supplier && <div><span className="text-muted-foreground">Fornecedor:</span> {request.supplier}</div>}
          {canSeeQuotes && Number(request.final_value) > 0 && (
            <div><span className="text-muted-foreground">Valor aprovado:</span> <strong className="text-primary">{formatCurrency(Number(request.final_value))}</strong></div>
          )}
          {request.payment_mode && <div><span className="text-muted-foreground">Pagamento:</span> {PAYMENT_MODE_LABEL[request.payment_mode]}</div>}
          {request.invoice_number && <div><span className="text-muted-foreground">Nota fiscal:</span> {request.invoice_number}</div>}
        </div>
        {request.notes && <p className="text-sm"><span className="text-muted-foreground">Observação do pedido:</span> {request.notes}</p>}
        {request.admin_notes && (
          <p className="text-sm"><span className="text-muted-foreground">Observação do admin{request.quote_round > 1 && request.status === 'quoting' ? ' (recusa)' : ''}:</span> {request.admin_notes}</p>
        )}
        {request.finance_notes && <p className="text-sm"><span className="text-muted-foreground">Observações do financeiro:</span> {request.finance_notes}</p>}
        {request.receipt_notes && <p className="text-sm"><span className="text-muted-foreground">Recebimento:</span> {request.receipt_notes}</p>}

        {canSeeQuotes && rounds.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-medium">Cotações</p>
            {rounds.map((rd) => (
              <div key={rd} className="rounded-md border">
                <div className="border-b bg-muted/30 px-3 py-1.5 text-xs font-medium">
                  Rodada {rd}{rd === request.quote_round ? ' (atual)' : ' (recusada)'}
                </div>
                <div className="divide-y">
                  {quotes.filter((q) => q.round === rd).sort((a, b) => Number(a.quoted_value) - Number(b.quoted_value)).map((q) => (
                    <div key={q.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2 text-sm">
                      <div>
                        <span className="font-medium">{q.supplier}</span>
                        {request.approved_quote_id === q.id && <Badge className="ml-2 bg-emerald-600 text-[10px] hover:bg-emerald-600">aprovada</Badge>}
                        <div className="text-xs text-muted-foreground">
                          {PAYMENT_MODE_LABEL[q.payment_mode]}
                          {q.delivery_days !== null && ` · entrega em ${q.delivery_days} dia(s)`}
                          {q.payment_terms && ` · ${q.payment_terms}`}
                          {q.notes && ` · ${q.notes}`}
                        </div>
                      </div>
                      <span className="font-semibold text-primary">{formatCurrency(Number(q.quoted_value))}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
