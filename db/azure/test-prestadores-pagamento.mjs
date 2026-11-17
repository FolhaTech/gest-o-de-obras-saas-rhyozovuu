// Testa (RLS, transação desfeita no final): solicitação de pagamento de prestadores de serviços externos
// (32_pagamento_prestadores.sql): o admin abre com Nome, PIX, Tratativa, NF, Casa, Valor e Vencimento; o financeiro paga.
// Se a migração 32 ainda não está aplicada, ela roda DENTRO da transação (e é desfeita junto).
// Uso: node db/azure/test-prestadores-pagamento.mjs (lê DATABASE_URL do .env.local)
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
const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10))

try {
  await c.query('BEGIN')
  if (!(await one("select to_regclass('public.provider_payments') t")).t) {
    await c.query(readFileSync('db/azure/32_pagamento_prestadores.sql', 'utf8'))
    console.log('(migração 32 aplicada dentro da transação, ainda não está no banco)')
  }
  const [adm, adm2] = await q("select id from profiles where lower(role) = 'admin' order by email limit 2")
  const [fin, ges, pre] = await q("select id from profiles where lower(role) = 'prestador' order by email limit 3")
  await c.query("update profiles set role = 'financeiro' where id = $1", [fin.id])
  await c.query("update profiles set role = 'gestor' where id = $1", [ges.id])
  const work = await one('select id, name from works order by name limit 1')
  const provider = await one('select id, name from service_providers order by name limit 1')
  const today = iso((await one('select public.today_br() d')).d)

  const base = {
    provider_name: '  Pedro Pintor  ',
    pix_key: ' 123.456.789-00 ',
    service_type: 'Pintura externa',
    invoice_number: 'NF 1234',
    work_id: work.id,
    payment_amount: 1500.5,
    due_date: '2099-12-31',
  }
  const open = async (sub, over = {}) => {
    const v = { ...base, ...over }
    await user(sub)
    return attempt(
      `insert into provider_payments (provider_id, provider_name, pix_key, service_type, invoice_number, work_id, payment_amount, due_date, notes, status, paid_at, paid_by, payment_method, finance_notes)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) returning *`,
      [v.provider_id ?? null, v.provider_name, v.pix_key, v.service_type, v.invoice_number, v.work_id, v.payment_amount, v.due_date, v.notes ?? null, v.status ?? 'requested', v.paid_at ?? null, v.paid_by ?? null, v.payment_method ?? null, v.finance_notes ?? null],
    )
  }
  const get = async (id) => {
    const prev = null
    await internal()
    return one('select * from provider_payments where id = $1', [id])
  }

  // ---------------------------------------------------------------- o admin abre a solicitação
  const r1 = await open(adm.id, { notes: '  pagar até sexta ' })
  ok('o admin abre a solicitação com os 7 dados', !r1.error, r1.error?.message)
  const row = r1.rows[0]
  ok('nome, PIX, tratativa e NF ficam sem espaços nas pontas', row.provider_name === 'Pedro Pintor' && row.pix_key === '123.456.789-00' && row.service_type === 'Pintura externa' && row.invoice_number === 'NF 1234' && row.notes === 'pagar até sexta')
  ok('nasce aberta, em nome de quem abriu, com a casa guardada pelo nome', row.status === 'requested' && row.requested_by === adm.id && row.work_id === work.id && row.work_name === work.name.trim() && Number(row.payment_amount) === 1500.5 && iso(row.due_date) === '2099-12-31')
  const spoof = await open(adm.id, { status: 'paid', paid_at: '2020-01-01', paid_by: fin.id, payment_method: 'Dinheiro', finance_notes: 'falso' })
  ok('quem abre não preenche a parte do pagamento (volta a aberta, sem pago)', spoof.rows[0]?.status === 'requested' && spoof.rows[0].paid_at === null && spoof.rows[0].paid_by === null && spoof.rows[0].payment_method === null && spoof.rows[0].finance_notes === null, spoof.error?.message)
  const asOther = await (async () => { await user(adm.id); return attempt("insert into provider_payments (provider_name, pix_key, service_type, invoice_number, work_id, payment_amount, due_date, requested_by) values ('x','x','x','x',$1,1,'2099-01-01',$2) returning requested_by", [work.id, adm2.id]) })()
  ok('não se abre em nome de outro (o nome de quem abriu vem do login)', asOther.rows[0]?.requested_by === adm.id, asOther.error?.message)

  // ---------------------------------------------------------------- dados obrigatórios
  for (const [campo, over, msg] of [
    ['nome', { provider_name: '   ' }, /nome do prestador/],
    ['PIX', { pix_key: '' }, /Informe o PIX/],
    ['tratativa', { service_type: ' ' }, /tratativa/],
    ['NF', { invoice_number: '' }, /NF/],
    ['casa', { work_id: null }, /casa/],
  ]) {
    const r = await open(adm.id, over)
    ok(`sem ${campo}: recusa`, msg.test(r.error?.message ?? ''), r.error?.message)
  }
  ok('valor zero ou negativo é recusado', (await open(adm.id, { payment_amount: 0 })).error?.code === '23514' && (await open(adm.id, { payment_amount: -5 })).error?.code === '23514')
  ok('sem vencimento é recusado', (await open(adm.id, { due_date: null })).error?.code === '23502')
  const prov = await open(adm.id, { provider_id: provider.id, provider_name: '' })
  ok('com o prestador cadastrado e sem o nome, o nome vem do cadastro', prov.rows[0]?.provider_name === provider.name.trim() && prov.rows[0].provider_id === provider.id, prov.error?.message)

  // ---------------------------------------------------------------- quem abre e quem lê
  for (const [nome, sub] of [['o financeiro', fin.id], ['o gestor', ges.id], ['o prestador', pre.id]]) {
    ok(`${nome} NÃO abre solicitação de pagamento`, (await open(sub)).error?.code === '42501')
  }
  const count = async (role, sub) => {
    await as(role, sub)
    const r = await attempt('select id from provider_payments where id = $1', [row.id])
    return r.error ? -1 : r.rows.length
  }
  ok('o admin lê', (await count('obras_authenticated', adm.id)) === 1)
  ok('o financeiro lê', (await count('obras_authenticated', fin.id)) === 1)
  ok('o gestor NÃO lê (são valores)', (await count('obras_authenticated', ges.id)) === 0)
  ok('o prestador NÃO lê', (await count('obras_authenticated', pre.id)) === 0)
  ok('anônimo NÃO lê', (await count('obras_anon', null)) <= 0)

  // ---------------------------------------------------------------- o financeiro paga (e só isso)
  await user(fin.id)
  const finEdit = await attempt("update provider_payments set provider_name = 'OUTRO', pix_key = 'x', payment_amount = 1, due_date = '2000-01-01', work_id = null, invoice_number = 'x', notes = 'x' where id = $1 returning provider_name, pix_key, payment_amount, due_date, work_id, invoice_number, notes", [row.id])
  ok('o financeiro não altera os dados da solicitação', finEdit.rows[0]?.provider_name === 'Pedro Pintor' && Number(finEdit.rows[0].payment_amount) === 1500.5 && finEdit.rows[0].work_id === work.id && finEdit.rows[0].pix_key === '123.456.789-00' && finEdit.rows[0].notes === 'pagar até sexta', finEdit.error?.message)
  const finCancel = await attempt("update provider_payments set status = 'cancelled' where id = $1", [row.id])
  ok('o financeiro não cancela', /Só o administrador cancela/.test(finCancel.error?.message ?? ''), finCancel.error?.message)
  const future = await attempt("update provider_payments set status = 'paid', paid_at = '2099-01-01' where id = $1", [row.id])
  ok('data do pagamento no futuro é recusada', /futuro/.test(future.error?.message ?? ''), future.error?.message)
  await user(adm.id)
  const admPay = await attempt("update provider_payments set status = 'paid' where id = $1", [row.id])
  ok('o admin não paga (é do contas a pagar)', /Só o financeiro/.test(admPay.error?.message ?? ''), admPay.error?.message)
  await user(fin.id)
  const pay = await attempt("update provider_payments set status = 'paid', finance_notes = '  comprovante enviado ' where id = $1 returning status, paid_at, paid_by, payment_method, finance_notes, payment_amount, provider_name", [row.id])
  ok('o financeiro paga: data de hoje, quem pagou, forma PIX por padrão e a observação', pay.rows[0]?.status === 'paid' && iso(pay.rows[0].paid_at) === today && pay.rows[0].paid_by === fin.id && pay.rows[0].payment_method === 'PIX' && pay.rows[0].finance_notes === 'comprovante enviado' && Number(pay.rows[0].payment_amount) === 1500.5, pay.error?.message ?? JSON.stringify(pay.rows[0]))

  // pago é final
  const afterAdm = await (async () => { await user(adm.id); return attempt("update provider_payments set payment_amount = 1 where id = $1", [row.id]) })()
  ok('depois de paga o admin não altera', /já foi feito/.test(afterAdm.error?.message ?? ''), afterAdm.error?.message)
  await user(fin.id)
  const finAfter = await attempt("update provider_payments set finance_notes = 'depois', payment_amount = 9, status = 'requested', paid_at = '2000-01-01', payment_method = 'Cheque', provider_name = 'Z' where id = $1 returning finance_notes, payment_amount, status, paid_at, payment_method, provider_name", [row.id])
  ok('depois de paga o financeiro só anota: valor, situação, data e forma ficam como estavam', finAfter.rows[0]?.finance_notes === 'depois' && Number(finAfter.rows[0].payment_amount) === 1500.5 && finAfter.rows[0].status === 'paid' && iso(finAfter.rows[0].paid_at) === today && finAfter.rows[0].payment_method === 'PIX' && finAfter.rows[0].provider_name === 'Pedro Pintor', finAfter.error?.message ?? JSON.stringify(finAfter.rows[0]))
  const delPaid = await (async () => { await user(adm.id); return attempt('delete from provider_payments where id = $1', [row.id]) })()
  ok('um pagamento feito não se exclui', /não pode ser excluído/.test(delPaid.error?.message ?? ''), delPaid.error?.message)

  // pagamento com data passada, forma escolhida
  const r2 = (await open(adm.id)).rows[0]
  await user(fin.id)
  const payPast = await attempt("update provider_payments set status = 'paid', paid_at = '2026-01-10', payment_method = 'Transferência' where id = $1 returning paid_at, payment_method", [r2.id])
  ok('o financeiro registra a data e a forma do pagamento', iso(payPast.rows[0]?.paid_at) === '2026-01-10' && payPast.rows[0].payment_method === 'Transferência', payPast.error?.message)

  // ---------------------------------------------------------------- o admin edita e cancela enquanto está aberta
  const r3 = (await open(adm.id)).rows[0]
  await user(adm.id)
  const edit = await attempt("update provider_payments set payment_amount = 2000, due_date = '2099-06-30', invoice_number = 'NF 99', service_type = 'Elétrica', pix_key = 'pix@x.com' where id = $1 returning payment_amount, due_date, invoice_number, service_type, pix_key", [r3.id])
  ok('o admin corrige os dados enquanto está aberta', Number(edit.rows[0]?.payment_amount) === 2000 && iso(edit.rows[0].due_date) === '2099-06-30' && edit.rows[0].invoice_number === 'NF 99' && edit.rows[0].service_type === 'Elétrica' && edit.rows[0].pix_key === 'pix@x.com', edit.error?.message)
  const editBad = await attempt("update provider_payments set pix_key = '  ' where id = $1", [r3.id])
  ok('ao editar os dados continuam obrigatórios', /Informe o PIX/.test(editBad.error?.message ?? ''), editBad.error?.message)
  const editPaid = await attempt("update provider_payments set payment_method = 'Dinheiro', paid_by = $2, paid_at = '2020-01-01' where id = $1 returning payment_method, paid_by, paid_at", [r3.id, fin.id])
  ok('o admin não preenche o pagamento por fora', editPaid.rows[0]?.payment_method === null && editPaid.rows[0].paid_by === null && editPaid.rows[0].paid_at === null, editPaid.error?.message)
  const cancel = await attempt("update provider_payments set status = 'cancelled' where id = $1 returning status", [r3.id])
  ok('o admin cancela a solicitação aberta', cancel.rows[0]?.status === 'cancelled', cancel.error?.message)
  const afterCancel = await attempt("update provider_payments set payment_amount = 5 where id = $1", [r3.id])
  ok('cancelada é final', /foi cancelada/.test(afterCancel.error?.message ?? ''), afterCancel.error?.message)
  await user(fin.id)
  ok('cancelada não se paga', /foi cancelada/.test((await attempt("update provider_payments set status = 'paid' where id = $1", [r3.id])).error?.message ?? ''))
  ok('o financeiro não exclui', (await attempt('delete from provider_payments where id = $1', [r3.id])).rowCount === 0)
  await user(adm.id)
  ok('o admin exclui uma solicitação cancelada ou aberta', (await attempt('delete from provider_payments where id = $1', [r3.id])).rowCount === 1 && (await attempt('delete from provider_payments where id = $1', [spoof.rows[0].id])).rowCount === 1)

  // ---------------------------------------------------------------- a casa excluída não apaga a solicitação
  await internal()
  const tmpWork = (await one("insert into works (name) values ('CASA TESTE PRESTADOR') returning id")).id
  const r4 = (await open(adm.id, { work_id: tmpWork })).rows[0]
  ok('a casa fica guardada pelo nome', r4.work_name === 'CASA TESTE PRESTADOR')
  await internal()
  await c.query('delete from works where id = $1', [tmpWork])
  const kept = await get(r4.id)
  ok('excluir a casa mantém a solicitação com o nome da casa', kept.work_id === null && kept.work_name === 'CASA TESTE PRESTADOR')
  await internal()
  const internalRow = await attempt("insert into provider_payments (provider_name, pix_key, service_type, invoice_number, payment_amount, due_date, status) values ('Interno', '', '', '', 5, '2099-01-01', 'paid') returning status", [])
  ok('rotinas internas do banco gravam sem as travas (migrações, scripts)', internalRow.rows[0]?.status === 'paid', internalRow.error?.message)
} catch (e) {
  console.log('ERRO', e.message)
  failed++
} finally {
  await c.query('ROLLBACK')
  await c.end()
}
console.log(failed ? `\n${failed} FALHA(S)` : '\nTudo certo (transação desfeita)')
process.exit(failed ? 1 : 0)
