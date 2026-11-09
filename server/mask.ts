/**
 * Valores (R$) só para o administrador.
 * As tabelas de valor puro (receitas, despesas, Airbnb, valores dos itens alocados) são fechadas por RLS.
 * Nas tabelas mistas (obras, materiais, equipe, contratos...) a coluna de valor não pode ser escondida por
 * linha, então a API remove essas chaves das respostas e das gravações de quem não é administrador, e recusa
 * filtros/ordenações por elas (senão dava para descobrir o valor por tentativa: ?contracted_value=gt.1000).
 */
import { ApiError } from './http.js'
import { withAdmin, type Caller } from './db.js'

/** Colunas de valor financeiro: escondidas de Gestor e Prestador. */
export const VALUE_KEYS = new Set([
  'contracted_value',
  'budget_planned',
  'entry_value',
  'entry_payment_method',
  'payment_method',
  'installments',
  'unit_price',
  'unit_cost',
  'total_cost',
  'total_value',
  'daily_cost',
  'daily_rate',
  'fixed_salary',
  'payment_type',
  'extra_value',
  'rental_cost',
  'cost_period',
  'reward_amount',
])
/** Escondida só do Prestador (o Gestor tem as mesmas permissões do administrador). */
export const PRESTADOR_ONLY_KEYS = new Set(['pix_key'])

export type Tier = 'admin' | 'gestor' | 'restrito'

const GESTOR_ALIASES = new Set(['gestor', 'gerente', 'manager', 'engineer', 'engenheiro'])
const cache = new Map<string, { tier: Tier; at: number }>()
const TTL_MS = Number(process.env.ROLE_CACHE_MS ?? 15_000)

/** Papel do chamador (cache curto: uma troca de papel vale em até 15 s). */
export async function tierOf(caller: Caller): Promise<Tier> {
  if (caller.role !== 'authenticated' || !caller.sub) return 'restrito'
  const hit = cache.get(caller.sub)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.tier
  const raw = await withAdmin(async (c) => {
    const r = await c.query('select lower(btrim(role)) as role from public.profiles where id = $1', [caller.sub])
    return (r.rows[0]?.role as string | undefined) ?? ''
  })
  const tier: Tier = raw === 'admin' ? 'admin' : GESTOR_ALIASES.has(raw) ? 'gestor' : 'restrito'
  cache.set(caller.sub, { tier, at: Date.now() })
  return tier
}

const hidden = (tier: Tier) => (k: string) => VALUE_KEYS.has(k) || (tier === 'restrito' && PRESTADOR_ONLY_KEYS.has(k))

/** Remove as chaves de valor de qualquer objeto da resposta (inclusive aninhados em embeds). */
export function maskRows<T>(data: T, tier: Tier): T {
  if (tier === 'admin') return data
  const isHidden = hidden(tier)
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {}
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (!isHidden(k)) out[k] = walk(val)
      }
      return out
    }
    return v
  }
  return walk(data) as T
}

/** Gravações de quem não é admin não tocam nas colunas de valor (o formulário não as enxerga, então não pode zerá-las). */
export function stripPayload<T>(body: T, tier: Tier): T {
  if (tier === 'admin') return body
  const isHidden = hidden(tier)
  const strip = (o: unknown) =>
    o && typeof o === 'object' && !Array.isArray(o)
      ? Object.fromEntries(Object.entries(o as Record<string, unknown>).filter(([k]) => !isHidden(k)))
      : o
  return (Array.isArray(body) ? body.map(strip) : strip(body)) as T
}

/** Recusa filtro/ordem/seleção que dependa de coluna de valor (vazaria o valor por inferência). */
export function assertNoValueQuery(sp: URLSearchParams, tier: Tier): void {
  if (tier === 'admin') return
  const isHidden = hidden(tier)
  const mentions = (text: string) => text.split(/[^a-z0-9_]+/i).some((w) => w && isHidden(w))
  for (const [k, v] of sp.entries()) {
    if (k === 'select' || k === 'limit' || k === 'offset' || k === 'on_conflict' || k === 'columns' || k === 'apikey') continue
    if (mentions(k) || (['order', 'or', 'and', 'not.or', 'not.and'].includes(k) && mentions(v))) {
      throw new ApiError(403, '42501', 'Coluna restrita ao administrador', null, null)
    }
  }
}
