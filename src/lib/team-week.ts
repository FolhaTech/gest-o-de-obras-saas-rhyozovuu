/**
 * Financeiro > Pagamento (Equipe): pagamento semanal calculado pela presença.
 * A semana vai de sábado a sexta (a mesma da tela de Presença). O banco calcula e guarda o valor (migração 26);
 * aqui ficam as datas, os textos e o agrupamento por semana e por pessoa.
 */
const DAY_MS = 86_400_000

const parse = (iso: string): number => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
const fmtISO = (ms: number): string => new Date(ms).toISOString().slice(0, 10)
const br = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/** Hoje, no relógio do aparelho, como 'yyyy-mm-dd'. */
export function localTodayISO(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Soma (ou subtrai) dias de uma data 'yyyy-mm-dd'. */
export const addDaysISO = (iso: string, n: number): string => fmtISO(parse(iso) + n * DAY_MS)

/** Sábado que abre a semana da data (sábado a sexta). */
export function weekStartOf(iso: string): string {
  const dow = new Date(parse(iso)).getUTCDay() // 0 = domingo ... 6 = sábado
  return addDaysISO(iso, -((dow + 1) % 7))
}

/** Sexta-feira, último dia da semana. */
export const weekEndOf = (weekStart: string): string => addDaysISO(weekStart, 6)

/** "Semana 07/03 a 13/03". */
export const weekLabel = (weekStart: string): string => `Semana ${br(weekStart)} a ${br(weekEndOf(weekStart))}`

export type WeekPhase = 'future' | 'running' | 'payable'

/**
 * Em que pé está a semana: ainda não começou, em andamento (vai contando a presença) ou fechada.
 * O pagamento é liberado na sexta-feira, último dia da semana (o banco confere de novo).
 */
export function weekPhase(weekStart: string, today: string): WeekPhase {
  if (today < weekStart) return 'future'
  return today >= weekEndOf(weekStart) ? 'payable' : 'running'
}

export const isWeekPayable = (weekStart: string, today: string): boolean => weekPhase(weekStart, today) === 'payable'

/** Texto curto da situação da semana. */
export function weekPhaseText(weekStart: string, today: string): string {
  switch (weekPhase(weekStart, today)) {
    case 'future':
      return `Começa em ${br(weekStart)}`
    case 'running':
      return `Em andamento: fecha na sexta ${br(weekEndOf(weekStart))}`
    default:
      return 'Semana fechada: pagar'
  }
}

/** Valor da semana: dias presentes x diária + extra semanal (extra negativo é desconto). */
export const weekAmount = (days: number, rate: number, extra: number): number =>
  Math.round(((Number(days) || 0) * (Number(rate) || 0) + (Number(extra) || 0)) * 100) / 100

export interface WeeklyPayment {
  member_name: string
  week_start: string | null
  status: 'pending' | 'paid'
  payment_amount: number | string
}

export interface WeekGroup<T extends WeeklyPayment> {
  weekStart: string
  /** Pessoas da semana, em ordem alfabética (pendentes antes dos pagos da mesma pessoa). */
  rows: T[]
  /** Soma do que falta pagar na semana. */
  pendingTotal: number
  pendingCount: number
  paidCount: number
}

/** Agrupa os pagamentos calculados por semana (a mais recente primeiro) e, dentro dela, por pessoa. */
export function groupByWeek<T extends WeeklyPayment>(list: T[]): WeekGroup<T>[] {
  const map = new Map<string, T[]>()
  for (const p of list) {
    if (!p.week_start) continue
    const key = p.week_start.slice(0, 10)
    map.set(key, [...(map.get(key) ?? []), p])
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([weekStart, rows]) => {
      const sorted = [...rows].sort(
        (a, b) =>
          a.member_name.trim().localeCompare(b.member_name.trim(), 'pt-BR') ||
          (a.status === b.status ? 0 : a.status === 'pending' ? -1 : 1),
      )
      const pending = sorted.filter((r) => r.status === 'pending')
      return {
        weekStart,
        rows: sorted,
        pendingTotal: Math.round(pending.reduce((s, r) => s + Number(r.payment_amount), 0) * 100) / 100,
        pendingCount: pending.length,
        paidCount: sorted.length - pending.length,
      }
    })
}

// ---------------------------------------------------------------- conferência da semana (toda sexta)
export const WEEKDAY_SHORT = ['Sáb', 'Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex'] as const

/** As 7 datas da semana, de sábado a sexta. */
export const weekDates = (weekStart: string): string[] => Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i))

/** "14/11" a partir de 'yyyy-mm-dd'. */
export const dayMonth = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

export type ConferenceState = 'future' | 'running' | 'awaiting' | 'approved'

/**
 * Em que pé está a conferência: a semana ainda não começou, está em andamento (a conferência abre na sexta, último dia),
 * aguarda o admin conferir e aprovar, ou já foi aprovada (o financeiro pode pagar).
 */
export function conferenceState(weekStart: string, today: string, approved: boolean): ConferenceState {
  const phase = weekPhase(weekStart, today)
  if (phase === 'future') return 'future'
  if (phase === 'running') return 'running'
  return approved ? 'approved' : 'awaiting'
}

/** Semanas fechadas que ainda esperam a aprovação do admin (sem repetir, da mais antiga para a mais recente). */
export function weeksAwaitingApproval(weekStarts: string[], approved: ReadonlySet<string>, today: string): string[] {
  const set = new Set<string>()
  for (const w of weekStarts) {
    const key = w.slice(0, 10)
    if (isWeekPayable(key, today) && !approved.has(key)) set.add(key)
  }
  return [...set].sort()
}

/** O financeiro pode pagar a semana: já fechou E o admin aprovou. */
export const canPayWeek = (weekStart: string, today: string, approved: ReadonlySet<string>): boolean =>
  isWeekPayable(weekStart.slice(0, 10), today) && approved.has(weekStart.slice(0, 10))

export interface GridMember {
  id: string
  name: string
  role?: string | null
  daily_cost?: number | string | null
  payment_type?: string | null
  status?: string | null
}
export interface GridRecord {
  worker_id: string
  date: string
  is_present: boolean
}
export interface GridExtra {
  worker_id: string
  week_start_date: string
  extra_value: number | string | null
}
export type DayMark = 'present' | 'absent' | 'none'

export interface GridRow {
  member: GridMember
  /** Uma marca por dia, de sábado a sexta. */
  marks: DayMark[]
  days: number
  extra: number
  monthly: boolean
  /** Dias x diária + extra (mensalista: 0, é contrato). */
  total: number
  /** Ativo, não mensalista e sem nenhuma marcação na semana: conferir se faltou marcar. */
  unmarked: boolean
}

/**
 * Grade de presença da semana para conferir: uma linha por pessoa (ativos, e inativos que tenham marcação na semana), com a
 * marca de cada dia, os dias presentes, o extra e o valor da semana. Ordem alfabética.
 */
export function presenceGrid(members: GridMember[], records: GridRecord[], extras: GridExtra[], weekStart: string): GridRow[] {
  const dates = weekDates(weekStart)
  const byWorker = new Map<string, Map<string, boolean>>()
  for (const r of records) {
    const d = r.date.slice(0, 10)
    if (!dates.includes(d)) continue
    const m = byWorker.get(r.worker_id) ?? new Map<string, boolean>()
    m.set(d, r.is_present)
    byWorker.set(r.worker_id, m)
  }
  const rows: GridRow[] = []
  for (const member of members) {
    const marksOf = byWorker.get(member.id)
    const active = (member.status ?? 'active') === 'active'
    if (!active && !marksOf) continue
    const marks: DayMark[] = dates.map((d) => (marksOf?.has(d) ? (marksOf.get(d) ? 'present' : 'absent') : 'none'))
    const days = marks.filter((m) => m === 'present').length
    const extra = extras
      .filter((e) => e.worker_id === member.id && e.week_start_date.slice(0, 10) === weekStart)
      .reduce((s, e) => s + (Number(e.extra_value) || 0), 0)
    const monthly = (member.payment_type ?? 'daily') === 'monthly'
    rows.push({
      member,
      marks,
      days,
      extra,
      monthly,
      total: monthly ? 0 : Math.max(0, weekAmount(days, Number(member.daily_cost) || 0, extra)),
      unmarked: active && !monthly && !marksOf,
    })
  }
  return rows.sort((a, b) => a.member.name.trim().localeCompare(b.member.name.trim(), 'pt-BR'))
}

/** Totais da grade: dias presentes, valor da semana e quantas pessoas têm valor a pagar. */
export function gridTotals(rows: GridRow[]): { days: number; total: number; payees: number } {
  return {
    days: rows.reduce((s, r) => s + r.days, 0),
    total: Math.round(rows.reduce((s, r) => s + r.total, 0) * 100) / 100,
    payees: rows.filter((r) => r.total > 0).length,
  }
}
