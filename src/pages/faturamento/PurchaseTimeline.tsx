import { Check, X } from 'lucide-react'
import { formatDate } from '@/lib/formatters'
import { PAYMENT_MODE_LABEL, buildSteps, type PurchaseRequestRow } from '@/lib/purchases'
import { fmtDateTime, who } from './helpers'

/**
 * Linha do tempo da compra: 1 Solicitação · 2 Cotações (financeiro) · 3 Aprovação do admin · 4 Compra ·
 * 5 Pagamento / entrega · 6 Recebimento / encerramento (financeiro).
 */
export default function PurchaseTimeline({ r, quoteCount }: { r: PurchaseRequestRow; quoteCount?: number }) {
  const cancelled = r.status === 'cancelled'
  // até onde a solicitação chegou antes de ser cancelada
  const reached = r.approved_quote_id ? 4 : r.decided_at ? 3 : r.handled_by ? 2 : 1
  const steps = buildSteps(r.status, reached)

  const detail = (n: number): string[] => {
    switch (n) {
      case 1:
        return [fmtDateTime(r.created_at), `por ${who(r.requester)}`]
      case 2: {
        const lines: string[] = []
        if (r.quote_round > 1) lines.push(`rodada ${r.quote_round}`)
        if (quoteCount !== undefined && quoteCount > 0) lines.push(`${quoteCount} cotação(ões) na rodada`)
        return lines
      }
      case 3:
        return r.approved_quote_id && r.decided_at ? [fmtDateTime(r.decided_at), `por ${who(r.approver)}`] : []
      case 4:
        return r.purchased_at ? [`em ${formatDate(r.purchased_at)}`, r.supplier ?? ''].filter(Boolean) : []
      case 5: {
        const lines: string[] = []
        if (r.payment_mode) lines.push(PAYMENT_MODE_LABEL[r.payment_mode])
        if (r.payment_mode === 'advance' && r.payment_released_at) lines.push(`pago em ${fmtDateTime(r.payment_released_at)}`)
        return lines
      }
      default: {
        const lines: string[] = []
        if (r.received_at) lines.push(`recebida em ${fmtDateTime(r.received_at)}`)
        if (r.payment_mode === 'after_delivery' && r.payment_released_at) lines.push(`pago em ${fmtDateTime(r.payment_released_at)}`)
        if (r.closed_at) lines.push(`encerrada em ${fmtDateTime(r.closed_at)}`)
        return lines
      }
    }
  }

  return (
    <div className="space-y-2">
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {steps.map((s) => {
          const cls =
            s.state === 'done'
              ? 'border-emerald-300 bg-emerald-50/60'
              : s.state === 'current'
                ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                : 'border-dashed opacity-70'
          const dot =
            s.state === 'done'
              ? 'bg-emerald-600 text-white'
              : s.state === 'current'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
          const lines = s.state === 'todo' ? [] : detail(s.n)
          return (
            <li key={s.n} className={`rounded-md border p-2 text-xs ${cls}`}>
              <div className="flex items-center gap-2">
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${dot}`}>
                  {s.state === 'done' ? <Check className="h-3 w-3" /> : s.n}
                </span>
                <span className="font-medium leading-tight">{s.title}</span>
              </div>
              {lines.map((l, i) => (
                <p key={i} className="mt-1 text-[11px] leading-tight text-muted-foreground">{l}</p>
              ))}
            </li>
          )
        })}
      </ol>
      {cancelled && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <X className="h-3.5 w-3.5" /> Solicitação cancelada
        </p>
      )}
    </div>
  )
}
