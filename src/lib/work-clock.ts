/**
 * Check-in / check-out das manutenções das casas: horas de entrada e saída e o tempo que a pessoa ficou.
 * Os horários são mostrados no fuso de Brasília.
 */
const TZ = 'America/Sao_Paulo'

/** "3h 28min", "45min", "menos de 1min" (aceita ms). */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '-'
  const totalMin = Math.floor(ms / 60_000)
  if (totalMin < 1) return 'menos de 1min'
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h ${String(m).padStart(2, '0')}min`
}

export interface ClockLike {
  status?: string | null
  check_in_at?: string | null
  check_out_at?: string | null
}

/** Tempo da permanência: saída − entrada; em andamento, agora − entrada. Nulo sem hora de entrada. */
export function stayMs(m: ClockLike, now: number = Date.now()): number | null {
  if (!m.check_in_at) return null
  const start = Date.parse(m.check_in_at)
  const end = m.check_out_at ? Date.parse(m.check_out_at) : m.status === 'in_progress' ? now : null
  if (end === null || Number.isNaN(start) || Number.isNaN(end)) return null
  return Math.max(0, end - start)
}

/** "08:12" no fuso de Brasília. */
export function clockTime(iso: string | null | undefined): string {
  if (!iso) return '-'
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
}

/** "HH:mm" (campo de hora) -> ISO, a partir do dia "YYYY-MM-DD" no fuso de Brasília (UTC-3, sem horário de verão). */
export function toIsoFromLocal(date: string, time: string): string {
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  return new Date(Date.UTC(y, mo - 1, d, h + 3, mi, 0)).toISOString()
}

/** ISO -> "HH:mm" do campo de hora (fuso de Brasília). */
export function toTimeInput(iso: string | null | undefined): string {
  if (!iso) return ''
  return clockTime(iso)
}

/** Soma dos tempos (ms) das manutenções concluídas com entrada e saída. */
export function totalStayMs(list: ClockLike[]): number {
  return list.reduce((sum, m) => (m.check_out_at ? sum + (stayMs(m) ?? 0) : sum), 0)
}
