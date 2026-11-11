/**
 * Faturamento > Compras: situações, urgência e ordenação das solicitações de compra.
 */
export type PurchaseStatus = 'requested' | 'quoting' | 'approved' | 'purchased' | 'delivered' | 'rejected' | 'cancelled'
export type Urgency = 'low' | 'normal' | 'high' | 'urgent'

export const STATUS_LABEL: Record<PurchaseStatus, string> = {
  requested: 'Pendente pelo financeiro',
  quoting: 'Em cotação',
  approved: 'Aprovada',
  purchased: 'Comprada',
  delivered: 'Entregue',
  rejected: 'Recusada',
  cancelled: 'Cancelada',
}

/** Situações que o financeiro escolhe ao atender (cancelar é do solicitante). "requested" = voltar a pendente. */
export const FINANCE_STATUSES: PurchaseStatus[] = ['requested', 'quoting', 'approved', 'purchased', 'delivered', 'rejected']

export const URGENCY_LABEL: Record<Urgency, string> = {
  low: 'Baixa',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente',
}

const URGENCY_RANK: Record<Urgency, number> = { urgent: 0, high: 1, normal: 2, low: 3 }

/** Ainda depende de alguém (não foi comprada, recusada nem cancelada). */
export const isOpen = (s: string): boolean => s === 'requested' || s === 'quoting' || s === 'approved'

/** Concluída com compra feita. */
export const isBought = (s: string): boolean => s === 'purchased' || s === 'delivered'

export interface SortableRequest {
  status: string
  urgency: string
  needed_by?: string | null
  created_at?: string | null
}

/**
 * Abertas primeiro (mais urgentes e com prazo mais perto no topo); depois as encerradas, da mais recente para a
 * mais antiga. Não altera a lista recebida.
 */
export function sortRequests<T extends SortableRequest>(list: T[]): T[] {
  const time = (iso?: string | null) => (iso ? Date.parse(iso) : 0)
  return [...list].sort((a, b) => {
    const ao = isOpen(a.status)
    const bo = isOpen(b.status)
    if (ao !== bo) return ao ? -1 : 1
    if (ao && bo) {
      const ua = URGENCY_RANK[a.urgency as Urgency] ?? 2
      const ub = URGENCY_RANK[b.urgency as Urgency] ?? 2
      if (ua !== ub) return ua - ub
      const na = a.needed_by ? Date.parse(a.needed_by) : Number.POSITIVE_INFINITY
      const nb = b.needed_by ? Date.parse(b.needed_by) : Number.POSITIVE_INFINITY
      if (na !== nb) return na - nb
      return time(a.created_at) - time(b.created_at) // empate: a mais antiga primeiro (está esperando há mais tempo)
    }
    return time(b.created_at) - time(a.created_at)
  })
}

/** Dias de atraso do prazo "precisa até" (0 se não há prazo, já foi comprada ou ainda está no prazo). */
export function daysLate(r: { status: string; needed_by?: string | null }, today: string): number {
  if (!r.needed_by || !isOpen(r.status)) return 0
  const diff = Math.round((Date.parse(today) - Date.parse(r.needed_by)) / 86_400_000)
  return diff > 0 ? diff : 0
}
