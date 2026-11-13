import { useCallback, useEffect, useState } from 'react'
import { Check, RotateCcw } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency, formatSupabaseError } from '@/lib/formatters'
import {
  PAYMENT_MODE_LABEL,
  byValue,
  cheapest,
  currentRound,
  type PurchaseQuoteRow,
  type PurchaseRequestRow,
} from '@/lib/purchases'
import { Button } from '@/components/ui/button'
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
import { fmtDateTime, fmtQty, who } from './helpers'
import StorageImage from './StorageImage'

interface Props {
  request: PurchaseRequestRow | null
  onClose: () => void
  onChanged: () => void
}

/**
 * Admin que abriu a solicitação: compara as cotações enviadas pelo financeiro e aprova uma ou recusa (o financeiro
 * refaz a cotação). Para recusar é obrigatório dizer o motivo.
 */
export default function DecisionDialog({ request, onClose, onChanged }: Props) {
  const { toast } = useToast()
  const [quotes, setQuotes] = useState<PurchaseQuoteRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pick, setPick] = useState('')
  const [notes, setNotes] = useState('')

  const requestId = request?.id
  const load = useCallback(async () => {
    if (!requestId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('purchase_quotes' as any)
      .select('*')
      .eq('request_id', requestId)
      .order('created_at', { ascending: true })
    setLoading(false)
    if (error) {
      toast({ title: 'Erro ao carregar as cotações', description: formatSupabaseError(error), variant: 'destructive' })
      return
    }
    setQuotes((data ?? []) as unknown as PurchaseQuoteRow[])
  }, [requestId, toast])

  useEffect(() => {
    setPick('')
    setNotes('')
    setQuotes([])
    load()
  }, [load])

  if (!request) return null
  const current = byValue(currentRound(quotes, request.quote_round))
  const best = cheapest(current)
  const older = quotes.filter((q) => q.round !== request.quote_round)

  const approve = async () => {
    const chosen = current.find((q) => q.id === pick)
    if (!chosen) {
      toast({ title: 'Escolha uma cotação', description: 'Marque a cotação que você aprova.', variant: 'destructive' })
      return
    }
    if (!confirm(`Aprovar a cotação de "${chosen.supplier}" por ${formatCurrency(Number(chosen.quoted_value))}? O financeiro passa a fazer a compra.`)) return
    setSaving(true)
    const { error } = await supabase
      .from('purchase_requests' as any)
      .update({ status: 'approved', approved_quote_id: chosen.id, admin_notes: notes.trim() || null })
      .eq('id', request.id)
    setSaving(false)
    if (error) {
      toast({ title: 'Erro ao aprovar', description: formatSupabaseError(error), variant: 'destructive' })
      return
    }
    toast({ title: 'Cotação aprovada', description: `${request.item}: o financeiro faz a compra com ${chosen.supplier}.` })
    onChanged()
    onClose()
  }

  const reject = async () => {
    if (!notes.trim()) {
      toast({ title: 'Explique a recusa', description: 'Informe o motivo para o financeiro refazer a cotação.', variant: 'destructive' })
      return
    }
    if (!confirm('Recusar as cotações? O item volta para o financeiro refazer a cotação (nova rodada).')) return
    setSaving(true)
    const { error } = await supabase
      .from('purchase_requests' as any)
      .update({ status: 'quoting', admin_notes: notes.trim() })
      .eq('id', request.id)
    setSaving(false)
    if (error) {
      toast({ title: 'Erro ao recusar', description: formatSupabaseError(error), variant: 'destructive' })
      return
    }
    toast({ title: 'Cotações recusadas', description: `${request.item}: voltou para o financeiro refazer a cotação.` })
    onChanged()
    onClose()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Aprovar cotação{request.quote_round > 1 ? ` · rodada ${request.quote_round}` : ''}</DialogTitle>
          <DialogDescription>
            {`${request.item} · ${fmtQty(Number(request.quantity))} ${request.unit ?? ''} · ${request.works?.name?.trim() ?? 'Geral'} · pedido por ${who(request.requester)}`}
          </DialogDescription>
        </DialogHeader>

        {(request.notes || request.item_image_path) && (
          <div className="flex items-start gap-3">
            {request.item_image_path && <StorageImage path={request.item_image_path} alt={`Imagem do item: ${request.item}`} size={72} />}
            {request.notes && <p className="text-sm text-muted-foreground">Observação do pedido: {request.notes}</p>}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : current.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">Nenhuma cotação nesta rodada.</p>
        ) : (
          <div role="radiogroup" aria-label="Cotações enviadas" className="space-y-2">
            {current.map((q) => {
              const on = pick === q.id
              return (
                <label
                  key={q.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors ${on ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'hover:bg-muted/40'}`}
                >
                  <input type="radio" name="quote" className="mt-1" checked={on} onChange={() => setPick(q.id)} />
                  {q.image_path && <StorageImage path={q.image_path} alt={`Imagem da cotação de ${q.supplier}`} />}
                  <div className="flex-1 space-y-0.5">
                    <div className="font-medium">
                      {q.supplier}
                      {best?.id === q.id && current.length > 1 && <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-800">menor valor</span>}
                    </div>
                    <div className="text-primary font-semibold">{formatCurrency(Number(q.quoted_value))}</div>
                    <div className="text-xs text-muted-foreground">
                      {PAYMENT_MODE_LABEL[q.payment_mode]}
                      {q.delivery_days !== null && ` · entrega em ${q.delivery_days} dia(s)`}
                      {q.payment_terms && ` · ${q.payment_terms}`}
                    </div>
                    {q.notes && <div className="text-xs">{q.notes}</div>}
                  </div>
                </label>
              )
            })}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="dd-notes">Observação (obrigatória para recusar)</Label>
          <Textarea id="dd-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: preços acima do orçamento, pedir também a loja X..." />
        </div>

        {older.length > 0 && (
          <details className="rounded-md border p-3 text-sm">
            <summary className="cursor-pointer font-medium">Rodadas anteriores ({older.length} cotação(ões) recusadas)</summary>
            <div className="mt-2 space-y-1.5">
              {older.map((q) => (
                <div key={q.id} className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                  <span>Rodada {q.round} · {q.supplier}</span>
                  <span>{formatCurrency(Number(q.quoted_value))} · {fmtDateTime(q.created_at)}</span>
                </div>
              ))}
            </div>
          </details>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" disabled={saving} onClick={onClose}>Fechar</Button>
          <Button type="button" variant="outline" className="gap-1.5 border-rose-300 text-rose-700 hover:bg-rose-50 hover:text-rose-800" disabled={saving || current.length === 0} onClick={reject}>
            <RotateCcw className="h-4 w-4" /> Recusar e pedir nova cotação
          </Button>
          <Button type="button" className="gap-1.5" disabled={saving || !pick} onClick={approve}>
            <Check className="h-4 w-4" /> Aprovar cotação escolhida
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
