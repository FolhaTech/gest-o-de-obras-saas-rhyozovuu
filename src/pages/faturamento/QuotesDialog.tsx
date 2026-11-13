import { useCallback, useEffect, useState } from 'react'
import { Edit2, Plus, Send, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency, formatSupabaseError } from '@/lib/formatters'
import {
  MIN_QUOTES,
  PAYMENT_MODE_HELP,
  PAYMENT_MODE_LABEL,
  canSendQuotes,
  cheapest,
  currentRound,
  distinctSuppliers,
  parseMoney,
  quotesMissing,
  type PaymentMode,
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { fmtDateTime, fmtQty, who } from './helpers'

interface Props {
  request: PurchaseRequestRow | null
  onClose: () => void
  onChanged: () => void
}

const EMPTY = { id: '', supplier: '', quoted_value: '', delivery_days: '', payment_mode: 'after_delivery' as PaymentMode, payment_terms: '', notes: '' }

/**
 * Financeiro: lança as cotações do item (mínimo 3 fornecedores diferentes) e envia para o admin que abriu a
 * solicitação. Se o admin recusar, volta aqui numa nova rodada.
 */
export default function QuotesDialog({ request, onClose, onChanged }: Props) {
  const { toast } = useToast()
  const [quotes, setQuotes] = useState<PurchaseQuoteRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY)

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
    setForm(EMPTY)
    setQuotes([])
    load()
  }, [load])

  if (!request) return null
  const round = request.quote_round
  const editable = request.status === 'requested' || request.status === 'quoting'
  const current = currentRound(quotes, round)
  const older = quotes.filter((q) => q.round !== round)
  const best = cheapest(current)
  const missing = quotesMissing(current)
  const asker = request.requester?.role?.trim().toLowerCase() === 'admin' ? who(request.requester) : 'um dos administradores'

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault()
    const supplier = form.supplier.trim()
    const value = parseMoney(form.quoted_value)
    const days = form.delivery_days.trim() === '' ? null : Number(form.delivery_days)
    if (!supplier) {
      toast({ title: 'Informe o fornecedor', variant: 'destructive' })
      return
    }
    if (Number.isNaN(value) || value < 0) {
      toast({ title: 'Valor inválido', description: 'Informe o valor cotado (maior ou igual a zero).', variant: 'destructive' })
      return
    }
    if (days !== null && (!Number.isInteger(days) || days < 0)) {
      toast({ title: 'Prazo inválido', description: 'O prazo de entrega é em dias inteiros.', variant: 'destructive' })
      return
    }
    if (current.some((q) => q.id !== form.id && q.supplier.trim().toLowerCase() === supplier.toLowerCase())) {
      toast({ title: 'Fornecedor repetido', description: 'Cada fornecedor cota uma vez por rodada. Edite a cotação existente.', variant: 'destructive' })
      return
    }
    const body = {
      supplier,
      quoted_value: value,
      delivery_days: days,
      payment_mode: form.payment_mode,
      payment_terms: form.payment_terms.trim() || null,
      notes: form.notes.trim() || null,
    }
    setSaving(true)
    const res = form.id
      ? await supabase.from('purchase_quotes' as any).update(body).eq('id', form.id)
      : await supabase.from('purchase_quotes' as any).insert({ ...body, request_id: request.id })
    setSaving(false)
    if (res.error) {
      toast({ title: 'Erro ao salvar a cotação', description: formatSupabaseError(res.error), variant: 'destructive' })
      return
    }
    setForm(EMPTY)
    await load()
    onChanged()
  }

  const remove = async (q: PurchaseQuoteRow) => {
    if (!confirm(`Remover a cotação de "${q.supplier}"?`)) return
    const { error } = await supabase.from('purchase_quotes' as any).delete().eq('id', q.id)
    if (error) {
      toast({ title: 'Erro ao remover', description: formatSupabaseError(error), variant: 'destructive' })
      return
    }
    if (form.id === q.id) setForm(EMPTY)
    await load()
    onChanged()
  }

  const send = async () => {
    if (!canSendQuotes(current)) {
      toast({ title: 'Faltam cotações', description: `Cote com pelo menos ${MIN_QUOTES} fornecedores diferentes (hoje: ${distinctSuppliers(current)}).`, variant: 'destructive' })
      return
    }
    if (!confirm(`Enviar as ${current.length} cotações para ${asker} aprovar? Depois de enviadas, não dá mais para alterar.`)) return
    setSaving(true)
    const { error } = await supabase.from('purchase_requests' as any).update({ status: 'quotes_sent' }).eq('id', request.id)
    setSaving(false)
    if (error) {
      toast({ title: 'Erro ao enviar', description: formatSupabaseError(error), variant: 'destructive' })
      return
    }
    toast({ title: 'Cotações enviadas ao admin', description: `${request.item}: aguardando a aprovação.` })
    onChanged()
    onClose()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cotações{round > 1 ? ` · rodada ${round}` : ''}</DialogTitle>
          <DialogDescription>
            {`${request.item} · ${fmtQty(Number(request.quantity))} ${request.unit ?? ''} · ${request.works?.name?.trim() ?? 'Geral'} · pedido por ${who(request.requester)}`}
          </DialogDescription>
        </DialogHeader>

        {round > 1 && request.admin_notes && (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
            <strong>O admin recusou as cotações anteriores:</strong> {request.admin_notes}
            <div className="text-xs mt-1 opacity-80">Refaça a cotação do item (pode repetir fornecedores com preço novo).</div>
          </div>
        )}
        {request.notes && <p className="text-sm text-muted-foreground">Observação do pedido: {request.notes}</p>}

        <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <span>
            <strong>{distinctSuppliers(current)}</strong> de {MIN_QUOTES} fornecedores diferentes
            {missing > 0 ? ` · faltam ${missing}` : ' · pronto para enviar'}
          </span>
          {editable && (
            <Button size="sm" className="gap-2" disabled={saving || !canSendQuotes(current)} onClick={send}>
              <Send className="h-4 w-4" /> Enviar ao admin
            </Button>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : current.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">Nenhuma cotação nesta rodada ainda.</p>
        ) : (
          <div className="space-y-2">
            {current.map((q) => (
              <div key={q.id} className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm">
                <div className="space-y-0.5">
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
                {editable && (
                  <div className="flex shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar" onClick={() => setForm({ id: q.id, supplier: q.supplier, quoted_value: String(q.quoted_value).replace('.', ','), delivery_days: q.delivery_days === null ? '' : String(q.delivery_days), payment_mode: q.payment_mode, payment_terms: q.payment_terms ?? '', notes: q.notes ?? '' })}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" title="Remover" onClick={() => remove(q)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {editable && (
          <form onSubmit={save} className="space-y-3 rounded-md border p-3">
            <p className="text-sm font-medium">{form.id ? 'Editar cotação' : 'Adicionar cotação'}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="qd-sup">Fornecedor</Label>
                <Input id="qd-sup" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qd-val">Valor cotado (R$)</Label>
                <Input id="qd-val" inputMode="decimal" placeholder="0,00" value={form.quoted_value} onChange={(e) => setForm({ ...form, quoted_value: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Pagamento oferecido</Label>
                <Select value={form.payment_mode} onValueChange={(v) => setForm({ ...form, payment_mode: v as PaymentMode })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PAYMENT_MODE_LABEL) as PaymentMode[]).map((m) => <SelectItem key={m} value={m}>{PAYMENT_MODE_LABEL[m]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qd-days">Entrega (dias)</Label>
                <Input id="qd-days" inputMode="numeric" placeholder="ex.: 5" value={form.delivery_days} onChange={(e) => setForm({ ...form, delivery_days: e.target.value.replace(/\D/g, '') })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qd-terms">Condições</Label>
                <Input id="qd-terms" placeholder="ex.: PIX à vista, 30 dias" value={form.payment_terms} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{PAYMENT_MODE_HELP[form.payment_mode]}</p>
            <div className="space-y-1.5">
              <Label htmlFor="qd-notes">Observação</Label>
              <Textarea id="qd-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Marca, frete, validade da proposta..." />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" className="gap-1.5" disabled={saving}>
                <Plus className="h-4 w-4" /> {form.id ? 'Salvar cotação' : 'Adicionar cotação'}
              </Button>
              {form.id && (
                <Button type="button" size="sm" variant="outline" onClick={() => setForm(EMPTY)}>Cancelar edição</Button>
              )}
            </div>
          </form>
        )}

        {older.length > 0 && (
          <details className="rounded-md border p-3 text-sm">
            <summary className="cursor-pointer font-medium">Rodadas anteriores ({older.length} cotação(ões) recusadas)</summary>
            <div className="mt-2 space-y-1.5">
              {older.map((q) => (
                <div key={q.id} className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                  <span>Rodada {q.round} · {q.supplier} · {PAYMENT_MODE_LABEL[q.payment_mode]}</span>
                  <span>{formatCurrency(Number(q.quoted_value))} · {fmtDateTime(q.created_at)}</span>
                </div>
              ))}
            </div>
          </details>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
