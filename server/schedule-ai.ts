/**
 * Função "analyze-schedule": lê as etapas do Cronograma de uma obra (pelo RLS do usuário), monta os fatos e pede ao
 * Gemini a análise de prioridades. Sem chave, sem resposta ou com resposta inválida, devolve a análise por regras
 * (server/schedule-analysis.ts). O responsável pode recusar uma sugestão e dizer o motivo (tabela schedule_ai_notes):
 * as observações entram em todas as análises seguintes.
 * Só vão para a IA nomes de etapas, datas, progresso e observações curtas: sem valores em dinheiro nem nomes de pessoas.
 */
import { withCaller, type Caller } from './db.js'
import { tierOf } from './mask.js'
import {
  RESPONSE_SCHEMA,
  SYSTEM_PROMPT,
  analyzeByRules,
  buildPrompt,
  validateAi,
  type NoteIn,
  type ScheduleAnalysis,
  type StageIn,
  type WorkIn,
} from './schedule-analysis.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Data de hoje no fuso de Brasília (AAAA-MM-DD). */
export const todayBR = (now = new Date()) => now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

/**
 * Modelos tentados em ordem (o Google aposenta modelos com frequência: o primeiro pode sair do ar).
 * GEMINI_MODEL, se definido, vai na frente. Cada tentativa tem seu prazo; a função da Vercel dura até 60 s.
 */
// o modelo "lite" fica por último: tem cota própria e responde mesmo quando os outros estouraram a cota
export const GEMINI_MODELS = ['gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite']
const ATTEMPT_MS = [28_000, 16_000, 14_000]

export function geminiModels(env = process.env.GEMINI_MODEL): string[] {
  const first = env?.trim()
  return [...new Set([...(first ? [first] : []), ...GEMINI_MODELS])].slice(0, ATTEMPT_MS.length)
}

/** Chave como foi colada na Vercel: sem espaços, quebra de linha nem aspas nas pontas. */
export const cleanKey = (raw?: string): string => (raw ?? '').trim().replace(/^["']+|["']+$/g, '').trim()

/** Tira chaves (a de verdade e qualquer coisa com cara de chave do Google) de um texto técnico antes de mostrá-lo. */
export function redact(text: string, key = cleanKey(process.env.GEMINI_API_KEY)): string {
  let out = text
  if (key.length >= 8) out = out.split(key).join('[chave]')
  return out.replace(/AIza[\w-]{20,}|AQ\.[\w-]{20,}/g, '[chave]')
}

/** Chama o Gemini pedindo JSON no formato de RESPONSE_SCHEMA. Lança Error (sem a chave na mensagem) se falhar. */
export async function callGemini(prompt: string): Promise<unknown> {
  const key = cleanKey(process.env.GEMINI_API_KEY)
  if (!key) throw new Error('GEMINI_API_KEY está vazia')
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
  })
  const attempts: string[] = []
  const models = geminiModels()
  for (let i = 0; i < models.length; i++) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(models[i])}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body,
        signal: AbortSignal.timeout(ATTEMPT_MS[i]),
      })
      if (!r.ok) {
        // modelo aposentado, sobrecarregado, chave recusada ou sem cota: guarda o motivo e tenta o próximo
        const raw = await r.text().catch(() => '')
        let why = ''
        try {
          why = String((JSON.parse(raw) as { error?: { message?: string } }).error?.message ?? '')
        } catch {
          why = raw
        }
        attempts.push(`${models[i]} respondeu ${r.status}${why ? ': ' + why.replace(/\s+/g, ' ').slice(0, 160) : ''}`)
        continue
      }
      const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
      const text = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('')
      if (!text.trim()) {
        attempts.push(`${models[i]} respondeu sem texto`)
        continue
      }
      return JSON.parse(text)
    } catch (e) {
      attempts.push(`${models[i]}: ${(e as Error).name === 'TimeoutError' ? 'demorou demais' : (e as Error).message}`)
    }
  }
  throw new Error(redact(attempts.join(' | ') || 'Gemini sem resposta', key))
}

/**
 * Orquestra a análise. A IA entra por parâmetro (nos testes vai uma falsa): sem IA, falha ou resposta inválida,
 * volta a análise por regras com um aviso.
 */
export async function runAnalysis(
  stages: StageIn[],
  work: WorkIn,
  today: string,
  notes: NoteIn[],
  ai: ((prompt: string) => Promise<unknown>) | null,
  now = new Date(),
): Promise<ScheduleAnalysis> {
  const rules = analyzeByRules(stages, work, today, now, notes)
  if (!ai) return { ...rules, notice: 'A IA (Gemini) ainda não está configurada neste ambiente: esta é a análise por regras.' }
  try {
    const raw = await ai(buildPrompt(stages, work, today, rules, notes))
    const out = validateAi(raw, stages, work, today, rules, now, notes)
    if (out) return out
    return { ...rules, notice: 'A IA devolveu uma resposta que não deu para usar: esta é a análise por regras.' }
  } catch (e) {
    const detail = redact((e as Error).message ?? '').slice(0, 400)
    console.error('[analyze-schedule] IA falhou:', detail)
    // o motivo técnico (sem chave) vai junto, só para o admin e o gestor, que são quem usa esta função
    return { ...rules, notice: 'A IA não respondeu agora: esta é a análise por regras. Tente de novo em instantes.', detail }
  }
}

export async function analyzeSchedule(caller: Caller, body: { workId?: unknown }): Promise<ScheduleAnalysis | { error: string }> {
  const workId = typeof body.workId === 'string' ? body.workId : ''
  if (!UUID_RE.test(workId)) return { error: 'Obra inválida.' }
  const tier = await tierOf(caller)
  if (tier !== 'admin' && tier !== 'gestor') return { error: 'Somente o admin e o gestor analisam o cronograma com a IA.' }

  const data = await withCaller(caller, async (c) => {
    const w = await c.query("select to_char(end_date_planned, 'YYYY-MM-DD') as end_date_planned from public.works where id = $1", [workId])
    if (!w.rows[0]) return null
    const st = await c.query(
      `select id, name, manager, to_char(start_date, 'YYYY-MM-DD') as start_date,
              to_char(end_date_planned, 'YYYY-MM-DD') as end_date_planned,
              to_char(end_date_real, 'YYYY-MM-DD') as end_date_real,
              progress_percentage, status, notes
         from public.work_stages where work_id = $1 order by start_date nulls last, name`,
      [workId],
    )
    return { work: w.rows[0] as WorkIn, stages: st.rows as StageIn[] }
  })
  if (!data) return { error: 'Obra não encontrada.' }
  if (data.stages.length === 0) return { error: 'Esta obra ainda não tem etapas no Cronograma para analisar.' }

  // observações do responsável (se a tabela ainda não existir, a análise segue sem elas)
  let notes: NoteIn[] = []
  try {
    notes = await withCaller(caller, async (c) => {
      const r = await c.query(
        `select stage_id, stage_name, kind, from_list, reason from public.schedule_ai_notes
          where work_id = $1 and active order by created_at desc limit 30`,
        [workId],
      )
      return r.rows as NoteIn[]
    })
  } catch (e) {
    if ((e as { code?: string }).code !== '42P01') throw e
  }

  return runAnalysis(data.stages, data.work, todayBR(), notes, cleanKey(process.env.GEMINI_API_KEY) ? callGemini : null)
}
