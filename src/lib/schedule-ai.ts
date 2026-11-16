/**
 * Cronograma com IA: tipos da resposta da função "analyze-schedule" (server/schedule-analysis.ts) e textos da tela.
 */
export type NoteFrom = 'do_first' | 'can_wait' | 'in_parallel'

export interface AiItem {
  id: string
  name: string
  reason: string
}
export interface AiGroup {
  ids: string[]
  names: string[]
  reason: string
}
export interface AiAttention {
  id: string | null
  name: string | null
  text: string
}

export interface ScheduleAnalysis {
  source: 'ai' | 'rules'
  generated_at: string
  today: string
  summary: string
  forecast: { planned_end: string | null; projected_end: string | null; days_delta: number | null }
  counts: { total: number; done: number; in_progress: number; pending: number; overdue: number; undated: number }
  do_first: AiItem[]
  in_parallel: AiGroup[]
  can_wait: AiItem[]
  attention: AiAttention[]
  speedup_tips: string[]
  adaptation?: string
  notes_used: number
  notice?: string
}

/** Observação do responsável guardada (tabela schedule_ai_notes). */
export interface AiNote {
  id: string
  work_id: string
  stage_id: string | null
  stage_name: string | null
  kind: 'rejected' | 'constraint'
  from_list: NoteFrom | null
  reason: string
  active: boolean
  created_at: string
}

export const MIN_REASON = 3
export const MAX_REASON = 500

/** Pergunta da janela de recusa, conforme a lista da sugestão. */
export const REFUSE_TITLE: Record<NoteFrom, string> = {
  do_first: 'Por que você não vai fazer isso agora?',
  can_wait: 'Por que isso não pode ficar para depois?',
  in_parallel: 'Por que essas etapas não podem andar juntas?',
}

/** Como a observação aparece na lista "O que você já informou à IA". */
export const NOTE_FROM_LABEL: Record<NoteFrom, string> = {
  do_first: 'não vai fazer agora',
  can_wait: 'não pode esperar',
  in_parallel: 'não pode ser em paralelo',
}

/** O motivo serve? (entre 3 e 500 caracteres, sem contar espaços nas pontas) */
export function reasonProblem(reason: string): string | null {
  const t = reason.trim()
  if (t.length < MIN_REASON) return 'Explique o motivo em poucas palavras (pelo menos 3 letras).'
  if (t.length > MAX_REASON) return `O motivo tem ${t.length} letras. O limite é ${MAX_REASON}.`
  return null
}

/** AAAA-MM-DD para DD/MM/AAAA. */
export function brDateFull(s?: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s ?? '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '-'
}

/** Frase da previsão de término (ou nulo se não há como prever). */
export function forecastText(f: ScheduleAnalysis['forecast']): string | null {
  if (!f.projected_end) return null
  const when = brDateFull(f.projected_end)
  if (f.days_delta === null || !f.planned_end) return `Previsão de término: ${when}.`
  if (f.days_delta > 0) return `Previsão de término: ${when}, ${f.days_delta} ${f.days_delta === 1 ? 'dia' : 'dias'} depois do prazo da obra (${brDateFull(f.planned_end)}).`
  return `Previsão de término: ${when}, dentro do prazo da obra (${brDateFull(f.planned_end)}).`
}
