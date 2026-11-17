// Testa a planilha de itens a comprar: src/lib/purchase-sheet.ts (regras) e purchase-sheet-io.ts (arquivo .xlsx).
// Uso: npx tsx scripts/test-purchase-sheet.ts
import {
  COL,
  HEADERS,
  MAX_IMPORT_ROWS,
  exportRows,
  findColumns,
  planImport,
  planSummary,
  sheetFileName,
  type ImportQuote,
  type ImportRequest,
  type SheetQuote,
  type SheetRequest,
} from '../src/lib/purchase-sheet.ts'
import { buildPurchaseWorkbook, readPurchaseWorkbook } from '../src/lib/purchase-sheet-io.ts'

let failed = 0
const ok = (n: string, c: boolean, extra = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${extra ? '  -> ' + extra : ''}`)
  if (!c) failed++
}

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'
const D = '44444444-4444-4444-8444-444444444444'

const requests: SheetRequest[] = [
  { id: A, item: 'Cimento CP-II', quantity: 10, unit: 'saco', notes: 'marca X', urgency: 'high', needed_by: '2026-11-20', status: 'quoting', quote_round: 2, works: { name: 'Casa 03' }, requester: { full_name: 'Maria', email: 'm@x.com' } },
  { id: B, item: 'Areia', quantity: '4', unit: 'm³', notes: null, urgency: 'normal', needed_by: null, status: 'requested', quote_round: 1, works: null, requester: { full_name: null, email: 'joao@x.com' } },
]
const quotes: SheetQuote[] = [
  { id: 'q1', request_id: A, round: 2, supplier: 'Loja A', quoted_value: 500, payment_mode: 'advance', delivery_days: 3, payment_terms: 'PIX', notes: 'frete incluso' },
  { id: 'q2', request_id: A, round: 2, supplier: 'Loja B', quoted_value: '450.50', payment_mode: 'after_delivery', delivery_days: null, payment_terms: null, notes: null },
  { id: 'q0', request_id: A, round: 1, supplier: 'Rodada antiga', quoted_value: 999, payment_mode: 'advance', delivery_days: 1, payment_terms: null, notes: null },
]

// ---------------------------------------------------------------- linhas exportadas
const rows = exportRows(requests, quotes)
ok('pedido com cotações na rodada atual: uma linha por cotação; sem cotação: uma linha em branco', rows.length === 3, String(rows.length))
ok('a cotação de rodada antiga não sai', !rows.some((r) => r[COL.supplier] === 'Rodada antiga'))
ok('cabeçalhos e colunas batem', HEADERS.length === 17 && HEADERS[COL.supplier] === 'Fornecedor' && HEADERS[COL.unitValue] === 'Valor unitário (R$)' && rows.every((r) => r.length === HEADERS.length))
ok('dados do pedido: ID, item, quantidade, unidade, obra, urgência, prazo, solicitante, situação', rows[0][COL.id] === A && rows[0][COL.item] === 'Cimento CP-II' && rows[0][COL.quantity] === 10 && rows[0][COL.unit] === 'saco' && rows[0][COL.work] === 'Casa 03' && rows[0][COL.urgency] === 'Alta' && rows[0][COL.neededBy] === '2026-11-20' && rows[0][COL.requester] === 'Maria' && rows[0][COL.status] === 'Em cotação (financeiro)')
ok('valor unitário e total saem da cotação (total / quantidade)', rows[0][COL.unitValue] === 50 && rows[0][COL.totalValue] === 500 && rows[1][COL.unitValue] === 45.05 && rows[1][COL.totalValue] === 450.5)
ok('forma de pagamento, prazo, condições e observação da cotação', rows[0][COL.payment] === 'Antecipado (antes da entrega)' && rows[0][COL.deliveryDays] === 3 && rows[0][COL.terms] === 'PIX' && rows[0][COL.quoteNotes] === 'frete incluso' && rows[1][COL.payment] === 'Após a entrega' && rows[1][COL.deliveryDays] === null)
const blank = rows[2]
ok('pedido sem cotação: parte da cotação em BRANCO (sem valor inventado)', blank[COL.id] === B && blank[COL.supplier] === null && blank[COL.unitValue] === null && blank[COL.totalValue] === null && blank[COL.payment] === null && blank[COL.deliveryDays] === null)
ok('sem obra vira "Geral"; solicitante sem nome usa o e-mail; quantidade em texto vira número', blank[COL.work] === 'Geral' && blank[COL.requester] === 'joao@x.com' && blank[COL.quantity] === 4 && blank[COL.neededBy] === null)
ok('nome do arquivo', sheetFileName('2026-11-17') === 'itens-a-comprar-2026-11-17.xlsx')

// ---------------------------------------------------------------- arquivo .xlsx (escreve e lê de volta)
const blob = await buildPurchaseWorkbook(requests, quotes)
ok('gera um arquivo xlsx (zip)', blob.size > 1000 && new Uint8Array(await blob.arrayBuffer().then((b) => b.slice(0, 2)))[0] === 0x50)
const read = await readPurchaseWorkbook(blob)
ok('lê de volta: cabeçalho + 3 linhas', read.length === 4 && JSON.stringify(read[0]) === JSON.stringify([...HEADERS]), String(read.length))
ok('o ID e o item voltam iguais; a quantidade volta como número', read[1][COL.id] === A && read[3][COL.id] === B && read[1][COL.item] === 'Cimento CP-II' && read[1][COL.quantity] === 10)
ok('o prazo "precisa até" volta como data', read[1][COL.neededBy] instanceof Date && (read[1][COL.neededBy] as Date).toISOString().startsWith('2026-11-20'))
ok('as colunas de cotação em branco voltam vazias; as preenchidas voltam com valor', (read[3][COL.supplier] ?? null) === null && (read[3][COL.unitValue] ?? null) === null && read[1][COL.supplier] === 'Loja A' && read[1][COL.unitValue] === 50)

// ---------------------------------------------------------------- importação: a planilha preenchida pelo usuário
const impReqs: ImportRequest[] = [
  { id: A, item: 'Cimento CP-II', quantity: 10, status: 'quoting', quote_round: 2 },
  { id: B, item: 'Areia', quantity: 4, status: 'requested', quote_round: 1 },
  { id: C, item: 'Tijolo', quantity: 100, status: 'approved', quote_round: 1 },
  { id: D, item: 'Tinta', quantity: 2, status: 'quotes_sent', quote_round: 1 },
]
const impQuotes: ImportQuote[] = quotes.map((q) => ({ ...q }))
const header = [...HEADERS]
const line = (id: string, fields: Partial<Record<keyof typeof COL, unknown>>) => {
  const r: unknown[] = new Array(HEADERS.length).fill(null)
  r[COL.id] = id
  for (const [k, v] of Object.entries(fields)) r[COL[k as keyof typeof COL]] = v
  return r
}

// 1) o fluxo normal: 3 fornecedores para a Areia (B) preenchendo valor unitário e total
let plan = planImport(
  [header, line(B, { supplier: 'F1', unitValue: 10 }), line(B, { supplier: 'F2', unitValue: '12,5', payment: 'antecipado', deliveryDays: 5, terms: '30 dias' }), line(B, { supplier: 'F3', totalValue: 70, payment: 'Após a entrega', quoteNotes: 'frete grátis' })],
  impReqs,
  impQuotes,
)
ok('três fornecedores: três cotações novas, sem problema', plan.actions.length === 3 && plan.issues.length === 0 && plan.actions.every((a) => a.kind === 'insert' && a.requestId === B), JSON.stringify(plan.issues))
ok('valor unitário x quantidade (10 x 4 = 40; 12,5 x 4 = 50); só total vale o total', (plan.actions[0] as { fields: { quoted_value: number } }).fields.quoted_value === 40 && (plan.actions[1] as { fields: { quoted_value: number } }).fields.quoted_value === 50 && (plan.actions[2] as { fields: { quoted_value: number } }).fields.quoted_value === 70)
ok('pagamento "antecipado" e "Após a entrega" são entendidos; prazo, condições e observação vão junto', (plan.actions[1] as { fields: { payment_mode: string; delivery_days: number; payment_terms: string } }).fields.payment_mode === 'advance' && (plan.actions[1] as { fields: { delivery_days: number } }).fields.delivery_days === 5 && (plan.actions[1] as { fields: { payment_terms: string } }).fields.payment_terms === '30 dias' && (plan.actions[2] as { fields: { payment_mode: string; notes: string } }).fields.payment_mode === 'after_delivery' && (plan.actions[2] as { fields: { notes: string } }).fields.notes === 'frete grátis')
ok('sem a coluna Pagamento preenchida vale "Após a entrega"', (plan.actions[0] as { fields: { payment_mode: string } }).fields.payment_mode === 'after_delivery')
ok('com 3 fornecedores o pedido fica pronto para enviar ao admin', plan.readyToSend.join() === B)
ok('resumo em uma linha', planSummary(plan) === '3 cotação(ões) nova(s) · 0 atualizada(s) · 0 sem mudança', planSummary(plan))

// 2) pedido que já tem 2 cotações na rodada: uma nova e uma igual à existente
plan = planImport(
  [header, line(A, { supplier: 'Loja A', unitValue: 50, payment: 'Antecipado (antes da entrega)', deliveryDays: 3, terms: 'PIX', quoteNotes: 'frete incluso' }), line(A, { supplier: 'LOJA B', unitValue: 40 }), line(A, { supplier: 'Loja C', unitValue: 48 })],
  impReqs,
  impQuotes,
)
ok('igual ao que já está: sem mudança; valor diferente do mesmo fornecedor (ignora caixa): atualiza; fornecedor novo: insere', plan.unchanged === 1 && plan.actions.map((a) => a.kind).join() === 'update,insert' && (plan.actions[0] as { quoteId: string }).quoteId === 'q2', JSON.stringify(plan.actions.map((a) => a.kind)))
ok('2 já existentes + 1 nova = 3 fornecedores: pronto para enviar', plan.readyToSend.join() === A)

// 3) problemas, linha a linha
plan = planImport(
  [
    header,
    line(B, { supplier: 'F1', unitValue: 10 }), // ok (linha 2)
    line(B, { supplier: ' f1 ', unitValue: 11 }), // fornecedor repetido (linha 3)
    line(C, { supplier: 'F9', unitValue: 3 }), // pedido já aprovado (linha 4)
    line(D, { supplier: 'F9', unitValue: 3 }), // enviado ao admin (linha 5)
    line('99999999-9999-4999-8999-999999999999', { supplier: 'F', unitValue: 1 }), // ID desconhecido (linha 6)
    line('abc', { supplier: 'F', unitValue: 1 }), // ID inválido (linha 7)
    line(B, { supplier: 'F2' }), // sem valor (linha 8)
    line(B, { unitValue: 5 }), // sem fornecedor (linha 9)
    line(B, { supplier: 'F3', unitValue: 'abc' }), // valor inválido (linha 10)
    line(B, { supplier: 'F4', unitValue: -1 }), // valor negativo (linha 11)
    line(B, { supplier: 'F5', unitValue: 5, payment: 'fiado' }), // pagamento inválido (linha 12)
    line(B, { supplier: 'F6', unitValue: 5, deliveryDays: 2.5 }), // prazo inválido (linha 13)
    line(B, {}), // só o ID: em branco (linha 14)
    [null, 'Item solto', null, null, null, null, null, null, null, null, 'F7', null, 9], // sem ID (linha 15)
  ],
  impReqs,
  impQuotes,
)
const msg = (row: number) => plan.issues.find((i) => i.row === row)?.message ?? ''
ok('só a primeira linha vira cotação', plan.actions.length === 1 && plan.actions[0].row === 2)
ok('fornecedor repetido no mesmo pedido (linha 3)', /mais de uma vez/.test(msg(3)), msg(3))
ok('pedido já aprovado ou enviado ao admin não aceita cotação (linhas 4 e 5)', /não aceita mais cotações/.test(msg(4)) && /não aceita mais cotações/.test(msg(5)), msg(4) + ' | ' + msg(5))
ok('ID que não é de um pedido do sistema (linhas 6 e 7)', /ID não é de um pedido/.test(msg(6)) && /ID não é de um pedido/.test(msg(7)))
ok('sem valor, sem fornecedor, valor inválido e negativo (linhas 8 a 11)', /Sem valor/.test(msg(8)) && /fornecedor/.test(msg(9)) && /inválido/.test(msg(10)) && /inválido/.test(msg(11)), [8, 9, 10, 11].map(msg).join(' | '))
ok('pagamento e prazo inválidos (linhas 12 e 13)', /Antecipado/.test(msg(12)) && /inteiro/.test(msg(13)), msg(12) + ' | ' + msg(13))
ok('linha só com o ID é contada como em branco; linha sem ID tem problema (linha 15)', plan.blank === 1 && /sem ID/.test(msg(15)), msg(15))
ok('cada problema traz o nome do item', plan.issues.filter((i) => i.row !== 15 && i.row !== 6 && i.row !== 7).every((i) => !!i.item))

// 4) falhas gerais
ok('planilha sem cabeçalho: erro geral', /cabeçalhos/.test(planImport([['a', 'b'], [1, 2]], impReqs, impQuotes).error ?? ''))
ok('planilha sem colunas de valor: erro geral', /Valor unitário/.test(planImport([['ID (não altere)', 'Fornecedor'], [A, 'x']], impReqs, impQuotes).error ?? ''))
ok('cabeçalho achado mesmo com linhas de título em cima, em outra ordem e sem acento', (() => {
  const p = planImport([['Relatório'], [], ['valor unitario', 'fornecedor', 'id'], [10, 'F1', B]], impReqs, impQuotes)
  return p.actions.length === 1 && p.actions[0].row === 4
})())
ok('limite de linhas', /limite/.test(planImport([header, ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => line(B, {}))], impReqs, impQuotes).error ?? ''))
ok('findColumns acha as colunas pelo nome', findColumns([header])?.cols.supplier === COL.supplier && findColumns([header])?.cols.quoteNotes === COL.quoteNotes && findColumns([['x']]) === null)

// ---------------------------------------------------------------- ponta a ponta: exporta, "preenche" e importa o arquivo
const exported = await readPurchaseWorkbook(await buildPurchaseWorkbook([requests[1]], []))
const filled = exported.map((r) => [...r])
filled[1][COL.supplier] = 'Depósito Central'
filled[1][COL.unitValue] = 33.5
filled[1][COL.payment] = 'Antecipado'
const endToEnd = planImport(filled, impReqs, impQuotes)
ok('exporta -> preenche no Excel -> importa: vira uma cotação de 4 x 33,50 = 134,00 (antecipado)', endToEnd.actions.length === 1 && (endToEnd.actions[0] as { fields: { quoted_value: number; payment_mode: string; supplier: string } }).fields.quoted_value === 134 && (endToEnd.actions[0] as { fields: { payment_mode: string } }).fields.payment_mode === 'advance' && (endToEnd.actions[0] as { fields: { supplier: string } }).fields.supplier === 'Depósito Central', JSON.stringify(endToEnd.issues))
ok('a planilha exportada sem preencher não importa nada', planImport(exported, impReqs, impQuotes).actions.length === 0 && planImport(exported, impReqs, impQuotes).issues.length === 0)

console.log(failed ? `\n${failed} FALHA(S)` : '\nTudo certo')
process.exit(failed ? 1 : 0)
