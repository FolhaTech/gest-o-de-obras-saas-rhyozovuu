// Testa (RLS, transação desfeita no final): papel Financeiro, fluxo de compras (solicitação -> cotações -> aprovação do
// admin -> compra -> pagamento/entrega -> recebimento) e pagamento da equipe (22, 23 e 24).
// Se a migração 24 ainda não está aplicada, ela roda DENTRO da transação (e é desfeita junto).
// Uso: node db/azure/test-faturamento.mjs (lê DATABASE_URL do .env.local)
import { existsSync, readFileSync } from 'node:fs'
import pg from 'pg'

if (existsSync('.env.local')) process.loadEnvFile('.env.local')
const u = new URL(process.env.DATABASE_URL)
const c = new pg.Client({
  host: u.hostname,
  port: Number(u.port || 5432),
  user: decodeURIComponent(u.username),
  password: decodeURIComponent(u.password),
  database: u.pathname.slice(1),
  ssl: { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== 'false' },
})
await c.connect()

let failed = 0
const ok = (n, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${n}${extra ? '  -> ' + extra : ''}`)
  if (!cond) failed++
}
const q = async (sql, p) => (await c.query(sql, p)).rows
const one = async (sql, p) => (await q(sql, p))[0]
let sp = 0
const attempt = async (sql, p) => {
  const name = `sp${++sp}`
  await c.query(`SAVEPOINT ${name}`)
  try {
    const r = await c.query(sql, p)
    await c.query(`RELEASE SAVEPOINT ${name}`)
    return { rowCount: r.rowCount, rows: r.rows, error: null }
  } catch (e) {
    await c.query(`ROLLBACK TO SAVEPOINT ${name}`)
    return { rowCount: 0, rows: [], error: e }
  }
}
const as = async (role, sub) => {
  await c.query('RESET ROLE')
  await c.query(`SET LOCAL ROLE ${role}`)
  await c.query("select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', $2, true)", [sub ?? '', 'authenticated'])
}
const internal = async () => {
  await c.query('RESET ROLE')
  await c.query("select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', '', true)")
}
const user = (sub) => as('obras_authenticated', sub)

try {
  await c.query('BEGIN')
  if (!(await one("select to_regclass('public.purchase_quotes') t")).t) {
    await c.query(readFileSync('db/azure/24_compras_fluxo_cotacao.sql', 'utf8'))
    console.log('(migração 24 aplicada dentro da transação, ainda não está no banco)')
  }
  const [adm1, adm2] = await q("select id from profiles where lower(role) = 'admin' order by email limit 2")
  const [req1, fin, ges, other] = await q("select id from profiles where lower(role) = 'prestador' order by email limit 4")
  const set = (id, role) => c.query('update profiles set role = $2 where id = $1', [id, role])
  const roleFin = await attempt("update profiles set role = 'financeiro' where id = $1", [fin.id])
  ok('o banco aceita o papel "financeiro"', !roleFin.error, roleFin.error?.message)
  await set(ges.id, 'gestor')
  await user(fin.id)
  const rf = await one('select public.is_financeiro() f, public.is_staff() s')
  ok('is_financeiro() reconhece o papel (e o financeiro não é equipe interna)', rf.f === true && rf.s === false)
  await internal()
  const work = (await one('select id from works limit 1')).id
  const member = await one('select id, name from team_members order by name limit 1')
  ok('há dois administradores para o teste', !!adm1 && !!adm2)

  // atalhos
  const st = async (id) => (await one('select * from purchase_requests where id = $1', [id]))
  const move = (sub, id, to, extra = '', p = []) =>
    (async () => { await user(sub); return attempt(`update purchase_requests set status = '${to}'${extra ? ', ' + extra : ''} where id = $${p.length + 1} returning *`, [...p, id]) })()
  const quote = async (sub, reqId, supplier, value, mode = 'after_delivery') => {
    await user(sub)
    return attempt("insert into purchase_quotes (request_id, supplier, quoted_value, payment_mode, delivery_days) values ($1, $2, $3, $4, 7) returning *", [reqId, supplier, value, mode])
  }
  const newReq = async (sub, item) => {
    await user(sub)
    return (await one("insert into purchase_requests (item, quantity, unit, work_id) values ($1, 10, 'un', $2) returning id", [item, work])).id
  }
  // pede, cota 3 e envia
  const sendQuotes = async (reqId, mode = 'after_delivery') => {
    const a = await quote(fin.id, reqId, 'LOJA A', 500, mode)
    const b = await quote(fin.id, reqId, 'LOJA B', 450, mode)
    const d = await quote(fin.id, reqId, 'LOJA C', 480, mode)
    const sent = await move(fin.id, reqId, 'quotes_sent')
    return { a: a.rows[0], b: b.rows[0], c: d.rows[0], sent }
  }

  // ---------------------------------------------------------------- 1 · solicitar (qualquer usuário)
  await user(req1.id)
  const r1 = await attempt(
    "insert into purchase_requests (item, quantity, unit, urgency, work_id, status, supplier, quoted_value, final_value, finance_notes, approver_id, admin_notes, payment_mode, quote_round, closed_at) values ('CIMENTO TESTE', 10, 'saco', 'high', $1, 'approved', 'FORNECEDOR FALSO', 99, 88, 'nota falsa', $2, 'aprovado!', 'advance', 7, now()) returning *",
    [work, adm1.id],
  )
  ok('qualquer usuário solicita uma compra', !r1.error, r1.error?.message)
  const row = r1.rows[0]
  ok('quem solicita não preenche financeiro nem decisão (volta a "solicitada", rodada 1, tudo em branco)',
    row.status === 'requested' && row.quote_round === 1 && row.supplier === null && row.quoted_value === null && row.final_value === null &&
    row.finance_notes === null && row.approver_id === null && row.admin_notes === null && row.payment_mode === null && row.closed_at === null, JSON.stringify(row))
  ok('a solicitação leva o nome de quem pediu', row.requested_by === req1.id)
  ok('não se solicita em nome de outro', (await attempt("insert into purchase_requests (item, requested_by) values ('x', $1)", [adm1.id])).error?.code === '42501')
  ok('quantidade zero é rejeitada', (await attempt("insert into purchase_requests (item, quantity) values ('x', 0)")).error?.code === '23514')
  ok('urgência inválida é rejeitada', (await attempt("insert into purchase_requests (item, urgency) values ('x', 'agora')")).error?.code === '23514')
  ok('item sem texto é rejeitado', (await attempt('insert into purchase_requests (item) values (NULL)')).error?.code === '23502')
  await internal()
  ok('situação inexistente é rejeitada pelo banco', (await attempt("update purchase_requests set status = 'comprando' where id = $1", [row.id])).error?.code === '23514')
  ok('as situações antigas (comprada, entregue, recusada) não existem mais', (await attempt("update purchase_requests set status = 'purchased' where id = $1", [row.id])).error?.code === '23514')
  await user(req1.id)

  // ---------------------------------------------------------------- quem vê o quê
  const ids = async (role, sub) => {
    await as(role, sub)
    const r = await attempt('select id from purchase_requests where id = $1', [row.id])
    return r.error ? 0 : r.rows.length
  }
  ok('o solicitante vê a dele', (await ids('obras_authenticated', req1.id)) === 1)
  ok('outro usuário NÃO vê a solicitação alheia', (await ids('obras_authenticated', other.id)) === 0)
  ok('o gestor vê todas', (await ids('obras_authenticated', ges.id)) === 1)
  ok('o financeiro vê todas', (await ids('obras_authenticated', fin.id)) === 1)
  ok('o admin vê todas', (await ids('obras_authenticated', adm1.id)) === 1)
  ok('anônimo não vê', (await ids('obras_anon', null)) === 0)

  // ---------------------------------------------------------------- o solicitante mexe só enquanto "solicitada"
  await user(req1.id)
  ok('edita a própria solicitação enquanto está "solicitada"', (await attempt("update purchase_requests set quantity = 12, notes = 'urgente' where id = $1", [row.id])).rowCount === 1)
  const hack = await attempt("update purchase_requests set status = 'approved' where id = $1", [row.id])
  ok('não aprova a própria solicitação', /Mudança de situação não permitida|Somente/.test(hack.error?.message ?? ''), hack.error?.message)
  const keep = await attempt("update purchase_requests set supplier = 'EU', quoted_value = 1, final_value = 1, approver_id = $2, payment_mode = 'advance' where id = $1 returning supplier, quoted_value, final_value, approver_id, payment_mode", [row.id, adm1.id])
  ok('não preenche fornecedor, valores, aprovador nem pagamento (ficam como estavam)',
    keep.rows[0]?.supplier === null && keep.rows[0].quoted_value === null && keep.rows[0].final_value === null && keep.rows[0].approver_id === null && keep.rows[0].payment_mode === null)
  await user(other.id)
  ok('outro usuário não altera a solicitação alheia', (await attempt("update purchase_requests set item = 'x' where id = $1", [row.id])).rowCount === 0)
  ok('...nem exclui', (await attempt('delete from purchase_requests where id = $1', [row.id])).rowCount === 0)
  await user(ges.id)
  ok('o gestor vê mas não altera as dos outros', (await attempt("update purchase_requests set status = 'cancelled' where id = $1", [row.id])).rowCount === 0)
  await user(fin.id)
  const finEdit = await attempt("update purchase_requests set item = 'TROCADO', quantity = 99 where id = $1 returning item, quantity", [row.id])
  ok('o financeiro não muda o que foi pedido', finEdit.rows[0]?.item === 'CIMENTO TESTE' && Number(finEdit.rows[0].quantity) === 12, JSON.stringify(finEdit.rows[0]))
  await user(adm2.id)
  const admEdit = await attempt("update purchase_requests set item = 'TROCADO' where id = $1 returning item", [row.id])
  ok('o admin também não muda o que foi pedido por outro', admEdit.rows[0]?.item === 'CIMENTO TESTE')

  // ---------------------------------------------------------------- 2 · cotações (financeiro)
  const skipQuoting = await move(fin.id, row.id, 'quotes_sent')
  ok('não envia ao admin sem cotações', /Mudança de situação não permitida|ao menos 3/.test(skipQuoting.error?.message ?? ''), skipQuoting.error?.message)
  const q1 = await quote(fin.id, row.id, 'LOJA A', 500, 'after_delivery')
  ok('o financeiro lança uma cotação', !q1.error && q1.rows[0].round === 1, q1.error?.message)
  ok('a primeira cotação coloca a solicitação em cotação', (await st(row.id)).status === 'quoting')
  ok('o financeiro vira o responsável pela solicitação', (await st(row.id)).handled_by === fin.id)
  ok('não repete o fornecedor na rodada (mesmo com outras letras e espaços)', (await quote(fin.id, row.id, '  loja a ', 400)).error?.code === '23505')
  ok('valor negativo é rejeitado', (await quote(fin.id, row.id, 'LOJA X', -1)).error?.code === '23514')
  await user(fin.id)
  ok('forma de pagamento inválida é rejeitada', (await attempt("insert into purchase_quotes (request_id, supplier, quoted_value, payment_mode) values ($1, 'LOJA Y', 1, 'fiado')", [row.id])).error?.code === '23514')
  ok('fornecedor em branco é rejeitado', !!(await attempt("insert into purchase_quotes (request_id, supplier, quoted_value) values ($1, '   ', 1)", [row.id])).error)
  await quote(fin.id, row.id, 'LOJA B', 450, 'advance')
  const two = await move(fin.id, row.id, 'quotes_sent')
  ok('com 2 cotações não envia (mínimo 3)', /ao menos 3 cotações.*hoje: 2/.test(two.error?.message ?? ''), two.error?.message)

  // quem vê as cotações
  const seeQuotes = async (sub, role = 'obras_authenticated') => {
    await as(role, sub)
    const r = await attempt('select id from purchase_quotes where request_id = $1', [row.id])
    return r.error ? -1 : r.rows.length
  }
  ok('o financeiro vê as cotações', (await seeQuotes(fin.id)) === 2)
  ok('o admin vê as cotações', (await seeQuotes(adm1.id)) === 2)
  ok('o gestor NÃO vê as cotações (são valores)', (await seeQuotes(ges.id)) === 0)
  ok('quem solicitou NÃO vê as cotações', (await seeQuotes(req1.id)) === 0)
  ok('outro usuário NÃO vê as cotações', (await seeQuotes(other.id)) === 0)
  await as('obras_anon', null)
  ok('anônimo NÃO vê as cotações', (await attempt('select id from purchase_quotes')).error?.code === '42501' || (await seeQuotes(null, 'obras_anon')) <= 0)
  for (const [nome, sub] of [['o admin', adm1.id], ['o gestor', ges.id], ['quem solicitou', req1.id]]) {
    await user(sub)
    ok(`${nome} NÃO lança cotação (só o financeiro)`, (await attempt("insert into purchase_quotes (request_id, supplier, quoted_value) values ($1, 'INTRUSO', 1)", [row.id])).error?.code === '42501')
  }
  await user(adm1.id)
  ok('o admin NÃO altera cotação', (await attempt("update purchase_quotes set quoted_value = 1 where request_id = $1", [row.id])).rowCount === 0)
  await user(fin.id)
  const qEdit = await attempt("update purchase_quotes set quoted_value = 455, supplier = '  LOJA B  ', round = 9 where request_id = $1 and supplier = 'LOJA B' returning quoted_value, supplier, round", [row.id])
  ok('o financeiro corrige a cotação enquanto está em cotação (rodada não muda, fornecedor sem espaços)', qEdit.rows[0] && Number(qEdit.rows[0].quoted_value) === 455 && qEdit.rows[0].supplier === 'LOJA B' && qEdit.rows[0].round === 1, JSON.stringify(qEdit.rows[0]))
  ok('o financeiro remove uma cotação enquanto está em cotação', (await attempt("delete from purchase_quotes where request_id = $1 and supplier = 'LOJA B'", [row.id])).rowCount === 1)
  await quote(fin.id, row.id, 'LOJA B', 450, 'advance')
  await quote(fin.id, row.id, 'LOJA C', 480, 'after_delivery')

  // ---------------------------------------------------------------- 3 · admin recusa (volta ao financeiro) / aprova
  const sent = await move(fin.id, row.id, 'quotes_sent')
  ok('com 3 fornecedores diferentes o financeiro envia ao admin', !sent.error && sent.rows[0].status === 'quotes_sent', sent.error?.message)
  await user(fin.id)
  ok('enviada: o financeiro não lança mais cotação', /só podem ser lançadas/.test((await attempt("insert into purchase_quotes (request_id, supplier, quoted_value) values ($1, 'ATRASADA', 1)", [row.id])).error?.message ?? ''))
  ok('enviada: o financeiro não remove cotação', /já foram enviadas/.test((await attempt('delete from purchase_quotes where request_id = $1', [row.id])).error?.message ?? ''))
  ok('enviada: o financeiro não edita cotação', /só podem ser lançadas/.test((await attempt("update purchase_quotes set quoted_value = 1 where request_id = $1", [row.id])).error?.message ?? ''))
  const finAppr = await move(fin.id, row.id, 'approved')
  ok('o financeiro não aprova a cotação', /Somente o administrador/.test(finAppr.error?.message ?? ''), finAppr.error?.message)
  const reqAppr = await move(req1.id, row.id, 'approved')
  ok('quem solicitou (não admin) não aprova', !!reqAppr.error)
  const gesAppr = await move(ges.id, row.id, 'quoting')
  ok('o gestor não recusa nem aprova', gesAppr.rowCount === 0)
  const noReason = await move(adm1.id, row.id, 'quoting')
  ok('recusar exige o motivo', /motivo da recusa/.test(noReason.error?.message ?? ''), noReason.error?.message)
  const blankReason = await move(adm1.id, row.id, 'quoting', "admin_notes = '   '")
  ok('motivo só com espaços não vale', /motivo da recusa/.test(blankReason.error?.message ?? ''))
  const rej = await move(adm1.id, row.id, 'quoting', "admin_notes = '  Preços altos, refazer  '")
  ok('o admin recusa: volta ao financeiro em cotação, rodada 2, com o motivo',
    rej.rows[0]?.status === 'quoting' && rej.rows[0].quote_round === 2 && rej.rows[0].admin_notes === 'Preços altos, refazer' && rej.rows[0].approved_quote_id === null && rej.rows[0].approver_id === adm1.id, rej.error?.message)
  await user(fin.id)
  ok('as cotações da rodada 1 continuam guardadas (histórico)', (await q('select id from purchase_quotes where request_id = $1 and round = 1', [row.id])).length === 3)
  // três cotações da rodada antiga não valem para a nova
  const oldInRound = await move(fin.id, row.id, 'quotes_sent')
  ok('rodada 2 sem cotações novas: não envia (as da rodada 1 não contam)', /hoje: 0/.test(oldInRound.error?.message ?? ''), oldInRound.error?.message)
  const n1 = await quote(fin.id, row.id, 'LOJA A', 420, 'after_delivery')
  ok('o mesmo fornecedor pode cotar de novo na rodada seguinte', !n1.error && n1.rows[0].round === 2, n1.error?.message)
  await quote(fin.id, row.id, 'LOJA D', 400, 'advance')
  const two2 = await move(fin.id, row.id, 'quotes_sent')
  ok('rodada 2 com 2 cotações: não envia', /hoje: 2/.test(two2.error?.message ?? ''))
  const n3 = await quote(fin.id, row.id, 'LOJA E', 410, 'after_delivery')
  const sent2 = await move(fin.id, row.id, 'quotes_sent')
  ok('rodada 2 com 3: envia de novo ao admin', sent2.rows[0]?.status === 'quotes_sent', sent2.error?.message)

  const oldQuote = (await one('select id from purchase_quotes where request_id = $1 and round = 1 limit 1', [row.id])).id
  const noPick = await move(adm1.id, row.id, 'approved')
  ok('aprovar sem escolher uma cotação é recusado', /Escolha uma das cotações/.test(noPick.error?.message ?? ''), noPick.error?.message)
  const oldPick = await move(adm1.id, row.id, 'approved', 'approved_quote_id = $1', [oldQuote])
  ok('cotação de rodada antiga não vale', /Escolha uma das cotações/.test(oldPick.error?.message ?? ''))
  // cotação de outra solicitação
  const other1 = await newReq(req1.id, 'OUTRA')
  const foreign = (await quote(fin.id, other1, 'LOJA Z', 1)).rows[0]
  const foreignPick = await move(adm1.id, row.id, 'approved', 'approved_quote_id = $1', [foreign.id])
  ok('cotação de outra solicitação não vale', /Escolha uma das cotações/.test(foreignPick.error?.message ?? ''))
  const appr = await move(adm2.id, row.id, 'approved', "approved_quote_id = $1, admin_notes = 'ok, fechar com a loja D'", [n3.rows[0].id])
  ok('qualquer admin aprova quando quem abriu não é admin (escolhe a cotação)', appr.rows[0]?.status === 'approved' && appr.rows[0].approved_quote_id === n3.rows[0].id, appr.error?.message)
  ok('a aprovação copia fornecedor, valor e forma de pagamento da cotação',
    appr.rows[0]?.supplier === 'LOJA E' && Number(appr.rows[0].quoted_value) === 410 && Number(appr.rows[0].final_value) === 410 && appr.rows[0].payment_mode === 'after_delivery')
  ok('guarda quem aprovou, quando e a observação', appr.rows[0]?.approver_id === adm2.id && !!appr.rows[0].decided_at && appr.rows[0].admin_notes === 'ok, fechar com a loja D')
  const reopen = await move(adm2.id, row.id, 'quoting', "admin_notes = 'voltar'")
  ok('depois de aprovada o admin não recusa mais', /não permitida/.test(reopen.error?.message ?? ''), reopen.error?.message)

  // ---------------------------------------------------------------- 4 · compra (financeiro escolhe a forma de pagamento)
  await user(fin.id)
  const lockV = await attempt("update purchase_requests set final_value = 1, supplier = 'OUTRO', quoted_value = 1, approved_quote_id = null where id = $1 returning final_value, supplier, quoted_value, approved_quote_id", [row.id])
  ok('o financeiro não muda o valor, o fornecedor nem a cotação aprovada', Number(lockV.rows[0]?.final_value) === 410 && lockV.rows[0].supplier === 'LOJA E' && Number(lockV.rows[0].quoted_value) === 410 && lockV.rows[0].approved_quote_id === n3.rows[0].id, JSON.stringify(lockV.rows[0]))
  const buyNoMode = await move(adm2.id, row.id, 'awaiting_delivery')
  ok('o admin não faz a compra', /Somente o financeiro faz a compra/.test(buyNoMode.error?.message ?? ''), buyNoMode.error?.message)
  const wrong = await move(fin.id, row.id, 'awaiting_payment')
  ok('pagamento após a entrega não vai para "aguardando pagamento"', /Pagamento antecipado vai para/.test(wrong.error?.message ?? ''), wrong.error?.message)
  const badMode = await move(fin.id, row.id, 'awaiting_delivery', "payment_mode = 'fiado'")
  ok('forma de pagamento inválida na compra é rejeitada', /Escolha o pagamento/.test(badMode.error?.message ?? ''), badMode.error?.message)
  const skipBuy = await move(fin.id, row.id, 'closed')
  ok('não pula etapas (aprovada para encerrada)', /não permitida/.test(skipBuy.error?.message ?? ''))

  // ---- após a entrega: recebe e confere primeiro; depois o financeiro libera o pagamento
  const buy = await move(fin.id, row.id, 'awaiting_delivery', "invoice_number = 'NF-1', purchased_at = '2026-11-10'")
  ok('compra após a entrega: vai para "aguardando entrega" com nota e data da compra', buy.rows[0]?.status === 'awaiting_delivery' && buy.rows[0].invoice_number === 'NF-1' && String(buy.rows[0].purchased_at).includes('2026') && buy.rows[0].payment_mode === 'after_delivery', buy.error?.message)
  const payEarly = await move(fin.id, row.id, 'closed')
  ok('após a entrega: não encerra nem paga antes de receber e conferir', /Após a entrega: recebe, confere/.test(payEarly.error?.message ?? '') || /não permitida/.test(payEarly.error?.message ?? ''), payEarly.error?.message)
  const rcvAdm = await move(adm2.id, row.id, 'awaiting_release')
  ok('o admin não recebe a entrega (é do financeiro)', /Somente o financeiro recebe/.test(rcvAdm.error?.message ?? ''))
  const rcv = await move(fin.id, row.id, 'awaiting_release', "receipt_notes = 'tudo conferido, 10 sacos'")
  ok('o financeiro recebe e confere: vai para "liberar pagamento"', rcv.rows[0]?.status === 'awaiting_release' && rcv.rows[0].received_by === fin.id && !!rcv.rows[0].received_at && rcv.rows[0].receipt_notes === 'tudo conferido, 10 sacos' && rcv.rows[0].closed_at === null, rcv.error?.message)
  ok('...e o pagamento ainda não foi liberado', rcv.rows[0]?.payment_released_at === null)
  const rel = await move(fin.id, row.id, 'closed')
  ok('o financeiro libera o pagamento e encerra', rel.rows[0]?.status === 'closed' && rel.rows[0].payment_released_by === fin.id && !!rel.rows[0].payment_released_at && !!rel.rows[0].closed_at, rel.error?.message)
  const afterClose = await move(fin.id, row.id, 'quoting')
  ok('encerrada é final', /não permitida/.test(afterClose.error?.message ?? ''))
  const cancelClosed = await move(adm2.id, row.id, 'cancelled')
  ok('o admin não cancela depois da compra', /Você não pode cancelar/.test(cancelClosed.error?.message ?? ''))
  await user(fin.id)
  const notesAfter = await attempt("update purchase_requests set finance_notes = 'arquivada' where id = $1 returning finance_notes", [row.id])
  ok('o financeiro ainda pode anotar na encerrada', notesAfter.rows[0]?.finance_notes === 'arquivada', notesAfter.error?.message)
  await user(adm2.id)
  const notesAdm = await attempt("update purchase_requests set finance_notes = 'do admin' where id = $1 returning finance_notes", [row.id])
  ok('o admin não grava as observações do financeiro', notesAdm.rows[0]?.finance_notes === 'arquivada')

  // ---- antecipado: o financeiro libera o pagamento ANTES da entrega
  const adv = await newReq(req1.id, 'TIJOLO ANTECIPADO')
  await sendQuotes(adv, 'advance')
  const advPick = (await one("select id from purchase_quotes where request_id = $1 and supplier = 'LOJA B'", [adv])).id
  const advAppr = await move(adm1.id, adv, 'approved', 'approved_quote_id = $1', [advPick])
  ok('aprova a cotação com pagamento antecipado', advAppr.rows[0]?.payment_mode === 'advance', advAppr.error?.message)
  const advWrong = await move(fin.id, adv, 'awaiting_delivery')
  ok('antecipado: a compra vai para "aguardando pagamento", não direto para a entrega', /Pagamento antecipado vai para/.test(advWrong.error?.message ?? ''), advWrong.error?.message)
  const advBuy = await move(fin.id, adv, 'awaiting_payment')
  ok('antecipado: compra grava a data e fica "aguardando pagamento"', advBuy.rows[0]?.status === 'awaiting_payment' && !!advBuy.rows[0].purchased_at && advBuy.rows[0].payment_released_at === null, advBuy.error?.message)
  const advSkip = await move(fin.id, adv, 'closed')
  ok('antecipado: não encerra sem pagar e sem receber', /não permitida/.test(advSkip.error?.message ?? ''))
  const advPayAdm = await move(adm1.id, adv, 'awaiting_delivery')
  ok('o admin não libera o pagamento', /Somente o financeiro libera/.test(advPayAdm.error?.message ?? ''))
  const advPay = await move(fin.id, adv, 'awaiting_delivery')
  ok('o financeiro libera o pagamento antes da entrega', advPay.rows[0]?.status === 'awaiting_delivery' && advPay.rows[0].payment_released_by === fin.id && !!advPay.rows[0].payment_released_at, advPay.error?.message)
  const advRel = await move(fin.id, adv, 'awaiting_release')
  ok('antecipado: não pede liberação de novo depois da entrega', /Antecipado: o recebimento encerra/.test(advRel.error?.message ?? '') || /não permitida/.test(advRel.error?.message ?? ''), advRel.error?.message)
  const advRcv = await move(fin.id, adv, 'closed', "receipt_notes = 'chegou ok'")
  ok('antecipado: receber e conferir encerra', advRcv.rows[0]?.status === 'closed' && advRcv.rows[0].received_by === fin.id && !!advRcv.rows[0].closed_at && advRcv.rows[0].receipt_notes === 'chegou ok', advRcv.error?.message)

  // o financeiro pode trocar a forma de pagamento na hora da compra
  const sw = await newReq(req1.id, 'AREIA TROCA')
  await sendQuotes(sw, 'after_delivery')
  const swPick = (await one("select id from purchase_quotes where request_id = $1 and supplier = 'LOJA A'", [sw])).id
  await move(adm1.id, sw, 'approved', 'approved_quote_id = $1', [swPick])
  const swBuy = await move(fin.id, sw, 'awaiting_payment', "payment_mode = 'advance'")
  ok('na compra o financeiro pode trocar para pagamento antecipado', swBuy.rows[0]?.status === 'awaiting_payment' && swBuy.rows[0].payment_mode === 'advance', swBuy.error?.message)

  // ---------------------------------------------------------------- admin que abriu a solicitação é quem aprova
  const own = await newReq(adm1.id, 'PEDIDO DO ADMIN 1')
  const ownRow = await st(own)
  ok('o admin, quando solicita, entra como qualquer usuário (pendente pelo financeiro)', ownRow.status === 'requested' && ownRow.requested_by === adm1.id)
  const ownQ = await sendQuotes(own)
  ok('cotações enviadas para o admin que abriu', ownQ.sent.rows[0]?.status === 'quotes_sent')
  const notOpener = await move(adm2.id, own, 'approved', 'approved_quote_id = $1', [ownQ.b.id])
  ok('outro admin NÃO aprova o pedido de um admin', /Somente o administrador que abriu/.test(notOpener.error?.message ?? ''), notOpener.error?.message)
  const notOpenerRej = await move(adm2.id, own, 'quoting', "admin_notes = 'não'")
  ok('...nem recusa', /Somente o administrador que abriu/.test(notOpenerRej.error?.message ?? ''))
  const opener = await move(adm1.id, own, 'approved', 'approved_quote_id = $1', [ownQ.b.id])
  ok('quem abriu aprova', opener.rows[0]?.status === 'approved' && opener.rows[0].approver_id === adm1.id, opener.error?.message)
  const cancelOther = await move(adm2.id, own, 'cancelled')
  ok('qualquer admin pode cancelar antes da compra', cancelOther.rows[0]?.status === 'cancelled', cancelOther.error?.message)

  // ---------------------------------------------------------------- cancelar
  const c1 = await newReq(req1.id, 'PARA CANCELAR')
  const c1x = await move(req1.id, c1, 'cancelled')
  ok('o solicitante cancela a própria solicitação enquanto está pendente', c1x.rows[0]?.status === 'cancelled', c1x.error?.message)
  const c2 = await newReq(req1.id, 'CANCELAR EM COTAÇÃO')
  await quote(fin.id, c2, 'LOJA A', 10)
  const c2req = await move(req1.id, c2, 'cancelled')
  ok('depois que o financeiro começa a cotar o solicitante não cancela', /já está com o financeiro/.test(c2req.error?.message ?? ''), c2req.error?.message)
  const c2fin = await move(fin.id, c2, 'cancelled')
  ok('o financeiro não cancela (é decisão do admin)', /Você não pode cancelar/.test(c2fin.error?.message ?? ''), c2fin.error?.message)
  const c2gest = await move(ges.id, c2, 'cancelled')
  ok('o gestor não cancela', c2gest.rowCount === 0)
  const c2adm = await move(adm1.id, c2, 'cancelled')
  ok('o admin cancela uma solicitação em cotação', c2adm.rows[0]?.status === 'cancelled', c2adm.error?.message)
  const reborn = await move(fin.id, c2, 'quoting')
  ok('cancelada é final', /não permitida/.test(reborn.error?.message ?? ''))
  const c3 = await newReq(req1.id, 'CANCELAR ENVIADA')
  await sendQuotes(c3)
  ok('o admin cancela com as cotações já enviadas', (await move(adm2.id, c3, 'cancelled')).rows[0]?.status === 'cancelled')

  // ---------------------------------------------------------------- excluir
  const d1 = await newReq(req1.id, 'PARA EXCLUIR')
  await user(req1.id)
  ok('exclui a própria solicitação enquanto está pendente', (await attempt('delete from purchase_requests where id = $1', [d1])).rowCount === 1)
  const d2 = await newReq(req1.id, 'EXCLUIR COM COTAÇÕES')
  await sendQuotes(d2)
  await user(req1.id)
  ok('depois de atendida o solicitante não exclui', (await attempt('delete from purchase_requests where id = $1', [d2])).rowCount === 0)
  await user(fin.id)
  ok('o financeiro não exclui solicitação', (await attempt('delete from purchase_requests where id = $1', [d2])).rowCount === 0)
  await user(ges.id)
  ok('o gestor não exclui solicitação', (await attempt('delete from purchase_requests where id = $1', [d2])).rowCount === 0)
  await user(adm1.id)
  const del = await attempt('delete from purchase_requests where id = $1', [d2])
  ok('o admin exclui a solicitação e as cotações dela saem junto', del.rowCount === 1 && !del.error && (await q('select id from purchase_quotes where request_id = $1', [d2])).length === 0, del.error?.message)

  // ---------------------------------------------------------------- rotinas internas (sem usuário) ficam livres
  await internal()
  const intern = await attempt("insert into purchase_requests (item, status, supplier, final_value, payment_mode) values ('INTERNA', 'awaiting_delivery', 'X', 5, 'advance') returning status, supplier, final_value", [])
  ok('rotina interna do banco grava em qualquer situação (migrações, scripts)', intern.rows[0]?.status === 'awaiting_delivery' && intern.rows[0].supplier === 'X', intern.error?.message)

  // o financeiro não é equipe interna: lê as obras, mas não altera
  await user(fin.id)
  ok('o financeiro lê as obras', Number((await one('select count(*) n from works')).n) > 0)
  ok('...mas não altera obra', (await attempt("update works set notes = 'x' where id = $1", [work])).rowCount === 0)
  ok('...nem cria obra', (await attempt("insert into works (name) values ('x')")).error?.code === '42501')
  ok('...nem lê veículos (só equipe interna)', Number((await one('select count(*) n from vehicles')).n) === 0)
  ok('...nem lê despesas', Number((await one('select count(*) n from expenses')).n) === 0)

  // ---------------------------------------------------------------- pagamento da equipe
  const pay = await attempt("insert into team_payments (member_id, reference, payment_amount, period_start, period_end) values ($1, 'SEMANA TESTE', 350.75, '2026-11-09', '2026-11-15') returning id, member_name, status, paid_at, payment_amount", [member.id])
  ok('o financeiro lança o pagamento de um membro', !pay.error, pay.error?.message)
  ok('o nome do membro fica guardado e nasce "pendente" sem data de pagamento', pay.rows[0]?.member_name === member.name.trim() && pay.rows[0].status === 'pending' && pay.rows[0].paid_at === null)
  const paid = await attempt("update team_payments set status = 'paid' where id = $1 returning status, paid_at", [pay.rows[0].id])
  ok('marcar como pago grava a data de hoje', paid.rows[0]?.status === 'paid' && !!paid.rows[0].paid_at)
  const back = await attempt("update team_payments set status = 'pending' where id = $1 returning paid_at", [pay.rows[0].id])
  ok('voltar para pendente limpa a data', back.rows[0]?.paid_at === null)
  ok('valor negativo é rejeitado', (await attempt("insert into team_payments (member_id, reference, payment_amount) values ($1, 'x', -1)", [member.id])).error?.code === '23514')
  ok('período com fim antes do início é rejeitado', (await attempt("insert into team_payments (member_id, reference, payment_amount, period_start, period_end) values ($1, 'x', 1, '2026-11-10', '2026-11-01')", [member.id])).error?.code === '23514')
  ok('situação inválida é rejeitada', (await attempt("insert into team_payments (member_id, reference, payment_amount, status) values ($1, 'x', 1, 'quase')", [member.id])).error?.code === '23514')

  await user(adm1.id)
  ok('o admin também vê os pagamentos', (await q('select id from team_payments where id = $1', [pay.rows[0].id])).length === 1)
  for (const [nome, sub] of [['o gestor', ges.id], ['o solicitante/prestador', req1.id]]) {
    await user(sub)
    ok(`${nome} NÃO vê os pagamentos da equipe`, Number((await one('select count(*) n from team_payments')).n) === 0)
    ok(`${nome} NÃO lança pagamento`, (await attempt("insert into team_payments (member_id, reference, payment_amount) values ($1, 'x', 1)", [member.id])).error?.code === '42501')
  }
  await as('obras_anon', null)
  ok('anônimo não vê pagamentos', (await attempt('select id from team_payments')).error?.code === '42501' || Number((await one('select count(*) n from team_payments')).n) === 0)

  // excluir o membro mantém o pagamento (com o nome guardado)
  await internal()
  const m2 = (await one("insert into team_members (name) values ('MEMBRO TESTE PAG') returning id")).id
  const p2 = (await one("insert into team_payments (member_id, reference, payment_amount) values ($1, 'x', 10) returning id", [m2])).id
  await c.query('delete from team_members where id = $1', [m2])
  const kept = await one('select member_id, member_name from team_payments where id = $1', [p2])
  ok('excluir o membro mantém o pagamento com o nome guardado', kept?.member_id === null && kept.member_name === 'MEMBRO TESTE PAG')
} catch (e) {
  console.log('ERRO', e.message)
  failed++
} finally {
  await c.query('ROLLBACK')
  await c.end()
}
console.log(failed ? `\n${failed} FALHA(S)` : '\nTudo certo (transação desfeita)')
process.exit(failed ? 1 : 0)
