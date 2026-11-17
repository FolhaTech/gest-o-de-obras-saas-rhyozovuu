/**
 * Financeiro > Pagamento (Prestadores): solicitação de pagamento de prestadores de serviços externos.
 * O admin abre a solicitação para o contas a pagar (Financeiro) com Nome, PIX, Tratativa (tipo de serviço), NF, Casa, Valor e
 * Vencimento; o financeiro paga. As regras valem de verdade no banco (migração 32); aqui ficam a conferência do formulário,
 * os textos de vencimento, a ordem da lista e o resumo por prestador.
 */
import { parseMoney } from './purchases'

export type ProviderPaymentStatus = 'requested' | 'paid' | 'cancelled'

export const PROVIDER_STATUS_LABEL: Record<ProviderPaymentStatus, string> = {
  requested: 'A pagar',
  paid: 'Pago',
  cancelled: 'Cancelada',
}

export interface ProviderPaymentRow {
  id: string
  provider_id: string | null
  provider_name: string
  pix_key: string
  service_type: string
  invoice_number: string
  work_id: string | null
  work_name: string | null
  payment_amount: number | string
  due_date: string
  notes: string | null
  status: ProviderPaymentStatus
  requested_by: string | null
  paid_at: string | null
  paid_by: string | null
  payment_method: string | null
  finance_notes: string | null
  created_at: string
  works?: { id: string; name: string } | null
}

/** O que o admin preenche ao abrir a solicitação (todos os campos, menos a observação, são obrigatórios). */
export interface ProviderPaymentForm {
  provider_id: string
  provider_name: string
  pix_key: string
  service_type: string
  invoice_number: string
  work_id: string
  amount: string
  due_date: string
  notes: string
}

export const EMPTY_FORM: ProviderPaymentForm = {
  provider_id: '',
  provider_name: '',
  pix_key: '',
  service_type: '',
  invoice_number: '',
  work_id: '',
  amount: '',
  due_date: '',
  notes: '',
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/
const isRealDate = (s: string): boolean => {
  const m = ISO.exec(s)
  if (!m) return false
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3])
}

/** Primeira falha do formulário (mensagem para o usuário), ou nulo se está tudo preenchido. Espelha o banco. */
export function validateProviderPayment(f: ProviderPaymentForm): string | null {
  if (!f.provider_name.trim()) return 'Informe o nome do prestador.'
  if (!f.pix_key.trim()) return 'Informe o PIX.'
  if (!f.service_type.trim()) return 'Informe a tratativa (o tipo de serviço prestado).'
  if (!f.invoice_number.trim()) return 'Informe a NF (se não houver, escreva "sem NF").'
  if (!f.work_id) return 'Escolha a casa em que o serviço foi prestado.'
  const amount = parseMoney(f.amount)
  if (Number.isNaN(amount) || amount <= 0) return 'Informe o valor (maior que zero).'
  if (!f.due_date) return 'Informe o vencimento.'
  if (!isRealDate(f.due_date)) return 'O vencimento não é uma data válida.'
  return null
}

const DAY_MS = 86_400_000
const parse = (iso: string): number => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/** Dias até o vencimento (negativo = já venceu). */
export const daysUntil = (due: string, today: string): number => Math.round((parse(due) - parse(today)) / DAY_MS)

export type DueState = 'overdue' | 'today' | 'soon' | 'ok'

/** Situação do vencimento de uma solicitação aberta: vencida, vence hoje, vence nos próximos dias ou com folga. */
export function dueState(due: string, today: string, soonDays = 7): DueState {
  const d = daysUntil(due, today)
  if (d < 0) return 'overdue'
  if (d === 0) return 'today'
  return d <= soonDays ? 'soon' : 'ok'
}

/** "Venceu há 3 dias", "Vence hoje", "Vence amanhã", "Vence em 5 dias". */
export function dueText(due: string, today: string): string {
  const d = daysUntil(due, today)
  if (d < 0) return `Venceu há ${-d} dia${d === -1 ? '' : 's'}`
  if (d === 0) return 'Vence hoje'
  if (d === 1) return 'Vence amanhã'
  return `Vence em ${d} dias`
}

/**
 * Abertas primeiro, as que vencem antes no topo; depois as pagas (a paga mais recentemente primeiro); canceladas por último.
 * Não altera a lista recebida.
 */
export function sortPayments<T extends Pick<ProviderPaymentRow, 'status' | 'due_date' | 'paid_at' | 'created_at'>>(list: T[]): T[] {
  const rank = (s: ProviderPaymentStatus) => (s === 'requested' ? 0 : s === 'paid' ? 1 : 2)
  return [...list].sort((a, b) => {
    if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status)
    if (a.status === 'requested') return a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : a.created_at < b.created_at ? -1 : 1
    const ka = a.paid_at ?? a.created_at
    const kb = b.paid_at ?? b.created_at
    return ka < kb ? 1 : ka > kb ? -1 : 0
  })
}

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

export interface ProviderSummary {
  key: string
  name: string
  pendingCount: number
  pendingTotal: number
  overdueCount: number
  paidTotal: number
  nextDue: string | null
}

/** Resumo por prestador (cadastrado, ou pelo nome quando digitado): a pagar, vencidas, já pago e o próximo vencimento. */
export function summarizeByProvider(rows: ProviderPaymentRow[], today: string): ProviderSummary[] {
  const map = new Map<string, ProviderSummary>()
  for (const r of rows) {
    if (r.status === 'cancelled') continue
    const key = r.provider_id ?? `nome:${normalize(r.provider_name)}`
    const cur = map.get(key) ?? { key, name: r.provider_name.trim(), pendingCount: 0, pendingTotal: 0, overdueCount: 0, paidTotal: 0, nextDue: null }
    const value = Number(r.payment_amount) || 0
    if (r.status === 'paid') {
      cur.paidTotal += value
    } else {
      cur.pendingCount++
      cur.pendingTotal += value
      if (daysUntil(r.due_date, today) < 0) cur.overdueCount++
      if (!cur.nextDue || r.due_date < cur.nextDue) cur.nextDue = r.due_date
    }
    map.set(key, cur)
  }
  const round = (n: number) => Math.round(n * 100) / 100
  return [...map.values()]
    .map((s) => ({ ...s, pendingTotal: round(s.pendingTotal), paidTotal: round(s.paidTotal) }))
    .sort((a, b) => b.pendingTotal - a.pendingTotal || a.name.localeCompare(b.name, 'pt-BR'))
}

/** Cartões do topo: a pagar, vencidas, a vencer em até 7 dias e pago no mês (mês de `today`). */
export function paymentTotals(rows: ProviderPaymentRow[], today: string) {
  const round = (n: number) => Math.round(n * 100) / 100
  const open = rows.filter((r) => r.status === 'requested')
  const sum = (list: ProviderPaymentRow[]) => round(list.reduce((s, r) => s + (Number(r.payment_amount) || 0), 0))
  const overdue = open.filter((r) => daysUntil(r.due_date, today) < 0)
  const soon = open.filter((r) => {
    const d = daysUntil(r.due_date, today)
    return d >= 0 && d <= 7
  })
  const paidMonth = rows.filter((r) => r.status === 'paid' && (r.paid_at ?? '').slice(0, 7) === today.slice(0, 7))
  return {
    openCount: open.length,
    openTotal: sum(open),
    overdueCount: overdue.length,
    overdueTotal: sum(overdue),
    soonCount: soon.length,
    soonTotal: sum(soon),
    paidMonthCount: paidMonth.length,
    paidMonthTotal: sum(paidMonth),
  }
}
