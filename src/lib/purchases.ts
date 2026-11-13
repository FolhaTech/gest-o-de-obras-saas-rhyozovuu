/**
 * Faturamento > Compras: fluxo de solicitação, cotação, aprovação, compra, pagamento e recebimento.
 * As regras valem de verdade no banco (gatilho de purchase_requests, migração 24); aqui ficam os textos,
 * a ordem das etapas e as conferências que a tela faz antes de chamar a API.
 *
 *   1 Solicitação · 2 Cotações (financeiro) · 3 Aprovação do admin · 4 Compra · 5 Pagamento / entrega
 *   · 6 Recebimento / encerramento (financeiro)
 */
export type PurchaseStatus =
  | 'requested'
  | 'quoting'
  | 'quotes_sent'
  | 'approved'
  | 'awaiting_payment'
  | 'awaiting_delivery'
  | 'awaiting_release'
  | 'closed'
  | 'cancelled'
export type Urgency = 'low' | 'normal' | 'high' | 'urgent'
export type PaymentMode = 'advance' | 'after_delivery'

/** Mínimo de cotações (fornecedores diferentes) para o financeiro enviar ao admin. */
export const MIN_QUOTES = 3

export const STATUS_LABEL: Record<PurchaseStatus, string> = {
  requested: 'Pendente pelo financeiro',
  quoting: 'Em cotação (financeiro)',
  quotes_sent: 'Aprovação do admin',
  approved: 'Aprovada: comprar',
  awaiting_payment: 'Liberar pagamento antecipado',
  awaiting_delivery: 'Aguardando entrega',
  awaiting_release: 'Recebida: liberar pagamento',
  closed: 'Encerrada',
  cancelled: 'Cancelada',
}

export const PAYMENT_MODE_LABEL: Record<PaymentMode, string> = {
  advance: 'Antecipado (antes da entrega)',
  after_delivery: 'Após a entrega',
}

/** O que cada forma de pagamento significa no caminho da compra. */
export const PAYMENT_MODE_HELP: Record<PaymentMode, string> = {
  advance: 'O financeiro libera o pagamento antes da entrega. Depois recebe e confere, e a compra se encerra.',
  after_delivery: 'O financeiro recebe e confere a entrega primeiro. Só depois libera o pagamento e encerra.',
}

export const URGENCY_LABEL: Record<Urgency, string> = {
  low: 'Baixa',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente',
}

const URGENCY_RANK: Record<Urgency, number> = { urgent: 0, high: 1, normal: 2, low: 3 }

/** Quem precisa agir. */
export type Actor = 'financeiro' | 'admin'

/** Ainda não terminou (nem encerrada nem cancelada). */
export const isOpen = (s: string): boolean => s !== 'closed' && s !== 'cancelled'

/** A compra já foi feita (do pedido ao fornecedor até o encerramento). */
export const isBought = (s: string): boolean =>
  s === 'awaiting_payment' || s === 'awaiting_delivery' || s === 'awaiting_release' || s === 'closed'

/** Quem tem a próxima ação (nulo quando terminou). */
export function waitingOn(status: string): Actor | null {
  if (status === 'quotes_sent') return 'admin'
  if (isOpen(status)) return 'financeiro'
  return null
}

/** Texto curto de "o que falta" para a lista. */
export function waitingText(status: string, mode?: string | null): string {
  switch (status) {
    case 'requested':
      return 'Aguardando o financeiro iniciar as cotações'
    case 'quoting':
      return `Financeiro cotando (mínimo ${MIN_QUOTES} fornecedores)`
    case 'quotes_sent':
      return 'Admin precisa aprovar uma cotação'
    case 'approved':
      return 'Financeiro precisa fazer a compra'
    case 'awaiting_payment':
      return 'Financeiro libera o pagamento antecipado'
    case 'awaiting_delivery':
      return mode === 'advance' ? 'Pago antes da entrega: financeiro recebe e confere' : 'Financeiro recebe e confere a entrega'
    case 'awaiting_release':
      return 'Financeiro libera o pagamento e encerra'
    case 'closed':
      return 'Compra encerrada'
    case 'cancelled':
      return 'Solicitação cancelada'
    default:
      return ''
  }
}

/**
 * Quem aprova as cotações, em texto: o admin que abriu a solicitação; se quem abriu não é admin, qualquer admin.
 */
export function approverText(requesterName: string, requesterRole?: string | null): string {
  return norm(requesterRole) === 'admin'
    ? `Aguardando ${requesterName} (admin que abriu) aprovar uma das cotações`
    : 'Aguardando um admin aprovar uma das cotações'
}

/** Próxima situação do caminho feliz do financeiro (nulo se quem age é outro ou terminou). */
export function nextFinanceStatus(status: string, mode?: string | null): PurchaseStatus | null {
  switch (status) {
    case 'requested':
      return 'quoting'
    case 'quoting':
      return 'quotes_sent'
    case 'approved':
      return mode === 'advance' ? 'awaiting_payment' : 'awaiting_delivery'
    case 'awaiting_payment':
      return 'awaiting_delivery'
    case 'awaiting_delivery':
      return mode === 'after_delivery' ? 'awaiting_release' : 'closed'
    case 'awaiting_release':
      return 'closed'
    default:
      return null
  }
}

/** Título e botão da etapa do financeiro depois da aprovação (nulo se não há ação dele nessa situação). */
export function fulfillAction(r: { status: string }): { title: string; button: string } | null {
  switch (r.status) {
    case 'approved':
      return { title: 'Registrar a compra', button: 'Comprar' }
    case 'awaiting_payment':
      return { title: 'Liberar o pagamento antecipado', button: 'Liberar pagamento' }
    case 'awaiting_delivery':
      return { title: 'Receber e conferir a entrega', button: 'Receber e conferir' }
    case 'awaiting_release':
      return { title: 'Liberar o pagamento e encerrar', button: 'Liberar pagamento' }
    default:
      return null
  }
}

// ---------------------------------------------------------------- etapas (linha do tempo)
export const STEP_TITLES = [
  'Solicitação',
  'Cotações (financeiro)',
  'Aprovação do admin',
  'Compra',
  'Pagamento / entrega',
  'Recebimento / encerramento',
] as const

/** Etapa atual (1 a 6); 0 = cancelada; 7 = tudo concluído. */
export function stepOf(status: string): number {
  switch (status) {
    case 'requested':
      return 1
    case 'quoting':
      return 2
    case 'quotes_sent':
      return 3
    case 'approved':
      return 4
    case 'awaiting_payment':
    case 'awaiting_delivery':
      return 5
    case 'awaiting_release':
      return 6
    case 'closed':
      return 7
    default:
      return 0
  }
}

export type StepState = 'done' | 'current' | 'todo'
export interface Step {
  n: number
  title: string
  state: StepState
}

/** As seis etapas com o estado de cada uma (cancelada: as feitas ficam "done" até onde chegou, o resto "todo"). */
export function buildSteps(status: string, reached?: number): Step[] {
  const cur = status === 'cancelled' ? 0 : stepOf(status)
  return STEP_TITLES.map((title, i) => {
    const n = i + 1
    const state: StepState =
      status === 'cancelled' ? (reached && n <= reached ? 'done' : 'todo') : n < cur ? 'done' : n === cur ? 'current' : 'todo'
    return { n, title, state }
  })
}

// ---------------------------------------------------------------- cotações
export interface QuoteLike {
  supplier: string
  quoted_value?: number | string | null
  round?: number
}

const supplierKey = (s: string) => s.trim().toLowerCase()

/** Quantos fornecedores diferentes cotaram (sem diferenciar maiúsculas nem espaços nas pontas). */
export function distinctSuppliers(quotes: QuoteLike[]): number {
  return new Set(quotes.filter((q) => q.supplier.trim()).map((q) => supplierKey(q.supplier))).size
}

/** Quantas cotações ainda faltam para poder enviar ao admin. */
export function quotesMissing(quotes: QuoteLike[]): number {
  return Math.max(0, MIN_QUOTES - distinctSuppliers(quotes))
}

export const canSendQuotes = (quotes: QuoteLike[]): boolean => quotesMissing(quotes) === 0

/** Só as cotações da rodada atual (as anteriores ficam como histórico). */
export function currentRound<T extends QuoteLike>(quotes: T[], round: number): T[] {
  return quotes.filter((q) => (q.round ?? 1) === round)
}

/** Menor valor da lista (nulo se vazia). */
export function cheapest<T extends QuoteLike>(quotes: T[]): T | null {
  let best: T | null = null
  for (const q of quotes) {
    if (best === null || Number(q.quoted_value) < Number(best.quoted_value)) best = q
  }
  return best
}

/** Do menor para o maior valor (não altera a lista recebida). */
export const byValue = <T extends QuoteLike>(quotes: T[]): T[] =>
  [...quotes].sort((a, b) => Number(a.quoted_value) - Number(b.quoted_value))

// ---------------------------------------------------------------- quem pode o quê (espelha o gatilho do banco)
const norm = (role?: string | null) => (role ?? '').trim().toLowerCase()

/**
 * Aprova ou recusa as cotações: o admin que abriu a solicitação; se quem abriu não é admin, qualquer admin.
 * (O banco confere de novo.)
 */
export function canDecide(
  r: { status: string; requested_by: string | null },
  userId: string | null | undefined,
  role: string | null | undefined,
  requesterRole?: string | null,
): boolean {
  if (r.status !== 'quotes_sent' || norm(role) !== 'admin') return false
  return r.requested_by === (userId ?? null) || norm(requesterRole) !== 'admin'
}

/** Cancela: o solicitante enquanto está pendente; o admin até a compra. */
export function canCancel(
  r: { status: string; requested_by: string | null },
  userId: string | null | undefined,
  role: string | null | undefined,
): boolean {
  if (r.status === 'requested' && r.requested_by === (userId ?? null)) return true
  return norm(role) === 'admin' && ['requested', 'quoting', 'quotes_sent', 'approved'].includes(r.status)
}

/**
 * É a vez deste usuário agir? Financeiro: tudo o que está com ele (menos a aprovação). Admin: as cotações que ele
 * pode aprovar ou recusar. Os demais papéis nunca agem.
 */
export function needsMyAction(
  r: { status: string; requested_by: string | null },
  userId: string | null | undefined,
  role: string | null | undefined,
  requesterRole?: string | null,
): boolean {
  if (norm(role) === 'financeiro') return waitingOn(r.status) === 'financeiro'
  return canDecide(r, userId, role, requesterRole)
}

/**
 * Lê um valor em reais digitado: "1234,56", "1.234,56", "1234.56", "R$ 12,50". Devolve NaN se vazio ou inválido.
 * (Com vírgula, o ponto é separador de milhar; só com pontos, "1.234" é mil duzentos e trinta e quatro.)
 */
export function parseMoney(input: string): number {
  let s = (input ?? '').replace(/R\$/gi, '').replace(/\s/g, '')
  if (s === '') return Number.NaN
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(s) && !s.startsWith('0')) s = s.replace(/\./g, '')
  if (!/^-?\d+(\.\d+)?$/.test(s)) return Number.NaN
  return Number(s)
}

/** O solicitante edita o pedido só enquanto está pendente pelo financeiro. */
export const canEditRequest = (r: { status: string; requested_by: string | null }, userId?: string | null): boolean =>
  r.status === 'requested' && r.requested_by === (userId ?? null)

// ---------------------------------------------------------------- lista
export interface SortableRequest {
  status: string
  urgency: string
  needed_by?: string | null
  created_at?: string | null
}

/**
 * Abertas primeiro (mais urgentes e com prazo mais perto no topo); depois as encerradas e canceladas, da mais recente
 * para a mais antiga. Não altera a lista recebida.
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

/**
 * Dias de atraso do prazo "precisa até": vale até o item chegar (recebido, encerrada ou cancelada não atrasam).
 * 0 se não há prazo ou ainda está no prazo.
 */
export function daysLate(r: { status: string; needed_by?: string | null }, today: string): number {
  if (!r.needed_by || !isOpen(r.status) || r.status === 'awaiting_release') return 0
  const diff = Math.round((Date.parse(today) - Date.parse(r.needed_by)) / 86_400_000)
  return diff > 0 ? diff : 0
}

// ---------------------------------------------------------------- linhas vindas da API
export interface PurchaseRequestRow {
  id: string
  work_id: string | null
  item: string
  quantity: number
  unit: string | null
  notes: string | null
  urgency: Urgency
  needed_by: string | null
  status: PurchaseStatus
  requested_by: string | null
  supplier: string | null
  quoted_value?: number | null
  final_value?: number | null
  invoice_number: string | null
  /** Foto ou PDF da nota fiscal (bucket privado; só Admin e Financeiro abrem). */
  invoice_file_path?: string | null
  invoice_file_name?: string | null
  invoice_file_type?: string | null
  purchased_at: string | null
  finance_notes: string | null
  handled_by: string | null
  created_at: string
  status_changed_at?: string | null
  quote_round: number
  approved_quote_id: string | null
  approver_id: string | null
  decided_at: string | null
  admin_notes: string | null
  payment_mode: PaymentMode | null
  payment_released_at: string | null
  payment_released_by: string | null
  received_at: string | null
  received_by: string | null
  receipt_notes: string | null
  closed_at: string | null
  works?: { id: string; name: string } | null
  requester?: { full_name: string | null; email: string | null; role?: string | null } | null
  handler?: { full_name: string | null; email: string | null } | null
  approver?: { full_name: string | null; email: string | null } | null
}

export interface PurchaseQuoteRow {
  id: string
  request_id: string
  round: number
  supplier: string
  quoted_value: number
  delivery_days: number | null
  payment_mode: PaymentMode
  payment_terms: string | null
  notes: string | null
  created_by: string | null
  created_at: string
}
