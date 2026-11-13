import type { PurchaseStatus, Urgency } from '@/lib/purchases'

export type Person = { full_name: string | null; email: string | null } | null | undefined

/** Nome (ou e-mail) de quem aparece num embed da API. */
export const who = (p?: Person) => p?.full_name?.trim() || p?.email || '-'

export const fmtQty = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 })

/** Data e hora curtas (pt-BR) de um carimbo ISO; "-" se não houver. */
export const fmtDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '-'

export const todayISO = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export const STATUS_CLASS: Record<PurchaseStatus, string> = {
  requested: 'border-blue-300 bg-blue-50 text-blue-700',
  quoting: 'border-violet-300 bg-violet-50 text-violet-700',
  quotes_sent: 'border-amber-300 bg-amber-50 text-amber-800',
  approved: 'border-teal-300 bg-teal-50 text-teal-700',
  awaiting_payment: 'border-orange-300 bg-orange-50 text-orange-700',
  awaiting_delivery: 'border-sky-300 bg-sky-50 text-sky-700',
  awaiting_release: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  closed: 'border-slate-300 bg-slate-50 text-slate-700',
  cancelled: 'border-muted bg-muted/40 text-muted-foreground',
}

export const URGENCY_CLASS: Record<Urgency, string> = {
  low: 'text-muted-foreground',
  normal: '',
  high: 'text-amber-600 font-medium',
  urgent: 'text-rose-600 font-semibold',
}
