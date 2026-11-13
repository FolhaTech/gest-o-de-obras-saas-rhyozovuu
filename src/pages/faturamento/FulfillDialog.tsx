import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency, formatSupabaseError } from '@/lib/formatters'
import {
  PAYMENT_MODE_HELP,
  PAYMENT_MODE_LABEL,
  fulfillAction,
  nextFinanceStatus,
  type PaymentMode,
  type PurchaseRequestRow,
} from '@/lib/purchases'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { fmtDateTime, fmtQty, todayISO, who } from './helpers'
import InvoiceFileField from './InvoiceFileField'
import { removeInvoiceFiles, uploadInvoice, type UploadedInvoice } from './invoice-storage'

interface Props {
  request: PurchaseRequestRow | null
  onClose: () => void
  onChanged: () => void
}

/**
 * Financeiro, depois da aprovação do admin:
 *  - compra (escolhe pagamento antecipado ou após a entrega);
 *  - antecipado: libera o pagamento antes da entrega; depois recebe e confere, e encerra;
 *  - após a entrega: recebe e confere primeiro; depois libera o pagamento e encerra.
 */
export default function FulfillDialog({ request, onClose, onChanged }: Props) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [mode, setMode] = useState<PaymentMode>('after_delivery')
  const [boughtAt, setBoughtAt] = useState(todayISO())
  const [invoice, setInvoice] = useState('')
  const [notes, setNotes] = useState('')
  const [checked, setChecked] = useState(false)
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null)

  const id = request?.id
  const status = request?.status
  useEffect(() => {
    if (!request) return
    setMode(request.payment_mode ?? 'after_delivery')
    setBoughtAt(todayISO())
    setInvoice(request.invoice_number ?? '')
    setNotes('')
    setChecked(false)
    setInvoiceFile(null)
    // recomeça só quando muda a solicitação ou a etapa
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, status])

  const action = request ? fulfillAction(request) : null
  if (!request || !action) return null

  const today = todayISO()
  const effectiveMode: PaymentMode | null = request.status === 'approved' ? mode : request.payment_mode
  const next = nextFinanceStatus(request.status, effectiveMode)

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!next) return
    const body: Record<string, unknown> = { status: next }
    if (request.status === 'approved') {
      if (boughtAt > today) {
        toast({ title: 'Data inválida', description: 'A data da compra não pode estar no futuro.', variant: 'destructive' })
        return
      }
      body.payment_mode = mode
      body.purchased_at = boughtAt || today
      body.invoice_number = invoice.trim() || null
      if (notes.trim()) body.finance_notes = notes.trim()
    } else if (request.status === 'awaiting_delivery') {
      if (!checked) {
        toast({ title: 'Confira a entrega', description: 'Marque que você conferiu os itens recebidos.', variant: 'destructive' })
        return
      }
      body.receipt_notes = notes.trim() || null
      if (invoice.trim()) body.invoice_number = invoice.trim()
    } else if (notes.trim()) {
      body.finance_notes = notes.trim()
    }
    setSaving(true)
    // foto ou PDF da nota: sobe primeiro e grava o caminho junto com a mudança de situação
    let uploaded: UploadedInvoice | null = null
    if (invoiceFile && (request.status === 'approved' || request.status === 'awaiting_delivery')) {
      try {
        uploaded = await uploadInvoice(request.id, invoiceFile)
      } catch (e) {
        setSaving(false)
        toast({ title: 'Erro ao enviar a nota fiscal', description: e instanceof Error ? e.message : 'Falha no envio.', variant: 'destructive' })
        return
      }
      body.invoice_file_path = uploaded.path
      body.invoice_file_name = uploaded.name
      body.invoice_file_type = uploaded.type
    }
    const { error } = await supabase.from('purchase_requests' as any).update(body).eq('id', request.id)
    setSaving(false)
    if (error) {
      await removeInvoiceFiles([uploaded?.path]) // não deixa o arquivo solto se a compra não foi gravada
      toast({ title: 'Erro ao salvar', description: formatSupabaseError(error), variant: 'destructive' })
      return
    }
    if (uploaded) await removeInvoiceFiles([request.invoice_file_path]) // trocou o arquivo: apaga o antigo
    const done: Record<string, string> = {
      approved: mode === 'advance' ? 'Compra registrada: libere o pagamento antecipado.' : 'Compra registrada: aguardando a entrega.',
      awaiting_payment: 'Pagamento liberado: aguardando a entrega.',
      awaiting_delivery: request.payment_mode === 'after_delivery' ? 'Entrega recebida e conferida: libere o pagamento.' : 'Entrega recebida e conferida: compra encerrada.',
      awaiting_release: 'Pagamento liberado: compra encerrada.',
    }
    toast({ title: action.title, description: `${request.item}: ${done[request.status]}` })
    onChanged()
    onClose()
  }

  const hint =
    request.status === 'approved'
      ? PAYMENT_MODE_HELP[mode]
      : request.status === 'awaiting_payment'
        ? 'Pagamento antecipado aprovado: libere o pagamento antes da entrega.'
        : request.status === 'awaiting_delivery'
          ? request.payment_mode === 'advance'
            ? 'O pagamento já foi liberado antes da entrega. Receber e conferir encerra a compra.'
            : 'Pagamento após a entrega: receba e confira primeiro. Depois você libera o pagamento.'
          : 'Entrega conferida. Libere o pagamento para encerrar a compra.'

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{action.title}</DialogTitle>
          <DialogDescription>
            {`${request.item} · ${fmtQty(Number(request.quantity))} ${request.unit ?? ''} · ${request.works?.name?.trim() ?? 'Geral'}`}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-0.5">
          <div><span className="text-muted-foreground">Fornecedor:</span> <strong>{request.supplier ?? '-'}</strong></div>
          <div><span className="text-muted-foreground">Valor aprovado:</span> <strong className="text-primary">{formatCurrency(Number(request.final_value) || 0)}</strong></div>
          {request.payment_mode && request.status !== 'approved' && (
            <div><span className="text-muted-foreground">Pagamento:</span> {PAYMENT_MODE_LABEL[request.payment_mode]}</div>
          )}
          {request.invoice_number && request.status !== 'approved' && <div><span className="text-muted-foreground">Nota fiscal:</span> {request.invoice_number}</div>}
          {request.status === 'awaiting_release' && request.received_at && (
            <div><span className="text-muted-foreground">Recebida em:</span> {fmtDateTime(request.received_at)}</div>
          )}
          {request.receipt_notes && request.status === 'awaiting_release' && <div className="text-xs">Conferência: {request.receipt_notes}</div>}
          <div className="text-xs text-muted-foreground pt-1">Aprovada por {who(request.approver)}{request.admin_notes ? ` · "${request.admin_notes}"` : ''}</div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {request.status === 'approved' && (
            <>
              <div className="space-y-1.5">
                <Label>Pagamento</Label>
                <Select value={mode} onValueChange={(v) => setMode(v as PaymentMode)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PAYMENT_MODE_LABEL) as PaymentMode[]).map((m) => <SelectItem key={m} value={m}>{PAYMENT_MODE_LABEL[m]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="fd-date">Data da compra</Label>
                  <Input id="fd-date" type="date" max={today} value={boughtAt} onChange={(e) => setBoughtAt(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fd-nf">Nota fiscal / pedido</Label>
                  <Input id="fd-nf" value={invoice} onChange={(e) => setInvoice(e.target.value)} />
                </div>
              </div>
              <InvoiceFileField file={invoiceFile} onChange={setInvoiceFile} currentName={request.invoice_file_name} disabled={saving} />
            </>
          )}

          {request.status === 'awaiting_delivery' && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="fd-nf2">Nota fiscal</Label>
                <Input id="fd-nf2" value={invoice} onChange={(e) => setInvoice(e.target.value)} />
              </div>
              <InvoiceFileField file={invoiceFile} onChange={setInvoiceFile} currentName={request.invoice_file_name} disabled={saving} />
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <Checkbox checked={checked} onCheckedChange={(v) => setChecked(v === true)} className="mt-0.5" />
                <span>Recebi e conferi os itens (quantidade, qualidade e nota fiscal).</span>
              </label>
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="fd-notes">{request.status === 'awaiting_delivery' ? 'Observações do recebimento' : 'Observações do financeiro'}</Label>
            <Textarea id="fd-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={request.status === 'awaiting_delivery' ? 'Ex.: chegou completo, 2 sacos avariados...' : 'Opcional'} />
          </div>
          <p className="text-xs text-muted-foreground">{hint}</p>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving || !next}>{saving ? 'Salvando...' : action.button}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
