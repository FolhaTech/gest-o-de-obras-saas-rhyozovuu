/**
 * Financeiro > Compras: planilha Excel dos itens a comprar.
 *  - Exporta os pedidos escolhidos (uma linha por pedido, ou uma por cotação da rodada atual quando já há cotações), com as
 *    colunas de cotação em branco quando nada foi informado.
 *  - Importa a mesma planilha preenchida: cada linha com fornecedor e valor vira uma COTAÇÃO do pedido (linhas repetidas do
 *    mesmo pedido com fornecedores diferentes viram várias cotações). O mínimo de 3 fornecedores e o envio ao admin seguem
 *    no fluxo normal.
 * Esta parte é pura (sem Excel nem API): monta as linhas para exportar e confere as linhas lidas, devolvendo o plano do que
 * será gravado e os problemas, linha a linha.
 */
import { MIN_QUOTES, PAYMENT_MODE_LABEL, STATUS_LABEL, URGENCY_LABEL, parseMoney, type PaymentMode } from './purchases'

export const SHEET_NAME = 'Itens a comprar'
export const GUIDE_SHEET_NAME = 'Como preencher'
/** Limite de linhas lidas de uma planilha (proteção contra arquivo gigante). */
export const MAX_IMPORT_ROWS = 2000
/** Quantos fornecedores diferentes o fluxo exige (texto da planilha). */
export const MIN_QUOTES_HINT = MIN_QUOTES

/** Situações em que o pedido ainda aceita cotação (o banco confere de novo). */
export const QUOTABLE_STATUSES = ['requested', 'quoting']
/** Situações dos itens "a comprar" (ainda não comprados), para a seleção rápida. */
export const TO_BUY_STATUSES = ['requested', 'quoting', 'quotes_sent', 'approved']

export interface SheetRequest {
  id: string
  item: string
  quantity: number | string
  unit?: string | null
  notes?: string | null
  urgency: string
  needed_by?: string | null
  status: string
  quote_round: number
  works?: { name: string } | null
  requester?: { full_name: string | null; email: string | null } | null
}

export interface SheetQuote {
  id: string
  request_id: string
  round: number
  supplier: string
  quoted_value: number | string
  payment_mode: PaymentMode
  delivery_days: number | null
  payment_terms: string | null
  notes: string | null
}

/** Cabeçalhos da planilha, na ordem das colunas. */
export const HEADERS = [
  'ID (não altere)',
  'Item',
  'Quantidade',
  'Unidade',
  'Obra',
  'Urgência',
  'Precisa até',
  'Solicitante',
  'Situação',
  'Observação do pedido',
  'Fornecedor',
  'Valor unitário (R$)',
  'Valor total (R$)',
  'Pagamento',
  'Prazo de entrega (dias)',
  'Condições',
  'Observação da cotação',
] as const

/** Posição de cada coluna (0 = A). */
export const COL = {
  id: 0,
  item: 1,
  quantity: 2,
  unit: 3,
  work: 4,
  urgency: 5,
  neededBy: 6,
  requester: 7,
  status: 8,
  requestNotes: 9,
  supplier: 10,
  unitValue: 11,
  totalValue: 12,
  payment: 13,
  deliveryDays: 14,
  terms: 15,
  quoteNotes: 16,
} as const

export type ExportCell = string | number | null

const num = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const round2 = (n: number) => Math.round(n * 100) / 100
const who = (p?: { full_name: string | null; email: string | null } | null) => p?.full_name?.trim() || p?.email || ''

/**
 * Linhas da planilha (sem o cabeçalho). Pedido sem cotação na rodada atual: uma linha com a parte da cotação em branco.
 * Pedido com cotações na rodada atual: uma linha por cotação, já preenchida (para corrigir ou acrescentar mais linhas).
 */
export function exportRows(requests: SheetRequest[], quotes: SheetQuote[]): ExportCell[][] {
  const rows: ExportCell[][] = []
  for (const r of requests) {
    const qty = num(r.quantity)
    const head: ExportCell[] = [
      r.id,
      r.item,
      qty,
      r.unit ?? '',
      r.works?.name?.trim() ?? 'Geral',
      URGENCY_LABEL[r.urgency as keyof typeof URGENCY_LABEL] ?? r.urgency,
      r.needed_by ?? null,
      who(r.requester),
      STATUS_LABEL[r.status as keyof typeof STATUS_LABEL] ?? r.status,
      r.notes ?? '',
    ]
    const own = quotes.filter((q) => q.request_id === r.id && q.round === r.quote_round)
    if (own.length === 0) {
      rows.push([...head, null, null, null, null, null, null, null])
      continue
    }
    for (const q of own) {
      const total = num(q.quoted_value)
      const unit = total !== null && qty ? round2(total / qty) : null
      rows.push([
        ...head,
        q.supplier,
        unit,
        total,
        PAYMENT_MODE_LABEL[q.payment_mode] ?? '',
        q.delivery_days,
        q.payment_terms ?? null,
        q.notes ?? null,
      ])
    }
  }
  return rows
}

// ---------------------------------------------------------------- importação
const normalize = (s: unknown): string =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export interface ColumnMap {
  id: number
  supplier: number
  unitValue: number
  totalValue: number
  payment: number
  deliveryDays: number
  terms: number
  quoteNotes: number
}

/** Acha a linha de cabeçalho (entre as primeiras) e a posição de cada coluna pelo nome, ignorando acento e caixa. */
export function findColumns(rows: unknown[][]): { headerRow: number; cols: ColumnMap } | null {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const cells = (rows[i] ?? []).map(normalize)
    const find = (test: (c: string) => boolean) => cells.findIndex(test)
    const id = find((c) => c === 'id' || c.startsWith('id ('))
    const supplier = find((c) => c.startsWith('fornecedor'))
    if (id < 0 || supplier < 0) continue
    return {
      headerRow: i,
      cols: {
        id,
        supplier,
        unitValue: find((c) => c.includes('valor unitario')),
        totalValue: find((c) => c.includes('valor total')),
        payment: find((c) => c.startsWith('pagamento') || c.includes('forma de pagamento')),
        deliveryDays: find((c) => c.includes('prazo de entrega')),
        terms: find((c) => c.startsWith('condicoes')),
        // "Observação do pedido" não é da cotação
        quoteNotes: find((c) => c.startsWith('observacao') && !c.includes('pedido')),
      },
    }
  }
  return null
}

export interface ImportRequest {
  id: string
  item: string
  quantity: number | string
  status: string
  quote_round: number
}
export interface ImportQuote {
  id: string
  request_id: string
  round: number
  supplier: string
  quoted_value: number | string
  payment_mode: PaymentMode
  delivery_days: number | null
  payment_terms: string | null
  notes: string | null
}

export interface QuoteFields {
  supplier: string
  quoted_value: number
  payment_mode: PaymentMode
  delivery_days: number | null
  payment_terms: string | null
  notes: string | null
}

export type ImportAction =
  | { kind: 'insert'; row: number; requestId: string; item: string; fields: QuoteFields }
  | { kind: 'update'; row: number; requestId: string; item: string; quoteId: string; fields: QuoteFields }

export interface ImportIssue {
  /** Número da linha na planilha (como aparece no Excel). */
  row: number
  item?: string
  message: string
}

export interface ImportPlan {
  actions: ImportAction[]
  /** Linhas com fornecedor e valor iguais ao que já está no sistema. */
  unchanged: number
  /** Linhas sem fornecedor e sem valor (nada a importar). */
  blank: number
  issues: ImportIssue[]
  /** Pedidos que terão, depois da importação, ao menos MIN_QUOTES fornecedores diferentes na rodada atual. */
  readyToSend: string[]
  /** Falha geral (planilha sem os cabeçalhos esperados, grande demais...). */
  error?: string
}

const parseDays = (v: unknown): number | null | 'invalid' => {
  if (v === null || v === undefined || String(v).trim() === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'))
  return Number.isInteger(n) && n >= 0 ? n : 'invalid'
}

const parseMode = (v: unknown): PaymentMode | null | 'invalid' => {
  const t = normalize(v)
  if (!t) return null
  if (t.includes('antecip') || t.includes('adiant') || t.includes('antes')) return 'advance'
  if (t.includes('apos') || t.includes('entrega') || t.includes('depois') || t.includes('prazo')) return 'after_delivery'
  return 'invalid'
}

const parseValue = (v: unknown): number => {
  if (typeof v === 'number') return v
  if (v === null || v === undefined) return Number.NaN
  return parseMoney(String(v))
}
const text = (v: unknown): string | null => {
  const t = String(v ?? '').trim()
  return t ? t : null
}

/**
 * Confere a planilha lida (linhas de células) contra os pedidos e as cotações que estão no sistema e devolve o plano do que
 * será gravado e os problemas. Não grava nada.
 */
export function planImport(rows: unknown[][], requests: ImportRequest[], quotes: ImportQuote[]): ImportPlan {
  const plan: ImportPlan = { actions: [], unchanged: 0, blank: 0, issues: [], readyToSend: [] }
  const found = findColumns(rows)
  if (!found) {
    plan.error = 'Não encontrei os cabeçalhos "ID" e "Fornecedor". Use a planilha exportada pelo sistema.'
    return plan
  }
  const { headerRow, cols } = found
  if (cols.unitValue < 0 && cols.totalValue < 0) {
    plan.error = 'A planilha precisa ter a coluna "Valor unitário (R$)" ou "Valor total (R$)".'
    return plan
  }
  const data = rows.slice(headerRow + 1)
  if (data.length > MAX_IMPORT_ROWS) {
    plan.error = `A planilha tem ${data.length} linhas; o limite é ${MAX_IMPORT_ROWS}.`
    return plan
  }

  const reqById = new Map(requests.map((r) => [r.id.toLowerCase(), r]))
  const seen = new Map<string, Set<string>>() // pedido -> fornecedores já lidos nesta planilha
  const suppliersAfter = new Map<string, Set<string>>() // pedido -> fornecedores da rodada depois de importar

  const cell = (row: unknown[], i: number) => (i >= 0 ? row[i] : undefined)

  data.forEach((row, idx) => {
    const line = headerRow + 2 + idx // número da linha no Excel (cabeçalho = linha headerRow + 1)
    const idRaw = text(cell(row, cols.id))?.toLowerCase() ?? ''
    const supplier = text(cell(row, cols.supplier))
    const unitRaw = cell(row, cols.unitValue)
    const totalRaw = cell(row, cols.totalValue)
    const hasValue = [unitRaw, totalRaw].some((v) => v !== null && v !== undefined && String(v).trim() !== '')

    // linha totalmente vazia (ou só com as colunas do pedido): nada a importar
    if (!supplier && !hasValue) {
      if (idRaw) plan.blank++
      return
    }
    if (!idRaw) {
      plan.issues.push({ row: line, message: 'Linha sem ID do pedido. Não altere a coluna ID.' })
      return
    }
    const req = UUID.test(idRaw) ? reqById.get(idRaw) : undefined
    if (!req) {
      plan.issues.push({ row: line, message: 'O ID não é de um pedido do sistema (a coluna ID não pode ser alterada).' })
      return
    }
    const label = req.item
    if (!supplier) {
      plan.issues.push({ row: line, item: label, message: 'Informe o fornecedor.' })
      return
    }
    if (!hasValue) {
      plan.issues.push({ row: line, item: label, message: `Sem valor para "${supplier}": linha ignorada.` })
      return
    }
    if (!QUOTABLE_STATUSES.includes(req.status)) {
      plan.issues.push({ row: line, item: label, message: `O pedido está em "${STATUS_LABEL[req.status as keyof typeof STATUS_LABEL] ?? req.status}" e não aceita mais cotações.` })
      return
    }

    // valor: unitário x quantidade, ou o total digitado
    const qty = num(req.quantity) ?? 0
    const unit = cell(row, cols.unitValue)
    const hasUnit = unit !== null && unit !== undefined && String(unit).trim() !== ''
    let value: number
    if (hasUnit) {
      const u = parseValue(unit)
      value = Number.isNaN(u) ? Number.NaN : round2(u * qty)
    } else {
      value = round2(parseValue(totalRaw))
    }
    if (Number.isNaN(value) || value < 0) {
      plan.issues.push({ row: line, item: label, message: `Valor inválido para "${supplier}".` })
      return
    }
    const mode = parseMode(cell(row, cols.payment))
    if (mode === 'invalid') {
      plan.issues.push({ row: line, item: label, message: 'Pagamento: use "Antecipado" ou "Após a entrega".' })
      return
    }
    const days = parseDays(cell(row, cols.deliveryDays))
    if (days === 'invalid') {
      plan.issues.push({ row: line, item: label, message: 'Prazo de entrega: use um número inteiro de dias.' })
      return
    }

    const key = normalize(supplier)
    const read = seen.get(req.id) ?? new Set<string>()
    if (read.has(key)) {
      plan.issues.push({ row: line, item: label, message: `O fornecedor "${supplier}" aparece mais de uma vez para este pedido.` })
      return
    }
    read.add(key)
    seen.set(req.id, read)

    const fields: QuoteFields = {
      supplier,
      quoted_value: value,
      payment_mode: mode ?? 'after_delivery',
      delivery_days: days,
      payment_terms: text(cell(row, cols.terms)),
      notes: text(cell(row, cols.quoteNotes)),
    }
    const current = quotes.filter((q) => q.request_id === req.id && q.round === req.quote_round)
    const existing = current.find((q) => normalize(q.supplier) === key)
    const after = suppliersAfter.get(req.id) ?? new Set(current.map((q) => normalize(q.supplier)))
    after.add(key)
    suppliersAfter.set(req.id, after)

    if (!existing) {
      plan.actions.push({ kind: 'insert', row: line, requestId: req.id, item: label, fields })
      return
    }
    const same =
      round2(Number(existing.quoted_value)) === fields.quoted_value &&
      existing.payment_mode === fields.payment_mode &&
      (existing.delivery_days ?? null) === fields.delivery_days &&
      (existing.payment_terms ?? null) === fields.payment_terms &&
      (existing.notes ?? null) === fields.notes
    if (same) plan.unchanged++
    else plan.actions.push({ kind: 'update', row: line, requestId: req.id, item: label, quoteId: existing.id, fields })
  })

  plan.readyToSend = [...suppliersAfter.entries()]
    .filter(([, set]) => set.size >= MIN_QUOTES)
    .map(([id]) => id)
  return plan
}

/** Resumo em uma linha do plano (para o diálogo e para o aviso). */
export function planSummary(plan: ImportPlan): string {
  const ins = plan.actions.filter((a) => a.kind === 'insert').length
  const upd = plan.actions.filter((a) => a.kind === 'update').length
  const parts = [`${ins} cotação(ões) nova(s)`, `${upd} atualizada(s)`, `${plan.unchanged} sem mudança`]
  if (plan.issues.length) parts.push(`${plan.issues.length} linha(s) com problema`)
  return parts.join(' · ')
}

/** Nome do arquivo exportado: "itens-a-comprar-2026-11-17.xlsx". */
export const sheetFileName = (todayISO: string): string => `itens-a-comprar-${todayISO}.xlsx`
