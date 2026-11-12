/**
 * Filtros do Dashboard: casas (obras), situação, responsável e período (valores financeiros).
 * Funções puras; as datas são "YYYY-MM-DD" (sem horário), tratadas em UTC para não deslocar o dia.
 */
export type PeriodPreset = 'all' | 'month' | 'last_month' | '3m' | 'year' | 'custom'

export interface DashboardFilters {
  /** Casas escolhidas; vazio = todas. */
  workIds: string[]
  /** 'all', um status da obra ou 'risk' (prazo vencido e não finalizada). */
  status: string
  /** Responsável (engenheiro) da obra; 'all' = qualquer. */
  manager: string
  /** Período aplicado aos valores financeiros (receitas e despesas). */
  period: PeriodPreset
  from: string
  to: string
}

export const EMPTY_FILTERS: DashboardFilters = {
  workIds: [],
  status: 'all',
  manager: 'all',
  period: 'all',
  from: '',
  to: '',
}

export interface ObraLike {
  id: string
  status?: string | null
  manager?: string | null
  end_date_planned?: string | null
}

export interface Range {
  from: string | null
  to: string | null
}

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()

/** Intervalo (inclusive) de cada período; "todo o período" é aberto dos dois lados. */
export function periodRange(preset: PeriodPreset, today: string, from = '', to = ''): Range {
  const [y, m] = today.split('-').map(Number)
  switch (preset) {
    case 'month':
      return { from: iso(y, m, 1), to: iso(y, m, lastDay(y, m)) }
    case 'last_month': {
      const py = m === 1 ? y - 1 : y
      const pm = m === 1 ? 12 : m - 1
      return { from: iso(py, pm, 1), to: iso(py, pm, lastDay(py, pm)) }
    }
    case '3m': {
      // três meses de calendário, contando o atual
      const total = y * 12 + (m - 1) - 2
      const sy = Math.floor(total / 12)
      const sm = (total % 12) + 1
      return { from: iso(sy, sm, 1), to: iso(y, m, lastDay(y, m)) }
    }
    case 'year':
      return { from: iso(y, 1, 1), to: iso(y, 12, 31) }
    case 'custom':
      return { from: from || null, to: to || null }
    default:
      return { from: null, to: null }
  }
}

export const isOpenRange = (r: Range) => r.from === null && r.to === null

/** A data está dentro do intervalo? Sem data só entra se o intervalo for aberto. */
export function inPeriod(date: string | null | undefined, r: Range): boolean {
  if (isOpenRange(r)) return true
  if (!date) return false
  const d = date.slice(0, 10)
  if (r.from && d < r.from) return false
  if (r.to && d > r.to) return false
  return true
}

/** Há filtro que restringe quais obras entram (casa, situação ou responsável)? */
export const hasObraFilter = (f: DashboardFilters) => f.workIds.length > 0 || f.status !== 'all' || f.manager !== 'all'

export const hasPeriodFilter = (f: DashboardFilters) => f.period !== 'all' && !isOpenRange(periodRange(f.period, '2000-01-01', f.from, f.to))

/** Algum filtro ativo (para o botão "Limpar filtros"). */
export const hasAnyFilter = (f: DashboardFilters) => hasObraFilter(f) || f.period !== 'all'

/** Obras que passam nos filtros de casa, situação e responsável. */
export function filterObras<T extends ObraLike>(obras: T[], f: DashboardFilters, today: string): T[] {
  return obras.filter((o) => {
    if (f.workIds.length > 0 && !f.workIds.includes(o.id)) return false
    if (f.manager !== 'all' && (o.manager ?? '').trim() !== f.manager) return false
    if (f.status === 'risk') {
      if (!(o.end_date_planned && o.end_date_planned < today && o.status !== 'finished')) return false
    } else if (f.status !== 'all' && o.status !== f.status) return false
    return true
  })
}

/**
 * Registros ligados a uma obra (despesas, receitas, materiais...): com filtro de obra, só os das obras escolhidas;
 * sem filtro de obra entram todos (inclusive os sem obra).
 */
export function belongsToFiltered(workId: string | null | undefined, filteredIds: Set<string>, f: DashboardFilters): boolean {
  if (!hasObraFilter(f)) return true
  return !!workId && filteredIds.has(workId)
}

/** Responsáveis distintos das obras (sem espaços sobrando), em ordem alfabética. */
export function distinctManagers(obras: { manager?: string | null }[]): string[] {
  const set = new Set<string>()
  obras.forEach((o) => {
    const m = (o.manager ?? '').trim()
    if (m) set.add(m)
  })
  return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}
