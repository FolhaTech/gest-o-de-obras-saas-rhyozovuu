import { useState } from 'react'
import { Check, RotateCcw } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency, formatDate, formatSupabaseError } from '@/lib/formatters'
import {
  PAYMENT_MODE_LABEL,
  URGENCY_LABEL,
  byValue,
  cheapest,
  currentRound,
  type PurchaseQuoteRow,
  type PurchaseRequestRow,
} from '@/lib/purchases'
import { Button } from '@/components/ui/button'
import { fmtQty, who } from './helpers'
import StorageImage from './StorageImage'

interface Props {
  /** Solicitações que o usuário logado pode aprovar ou recusar (cotações enviadas pelo financeiro). */
  requests: PurchaseRequestRow[]
  quotes: PurchaseQuoteRow[]
  onChanged: () => void
  /** Abre a tela de recusa (pede o motivo). */
  onReject: (id: string) => void
}

/**
 * Admin que abriu a solicitação: vê as cotações que o financeiro mandou e aprova uma delas com um clique.
 * Se nenhuma serve, recusa e o financeiro refaz a cotação.
 */
export default function ApprovalPanel({ requests, quotes, onChanged, onReject }: Props) {
  const { toast } = useToast()
  const [busy, setBusy] = useState<string | null>(null)

  if (requests.length === 0) return null

  const approve = async (r: PurchaseRequestRow, q: PurchaseQuoteRow) => {
    if (!confirm(`Aprovar a cotação de "${q.supplier}" por ${formatCurrency(Number(q.quoted_value))} para "${r.item}"? O financeiro passa a fazer a compra.`)) return
    setBusy(q.id)
    const { error } = await supabase
      .from('purchase_requests' as any)
      .update({ status: 'approved', approved_quote_id: q.id })
      .eq('id', r.id)
    setBusy(null)
    if (error) {
      toast({ title: 'Erro ao aprovar', description: formatSupabaseError(error), variant: 'destructive' })
      return
    }
    toast({ title: 'Cotação aprovada', description: `${r.item}: o financeiro faz a compra com ${q.supplier}.` })
    onChanged()
  }

  return (
    <section className="space-y-3 rounded-lg border border-amber-300 bg-amber-50/40 p-3 sm:p-4" aria-label="Aguardando a sua aprovação">
      <div>
        <h2 className="text-base font-semibold">Aguardando a sua aprovação ({requests.length})</h2>
        <p className="text-sm text-muted-foreground">
          O financeiro enviou as cotações. Aprove <strong>uma</strong> delas para ele fazer a compra, ou recuse todas para ele refazer a cotação.
        </p>
      </div>

      {requests.map((r) => {
        const list = byValue(currentRound(quotes.filter((q) => q.request_id === r.id), r.quote_round))
        const best = cheapest(list)
        return (
          <div key={r.id} className="space-y-2 rounded-md border bg-card p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              {r.item_image_path && <StorageImage path={r.item_image_path} alt={`Imagem do item: ${r.item}`} size={64} />}
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {r.item} <span className="font-normal text-muted-foreground">· {fmtQty(Number(r.quantity))} {r.unit ?? ''}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {r.works?.name?.trim() ?? 'Geral'} · urgência {URGENCY_LABEL[r.urgency].toLowerCase()}
                  {r.needed_by ? ` · precisa até ${formatDate(r.needed_by)}` : ''} · pedido por {who(r.requester)}
                  {r.quote_round > 1 ? ` · rodada ${r.quote_round}` : ''}
                </div>
                {r.notes && <div className="text-xs">{r.notes}</div>}
              </div>
              <Button size="sm" variant="outline" className="gap-1.5 border-rose-300 text-rose-700 hover:bg-rose-50 hover:text-rose-800" onClick={() => onReject(r.id)}>
                <RotateCcw className="h-4 w-4" /> Recusar e pedir nova cotação
              </Button>
            </div>

            {list.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma cotação nesta rodada.</p>
            ) : (
              <div className="divide-y rounded-md border">
                {list.map((q) => (
                  <div key={q.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm">
                    {q.image_path && <StorageImage path={q.image_path} alt={`Imagem da cotação de ${q.supplier}`} />}
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="font-medium">
                        {q.supplier}
                        {best?.id === q.id && list.length > 1 && (
                          <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-800">menor valor</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {PAYMENT_MODE_LABEL[q.payment_mode]}
                        {q.delivery_days !== null && ` · entrega em ${q.delivery_days} dia(s)`}
                        {q.payment_terms && ` · ${q.payment_terms}`}
                        {q.notes && ` · ${q.notes}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-primary">{formatCurrency(Number(q.quoted_value))}</span>
                      <Button size="sm" className="gap-1.5" disabled={busy !== null} onClick={() => approve(r, q)}>
                        <Check className="h-4 w-4" /> {busy === q.id ? 'Aprovando...' : 'Aprovar esta'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}
