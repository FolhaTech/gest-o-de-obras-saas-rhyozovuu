/**
 * Regras dos alertas de equipamentos (Materiais > Equipamentos).
 *  - Manutenção a cada N meses (padrão 6), contados da última manutenção; sem nenhuma, da data da compra.
 *  - A partir de 5 manutenções: alerta para movimentar o equipamento (outra obra/uso) ou comprar um novo.
 * As datas são "YYYY-MM-DD" (sem horário), tratadas em UTC para não deslocar o dia.
 */
export const DEFAULT_INTERVAL_MONTHS = 6
/** Quantidade de manutenções a partir da qual se avalia movimentar ou comprar outro equipamento. */
export const REPLACE_THRESHOLD = 5
/** Quantos dias antes do vencimento o aviso "manutenção próxima" aparece. */
export const DUE_SOON_DAYS = 30

export interface EquipmentLike {
  purchase_date?: string | null
  last_maintenance_date?: string | null
  initial_maintenance_count?: number | null
  maintenance_interval_months?: number | null
  status?: string | null
  created_at?: string | null
  equipment_maintenances?: { maintenance_date: string }[] | null
}

export type MaintenanceAlert = 'overdue' | 'soon' | 'ok' | 'none'

export interface EquipmentStatus {
  /** Manutenções já feitas: as anteriores ao cadastro + as registradas. */
  count: number
  lastDate: string | null
  nextDate: string | null
  /** Dias até a próxima manutenção (negativo = vencida). */
  daysToNext: number | null
  maintenanceAlert: MaintenanceAlert
  /** Chegou ao limite de manutenções: movimentar ou comprar outro. */
  replaceAlert: boolean
}

const toUtc = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** Soma meses sem estourar o fim do mês (31/08 + 6 meses = 28/02). */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const total = m - 1 + months
  const year = y + Math.floor(total / 12)
  const month = ((total % 12) + 12) % 12
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return toIso(Date.UTC(year, month, Math.min(d, last)))
}

export function daysBetween(fromIso: string, toIsoDate: string): number {
  return Math.round((toUtc(toIsoDate) - toUtc(fromIso)) / 86_400_000)
}

/** Data de hoje no fuso local, em "YYYY-MM-DD". */
export function todayISO(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

export function equipmentStatus(eq: EquipmentLike, today: string = todayISO()): EquipmentStatus {
  const logged = eq.equipment_maintenances ?? []
  const count = Math.max(0, eq.initial_maintenance_count ?? 0) + logged.length
  const dates = [eq.last_maintenance_date, ...logged.map((m) => m.maintenance_date)].filter(
    (d): d is string => !!d,
  )
  const lastDate = dates.length ? dates.reduce((a, b) => (toUtc(a) >= toUtc(b) ? a : b)) : null
  const replaceAlert = eq.status !== 'retired' && count >= REPLACE_THRESHOLD

  if (eq.status === 'retired') {
    return { count, lastDate, nextDate: null, daysToNext: null, maintenanceAlert: 'none', replaceAlert }
  }
  const base = lastDate ?? eq.purchase_date ?? (eq.created_at ? eq.created_at.slice(0, 10) : null)
  if (!base) {
    return { count, lastDate, nextDate: null, daysToNext: null, maintenanceAlert: 'none', replaceAlert }
  }
  const interval = eq.maintenance_interval_months && eq.maintenance_interval_months > 0 ? eq.maintenance_interval_months : DEFAULT_INTERVAL_MONTHS
  const nextDate = addMonths(base, interval)
  const daysToNext = daysBetween(today, nextDate)
  const maintenanceAlert: MaintenanceAlert = daysToNext < 0 ? 'overdue' : daysToNext <= DUE_SOON_DAYS ? 'soon' : 'ok'
  return { count, lastDate, nextDate, daysToNext, maintenanceAlert, replaceAlert }
}

/** Texto curto do prazo da próxima manutenção. */
export function describeDue(daysToNext: number | null): string {
  if (daysToNext === null) return '-'
  if (daysToNext < 0) return `vencida há ${Math.abs(daysToNext)} dia(s)`
  if (daysToNext === 0) return 'vence hoje'
  return `em ${daysToNext} dia(s)`
}
