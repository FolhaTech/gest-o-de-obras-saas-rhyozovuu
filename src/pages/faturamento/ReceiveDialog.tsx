import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { formatDate, formatSupabaseError } from '@/lib/formatters'
import {
  PAYMENT_MODE_LABEL,
  RECEIVE_ACTION,
  deliveryDaysLate,
  nextReceiveStatus,
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { fmtQty, todayISO } from './helpers'

interface Props {
  request: PurchaseRequestRow | null
  onClose: () => void
  onChanged: () => void
}

/**
 * Recebimento / encerramento (etapa 6): o ADMIN que abriu a solicitação recebe e confere a entrega.
 * Pagamento antecipado: o recebimento encerra a compra. Após a entrega: depois do recebimento o financeiro libera o
 * pagamento e encerra.
 */
export default function ReceiveDialog({ request, onClose, onChanged }: Props) {
  const { toast } = useToast()
  const [checked, setChecked] = useState(false)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const id = request?.id

  useEffect(() => {
    setChecked(false)
    setNotes('')
  }, [id])

  if (!request) return null
  const advance = request.payment_mode === 'advance'
  const late = deliveryDaysLate(request, todayISO())

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!checked) {
      toast({ title: 'Confira a entrega', description: 'Marque que você recebeu e conferiu os itens.', variant: 'destructive' })
      return
    }
    setSaving(true)
    const { error } = await supabase
      .from('purchase_requests' as any)
      .update({ status: nextReceiveStatus(request.payment_mode), receipt_notes: notes.trim() || null })
      .eq('id', request.id)
    setSaving(false)
    if (error) {
      toast({ title: 'Erro ao registrar o recebimento', description: formatSupabaseError(error), variant: 'destructive' })
      return
    }
    toast({
      title: RECEIVE_ACTION.title,
      description: `${request.item}: ${advance ? 'entrega recebida e conferida, compra encerrada.' : 'entrega recebida e conferida. O financeiro libera o pagamento.'}`,
    })
    onChanged()
    onClose()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{RECEIVE_ACTION.title}</DialogTitle>
          <DialogDescription>
            {`${request.item} · ${fmtQty(Number(request.quantity))} ${request.unit ?? ''} · ${request.works?.name?.trim() ?? 'Geral'}`}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-0.5">
          {request.supplier && <div><span className="text-muted-foreground">Fornecedor:</span> <strong>{request.supplier}</strong></div>}
          <div>
            <span className="text-muted-foreground">Entrega prevista:</span>{' '}
            <strong>{request.delivery_date ? formatDate(request.delivery_date) : 'não informada'}</strong>
            {late > 0 && <span className="ml-2 text-xs font-medium text-rose-600">atrasada {late} dia(s)</span>}
          </div>
          {request.payment_mode && <div><span className="text-muted-foreground">Pagamento:</span> {PAYMENT_MODE_LABEL[request.payment_mode]}</div>}
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <Checkbox checked={checked} onCheckedChange={(v) => setChecked(v === true)} className="mt-0.5" />
            <span>Recebi e conferi os itens (quantidade e qualidade).</span>
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="rd-notes">Observações do recebimento</Label>
            <Textarea id="rd-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: chegou completo; 2 sacos avariados..." />
          </div>
          <p className="text-xs text-muted-foreground">
            {advance
              ? 'O pagamento já foi liberado antes da entrega. Ao confirmar o recebimento, a compra se encerra.'
              : 'Ao confirmar o recebimento, o financeiro libera o pagamento e encerra a compra.'}
          </p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Salvando...' : RECEIVE_ACTION.button}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
