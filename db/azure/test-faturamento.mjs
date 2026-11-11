// Testa (RLS, transação desfeita no final): papel Financeiro, solicitações de compra e pagamento da equipe
// (22_faturamento.sql). Uso: node db/azure/test-faturamento.mjs (lê DATABASE_URL do .env.local)
import { existsSync } from 'node:fs'
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

try {
  await c.query('BEGIN')
  const admin = await one("select id from profiles where lower(role) = 'admin' order by email limit 1")
  const [req1, fin, ges, other] = await q("select id from profiles where lower(role) = 'prestador' order by email limit 4")
  const set = (id, role) => c.query('update profiles set role = $2 where id = $1', [id, role])
  const roleFin = await attempt("update profiles set role = 'financeiro' where id = $1", [fin.id])
  ok('o banco aceita o papel "financeiro"', !roleFin.error, roleFin.error?.message)
  await set(ges.id, 'gestor')
  ok('is_financeiro() reconhece o papel', (await (async () => { await as('obras_authenticated', fin.id); return (await one('select public.is_financeiro() f, public.is_staff() s')) })()).f === true)
  await c.query('RESET ROLE')
  const work = (await one('select id from works limit 1')).id
  const member = (await one('select id, name from team_members order by name limit 1'))

  // ---------------------------------------------------------------- solicitar (qualquer usuário)
  await as('obras_authenticated', req1.id)
  const r1 = await attempt(
    "insert into purchase_requests (item, quantity, unit, urgency, work_id, status, supplier, quoted_value, final_value, finance_notes) values ('CIMENTO TESTE', 10, 'saco', 'high', $1, 'purchased', 'FORNECEDOR FALSO', 99, 88, 'nota falsa') returning id, status, supplier, quoted_value, final_value, finance_notes, requested_by, status_changed_at",
    [work],
  )
  ok('qualquer usuário solicita uma compra', !r1.error, r1.error?.message)
  const row = r1.rows[0]
  ok('quem solicita não preenche a parte do financeiro (status volta a "solicitada", sem fornecedor nem valores)', row.status === 'requested' && row.supplier === null && row.quoted_value === null && row.final_value === null && row.finance_notes === null, JSON.stringify(row))
  ok('a solicitação leva o nome de quem pediu', row.requested_by === req1.id)
  ok('não se solicita em nome de outro', (await attempt("insert into purchase_requests (item, requested_by) values ('x', $1)", [admin.id])).error?.code === '42501')
  ok('quantidade zero é rejeitada', (await attempt("insert into purchase_requests (item, quantity) values ('x', 0)")).error?.code === '23514')
  ok('urgência inválida é rejeitada', (await attempt("insert into purchase_requests (item, urgency) values ('x', 'agora')")).error?.code === '23514')
  ok('item sem texto é rejeitado', (await attempt('insert into purchase_requests (item) values (NULL)')).error?.code === '23502')

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
  ok('o admin vê todas', (await ids('obras_authenticated', admin.id)) === 1)
  ok('anônimo não vê', (await ids('obras_anon', null)) === 0)

  // ---------------------------------------------------------------- o solicitante mexe só enquanto "solicitada"
  await as('obras_authenticated', req1.id)
  ok('edita a própria solicitação enquanto está "solicitada"', (await attempt("update purchase_requests set quantity = 12, notes = 'urgente' where id = $1", [row.id])).rowCount === 1)
  const hack = await attempt("update purchase_requests set status = 'approved' where id = $1", [row.id])
  ok('não aprova a própria solicitação', /só pode manter a solicitação ou cancelá-la/.test(hack.error?.message ?? ''), hack.error?.message)
  const keep = await attempt("update purchase_requests set supplier = 'EU', quoted_value = 1, final_value = 1 where id = $1 returning supplier, quoted_value, final_value", [row.id])
  ok('não preenche fornecedor nem valores (ficam como estavam)', keep.rows[0]?.supplier === null && keep.rows[0].quoted_value === null && keep.rows[0].final_value === null)
  await as('obras_authenticated', other.id)
  ok('outro usuário não altera a solicitação alheia', (await attempt("update purchase_requests set item = 'x' where id = $1", [row.id])).rowCount === 0)
  ok('...nem exclui', (await attempt('delete from purchase_requests where id = $1', [row.id])).rowCount === 0)
  await as('obras_authenticated', ges.id)
  ok('o gestor vê mas não altera as dos outros', (await attempt("update purchase_requests set status = 'approved' where id = $1", [row.id])).rowCount === 0)

  // ---------------------------------------------------------------- o financeiro atende
  await as('obras_authenticated', fin.id)
  const f1 = await attempt("update purchase_requests set status = 'quoting', supplier = 'LOJA X', quoted_value = 480.5 where id = $1 returning status, handled_by, status_changed_at, quoted_value, requested_by", [row.id])
  ok('o financeiro coloca em cotação e registra fornecedor e valor', f1.rows[0]?.status === 'quoting' && Number(f1.rows[0].quoted_value) === 480.5, f1.error?.message)
  ok('guarda quem atendeu e quando', f1.rows[0]?.handled_by === fin.id && !!f1.rows[0].status_changed_at)
  ok('quem pediu não muda', f1.rows[0]?.requested_by === req1.id)
  const f2 = await attempt("update purchase_requests set status = 'purchased', final_value = 470, invoice_number = 'NF-1' where id = $1 returning status, purchased_at, final_value", [row.id])
  ok('situação inválida é rejeitada', (await attempt("update purchase_requests set status = 'comprando' where id = $1", [row.id])).error?.code === '23514')
  ok('"comprada" sem data grava a data de hoje', f2.rows[0]?.status === 'purchased' && !!f2.rows[0].purchased_at && Number(f2.rows[0].final_value) === 470)

  await as('obras_authenticated', req1.id)
  const late = await attempt("update purchase_requests set quantity = 1 where id = $1", [row.id])
  ok('depois de atendida o solicitante não altera mais', /já está com o financeiro/.test(late.error?.message ?? ''), late.error?.message)
  ok('...nem exclui', (await attempt('delete from purchase_requests where id = $1', [row.id])).rowCount === 0)
  const r2 = (await one("insert into purchase_requests (item) values ('PARA CANCELAR') returning id")).id
  ok('cancela a própria solicitação enquanto está "solicitada"', (await attempt("update purchase_requests set status = 'cancelled' where id = $1", [r2])).rowCount === 1)
  const r3 = (await one("insert into purchase_requests (item) values ('PARA EXCLUIR') returning id")).id
  ok('exclui a própria solicitação enquanto está "solicitada"', (await attempt('delete from purchase_requests where id = $1', [r3])).rowCount === 1)

  // o financeiro não é equipe interna: lê as obras, mas não altera
  await as('obras_authenticated', fin.id)
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

  await as('obras_authenticated', admin.id)
  ok('o admin também vê os pagamentos', (await q('select id from team_payments where id = $1', [pay.rows[0].id])).length === 1)
  for (const [nome, sub] of [['o gestor', ges.id], ['o solicitante/prestador', req1.id]]) {
    await as('obras_authenticated', sub)
    ok(`${nome} NÃO vê os pagamentos da equipe`, Number((await one('select count(*) n from team_payments')).n) === 0)
    ok(`${nome} NÃO lança pagamento`, (await attempt("insert into team_payments (member_id, reference, payment_amount) values ($1, 'x', 1)", [member.id])).error?.code === '42501')
  }
  await as('obras_anon', null)
  ok('anônimo não vê pagamentos', (await attempt('select id from team_payments')).error?.code === '42501' || Number((await one('select count(*) n from team_payments')).n) === 0)

  // excluir o membro mantém o pagamento (com o nome guardado)
  await c.query('RESET ROLE')
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
