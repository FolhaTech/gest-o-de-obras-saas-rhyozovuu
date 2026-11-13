/**
 * Faturamento > Pagamento (Equipe): pagamento semanal calculado pela presença.
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
