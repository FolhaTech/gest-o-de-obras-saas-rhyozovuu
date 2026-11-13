import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency, formatDate, formatSupabaseError } from '@/lib/formatters'
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
import InvoiceFileField from './InvoiceFileField'
import InvoiceLink from './InvoiceLink'
import PurchaseTimeline from './PurchaseTimeline'
import { removeInvoiceFiles, uploadInvoice } from './invoice-storage'
import { STATUS_CLASS, fmtDateTime, fmtQty, who } from './helpers'

interface Props {
  request: PurchaseRequestRow | null
  /** Admin e Financeiro veem as cotações (são valores). */
  canSeeQuotes: boolean
  /** O Financeiro anexa, troca e remove a foto/PDF da nota. */
  canManageInvoice?: boolean
  onChanged?: () => void
  onClose: () => void
}

/** Andamento da solicitação: linha do tempo, dados do pedido e (para Admin e Financeiro) as cotações de cada rodada. */
export default function DetailsDialog({ request, canSeeQuotes, canManageInvoice, onChanged, onClose }: Props) {
  const { toast } = useToast()
  const [quotes, setQuotes] = useState<PurchaseQuoteRow[]>([])
  const [invFile, setInvFile] = useState<File | null>(null)
  const [invBusy, setInvBusy] = useState(false)
  const id = request?.id

  useEffect(() => {
    setInvFile(null)
  }, [id])

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

  const sendInvoice = async () => {
    if (!invFile) return
    setInvBusy(true)
    let up
    try {
      up = await uploadInvoice(request.id, invFile)
    } catch (e) {
      setInvBusy(false)
      toast({ title: 'Erro ao enviar a nota fiscal', description: e instanceof Error ? e.message : 'Falha no envio.', variant: 'destructive' })
      return
    }
    const { error } = await supabase
      .from('purchase_requests' as any)
      .update({ invoice_file_path: up.path, invoice_file_name: up.name, invoice_file_type: up.type })
      .eq('id', request.id)
    if (error) {
      await removeInvoiceFiles([up.path])
      setInvBusy(false)
      toast({ title: 'Erro ao salvar a nota fiscal', description: formatSupabaseError(error), variant: 'destructive' })
      return
    }
    await removeInvoiceFiles([request.invoice_file_path])
    setInvFile(null)
    setInvBusy(false)
    toast({ title: 'Nota fiscal anexada', description: request.item })
    onChanged?.()
  }

  const clearInvoice = async () => {
    if (!confirm('Remover o arquivo da nota fiscal desta solicitação?')) return
    setInvBusy(true)
    const old = request.invoice_file_path
    const { error } = await supabase.from('purchase_requests' as any).update({ invoice_file_path: null }).eq('id', request.id)
    setInvBusy(false)
    if (error) {
      toast({ title: 'Erro ao remover', description: formatSupabaseError(error), variant: 'destructive' })
      return
    }
    await removeInvoiceFiles([old])
    toast({ title: 'Arquivo da nota removido' })
    onChanged?.()
  }

  const showInvoice = canSeeQuotes && (!!request.invoice_number || !!request.invoice_file_path || (!!canManageInvoice && request.status !== 'cancelled'))
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
        {showInvoice && (
          <div className="space-y-2 rounded-md border p-3">
            <p className="text-sm font-medium">Nota fiscal</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              {request.invoice_number && <span><span className="text-muted-foreground">Número:</span> {request.invoice_number}</span>}
              {request.invoice_file_path ? (
                <>
                  <InvoiceLink path={request.invoice_file_path} name={request.invoice_file_name} />
                  {request.invoice_file_name && <span className="text-xs text-muted-foreground">{request.invoice_file_name}</span>}
                  {canManageInvoice && (
                    <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" disabled={invBusy} onClick={clearInvoice}>
                      Remover arquivo
                    </Button>
                  )}
                </>
              ) : (
                <span className="text-xs text-muted-foreground">Nenhum arquivo anexado.</span>
              )}
            </div>
            {canManageInvoice && (
              <div className="space-y-2">
                <InvoiceFileField file={invFile} onChange={setInvFile} currentName={request.invoice_file_name} disabled={invBusy} />
                {invFile && (
                  <Button type="button" size="sm" disabled={invBusy} onClick={sendInvoice}>
                    {invBusy ? 'Enviando...' : request.invoice_file_path ? 'Substituir nota fiscal' : 'Enviar nota fiscal'}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
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
