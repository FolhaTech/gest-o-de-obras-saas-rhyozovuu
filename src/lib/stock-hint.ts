/**
 * Faturamento > Compras: ao pedir um item, mostra quanto dele já existe no estoque (Materiais).
 * "Estoque" é o estoque geral (materiais sem obra); o que já foi alocado numa obra aparece à parte.
 */
export interface StockMaterial {
  name: string
  unit_of_measure?: string | null
  unidade_nativa?: string | null
  stock_quantity?: number | string | null
  work_id?: string | null
}

export interface StockMatch {
  /** Nome como está no cadastro de Materiais (o primeiro encontrado). */
  name: string
  unit: string
  /** Estoque geral (sem obra). */
  general: number
  /** Já alocado em obras. */
  allocated: number
}

/** Minúsculas, sem acento e com espaços normalizados: "Cimento  CP-II" e "cimento cp-ii" são o mesmo item. */
export function normalizeName(s: string): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Une os cadastros de mesmo nome (o mesmo material pode ter uma linha no estoque geral e outras alocadas). */
export function groupStock(materials: StockMaterial[]): StockMatch[] {
  const map = new Map<string, StockMatch>()
  for (const m of materials) {
    const key = normalizeName(m.name)
    if (!key) continue
    const qty = Number(m.stock_quantity) || 0
    const unit = (m.unidade_nativa || m.unit_of_measure || '').trim()
    const cur = map.get(key) ?? { name: m.name.trim(), unit, general: 0, allocated: 0 }
    if (m.work_id) cur.allocated += qty
    else cur.general += qty
    if (!cur.unit && unit) cur.unit = unit
    map.set(key, cur)
  }
  return [...map.values()]
}

export interface StockLookup {
  /** O item com o mesmo nome (nulo se não está no cadastro). */
  exact: StockMatch | null
  /** Nomes parecidos (um contém o outro), até 3. */
  similar: StockMatch[]
}

const MIN_SEARCH = 3

/** Procura o item digitado no estoque. Texto curto demais não procura. */
export function findStock(item: string, materials: StockMaterial[]): StockLookup {
  const key = normalizeName(item)
  if (key.length < MIN_SEARCH) return { exact: null, similar: [] }
  const groups = groupStock(materials)
  let exact: StockMatch | null = null
  const similar: StockMatch[] = []
  for (const g of groups) {
    const gk = normalizeName(g.name)
    if (gk === key) exact = g
    else if (gk.length >= MIN_SEARCH && (gk.includes(key) || key.includes(gk))) similar.push(g)
  }
  similar.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  return { exact, similar: similar.slice(0, 3) }
}

export type StockLevel = 'enough' | 'partial' | 'empty'

export interface StockAdvice {
  level: StockLevel
  /** Frase para mostrar ao usuário. */
  text: string
  /** Quanto falta (só quando dá para comparar as unidades). */
  missing: number | null
}

const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
const sameUnit = (a: string, b: string) => normalizeName(a) === normalizeName(b)

/**
 * Compara o que está sendo pedido com o estoque geral. Só diz "cobre" ou "faltam" quando a unidade do pedido é a
 * mesma do estoque (saco x kg não se compara).
 */
export function stockAdvice(match: StockMatch, requestedQty: number, requestedUnit: string): StockAdvice {
  const have = `${fmt(match.general)}${match.unit ? ' ' + match.unit : ''}`
  const extra = match.allocated > 0 ? ` (mais ${fmt(match.allocated)}${match.unit ? ' ' + match.unit : ''} já alocado em obras)` : ''
  if (match.general <= 0) {
    return { level: 'empty', text: `Você não tem esse item no estoque${extra}. Pode comprar.`, missing: null }
  }
  const comparable = !!requestedUnit && !!match.unit && sameUnit(requestedUnit, match.unit) && requestedQty > 0
  if (!comparable) {
    return { level: 'partial', text: `Você já tem ${have} em estoque${extra}. Confira antes de comprar.`, missing: null }
  }
  if (match.general >= requestedQty) {
    return { level: 'enough', text: `Você já tem ${have} em estoque${extra}: cobre os ${fmt(requestedQty)} pedidos. Confira antes de comprar.`, missing: 0 }
  }
  const missing = requestedQty - match.general
  return { level: 'partial', text: `Você já tem ${have} em estoque${extra}. Faltam ${fmt(missing)} ${match.unit}.`, missing }
}
