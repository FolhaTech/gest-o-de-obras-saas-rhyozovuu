/**
 * Regras da página Veículos: vencimentos (licenciamento, seguro), revisão por data ou km e consumo de combustível.
 * As datas são "YYYY-MM-DD" (sem horário), tratadas em UTC para não deslocar o dia.
 */
/** Dias antes do vencimento em que o aviso aparece. */
export const EXPIRY_SOON_DAYS = 30
/** Faltando tantos km para a revisão, o aviso aparece. */
export const SERVICE_SOON_KM = 500

const toUtc = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

export function daysUntil(today: string, target: string): number {
  return Math.round((toUtc(target) - toUtc(today)) / 86_400_000)
}

export function todayISO(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

export type DueState = 'overdue' | 'soon' | 'ok' | 'none'

export interface Due {
  state: DueState
  /** Dias até o vencimento (negativo = vencido). */
  days: number | null
}

/** Vencimento de documento (licenciamento, seguro). */
export function expiryState(date: string | null | undefined, today: string = todayISO()): Due {
  if (!date) return { state: 'none', days: null }
  const days = daysUntil(today, date)
  return { state: days < 0 ? 'overdue' : days <= EXPIRY_SOON_DAYS ? 'soon' : 'ok', days }
}

export function describeExpiry(days: number | null): string {
  if (days === null) return '-'
  if (days < 0) return `vencido há ${Math.abs(days)} dia(s)`
  if (days === 0) return 'vence hoje'
  return `vence em ${days} dia(s)`
}

export interface MaintenanceLike {
  maintenance_date: string
  next_due_date?: string | null
  next_due_km?: number | null
}

export interface ServiceDue {
  state: DueState
  nextDate: string | null
  nextKm: number | null
  daysLeft: number | null
  kmLeft: number | null
}

/**
 * Próxima revisão: vale a manutenção mais recente que informou "próxima revisão" (data e/ou km).
 * Vencida se a data passou OU o km já foi atingido; "próxima" se faltam até 30 dias ou 500 km.
 */
export function serviceDue(
  maintenances: MaintenanceLike[],
  odometerKm: number,
  today: string = todayISO(),
): ServiceDue {
  const withPlan = maintenances
    .filter((m) => m.next_due_date || (m.next_due_km !== null && m.next_due_km !== undefined))
    .sort((a, b) => toUtc(b.maintenance_date) - toUtc(a.maintenance_date))[0]
  if (!withPlan) return { state: 'none', nextDate: null, nextKm: null, daysLeft: null, kmLeft: null }
  const nextDate = withPlan.next_due_date ?? null
  const nextKm = withPlan.next_due_km ?? null
  const daysLeft = nextDate ? daysUntil(today, nextDate) : null
  const kmLeft = nextKm !== null ? nextKm - odometerKm : null
  const overdue = (daysLeft !== null && daysLeft < 0) || (kmLeft !== null && kmLeft <= 0)
  const soon = (daysLeft !== null && daysLeft <= EXPIRY_SOON_DAYS) || (kmLeft !== null && kmLeft <= SERVICE_SOON_KM)
  return { state: overdue ? 'overdue' : soon ? 'soon' : 'ok', nextDate, nextKm, daysLeft, kmLeft }
}

export interface FuelLike {
  receipt_date: string
  liters: number | string
  total_value?: number | string | null
  odometer_km?: number | null
}

export interface FuelStats {
  count: number
  liters: number
  /** Soma dos valores das notas (zero se o usuário não vê valores). */
  spent: number
  /** Consumo médio em km/L (tanque cheio a tanque cheio); null sem dados suficientes. */
  kmPerLiter: number | null
  /** Valor médio do litro. */
  avgPricePerLiter: number | null
}

/**
 * Consumo médio: com o km de cada abastecimento, (km do último − km do primeiro) ÷ litros abastecidos depois
 * do primeiro (o primeiro enche o tanque que serve de ponto de partida). Precisa de 2+ notas com km.
 */
export function fuelStats(receipts: FuelLike[]): FuelStats {
  const liters = receipts.reduce((s, r) => s + (Number(r.liters) || 0), 0)
  const spent = receipts.reduce((s, r) => s + (Number(r.total_value) || 0), 0)
  const withKm = receipts
    .filter((r) => r.odometer_km !== null && r.odometer_km !== undefined)
    .sort((a, b) => (a.odometer_km as number) - (b.odometer_km as number))
  let kmPerLiter: number | null = null
  if (withKm.length >= 2) {
    const km = (withKm[withKm.length - 1].odometer_km as number) - (withKm[0].odometer_km as number)
    const used = withKm.slice(1).reduce((s, r) => s + (Number(r.liters) || 0), 0)
    if (km > 0 && used > 0) kmPerLiter = km / used
  }
  return {
    count: receipts.length,
    liters,
    spent,
    kmPerLiter,
    avgPricePerLiter: liters > 0 && spent > 0 ? spent / liters : null,
  }
}

/** Placa em maiúsculas, sem espaços nas pontas. */
export const normalizePlate = (p: string) => p.trim().toUpperCase()
