// Testa (RLS, transação desfeita no final): pagamento semanal da equipe calculado pela presença (26_pagamento_semanal_equipe.sql).
// Se a migração 26 ainda não está aplicada, ela roda DENTRO da transação (e é desfeita junto).
// Uso: node db/azure/test-pagamento-semanal.mjs (lê DATABASE_URL do .env.local)
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
let cur = { role: null, sub: null }
const as = async (role, sub) => {
  cur = { role, sub }
  await c.query('RESET ROLE')
  await c.query(`SET LOCAL ROLE ${role}`)
  await c.query("select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', $2, true)", [sub ?? '', 'authenticated'])
}
const internal = async () => {
  cur = { role: null, sub: null }
  await c.query('RESET ROLE')
  await c.query("select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', '', true)")
}
const user = (sub) => as('obras_authenticated', sub)

// semanas de teste (sábado a sexta): 07/03/2026 a 13/03/2026 já fechou; a semana seguinte a hoje ainda está aberta
const W = '2026-03-07'
const day = (n) => new Date(Date.UTC(2026, 2, 7 + n)).toISOString().slice(0, 10) // 0 = sábado ... 6 = sexta

try {
  await c.query('BEGIN')
  if (!(await one("select to_regclass('public.team_payment_config') t")).t) {
    await c.query(readFileSync('db/azure/26_pagamento_semanal_equipe.sql', 'utf8'))
    console.log('(migração 26 aplicada dentro da transação, ainda não está no banco)')
  }
  const cfg = await one('select auto_from from team_payment_config')
  ok('a contagem automática começa numa semana que começa no sábado', new Date(cfg.auto_from).getUTCDay() === 6 || new Date(cfg.auto_from.toISOString?.() ?? cfg.auto_from).getDay() === 6, String(cfg.auto_from))
  await c.query("update team_payment_config set auto_from = '2026-01-01'")

  const wk = await one("select public.team_week_start('2026-03-07') a, public.team_week_start('2026-03-08') b, public.team_week_start('2026-03-13') f, public.team_week_start('2026-03-14') n")
  const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10))
  ok('a semana vai de sábado a sexta (sábado e domingo abrem a semana; sexta ainda é dela; sábado seguinte abre outra)', iso(wk.a) === '2026-03-07' && iso(wk.b) === '2026-03-07' && iso(wk.f) === '2026-03-07' && iso(wk.n) === '2026-03-14', JSON.stringify(wk))

  const [adm1] = await q("select id from profiles where lower(role) = 'admin' order by email limit 1")
  const [fin, ges, other] = await q("select id from profiles where lower(role) = 'prestador' order by email limit 3")
  await c.query("update profiles set role = 'financeiro' where id = $1", [fin.id])
  await c.query("update profiles set role = 'gestor' where id = $1", [ges.id])
  const work = (await one('select id from works limit 1')).id

  const mk = async (name, rate, type = 'daily') =>
    (await one("insert into team_members (name, daily_cost, payment_type, status, work_id) values ($1, $2, $3, 'active', $4) returning id", [name, rate, type, work])).id
  const ana = await mk('ANA SEMANA', 150)
  const bia = await mk('BIA SEMANA', 200)
  const mensal = await mk('MENSAL SEMANA', 3000, 'monthly')
  // lê como dono do banco (confere o resultado) e volta ao papel que estava ativo
  const rows = async (m, w = W) => {
    const prev = cur
    await internal()
    const r = await q("select * from team_payments where member_id = $1 and week_start = $2 and source = 'attendance' order by created_at, status", [m, w])
    if (prev.role) await as(prev.role, prev.sub)
    return r
  }
  const pend = async (m, w = W) => (await rows(m, w)).filter((r) => r.status === 'pending')
  const mark = async (sub, m, date, present = true) => {
    await user(sub)
    return attempt('insert into attendance_records (worker_id, date, is_present) values ($1, $2, $3) on conflict (worker_id, date) do update set is_present = excluded.is_present returning id', [m, date, present])
  }

  // ---------------------------------------------------------------- contando conforme o admin marca a presença
  ok('sem presença, nada a pagar', (await rows(ana)).length === 0)
  const m1 = await mark(adm1.id, ana, day(0))
  ok('o admin marca presença', !m1.error, m1.error?.message)
  let p = await pend(ana)
  ok('a primeira presença já cria o pagamento pendente da semana, só dessa pessoa', p.length === 1 && Number(p[0].payment_amount) === 150 && p[0].week_days === 1 && Number(p[0].week_rate) === 150 && p[0].source === 'attendance' && p[0].member_name === 'ANA SEMANA', JSON.stringify(p[0]))
  ok('referência e período da semana (sábado a sexta)', p[0].reference === 'Semana 07/03 a 13/03' && iso(p[0].period_start) === '2026-03-07' && iso(p[0].period_end) === '2026-03-13' && p[0].status === 'pending' && p[0].paid_at === null)
  ok('o pagamento herda a obra da pessoa', p[0].work_id === work)
  ok('...e ninguém mais ganhou pagamento', (await rows(bia)).length === 0)
  await mark(adm1.id, ana, day(1))
  await mark(adm1.id, ana, day(6)) // sexta
  p = await pend(ana)
  ok('cada presença soma na mesma linha (3 dias x 150)', p.length === 1 && Number(p[0].payment_amount) === 450 && p[0].week_days === 3, JSON.stringify(p[0]))
  await mark(adm1.id, ana, day(1), false)
  p = await pend(ana)
  ok('marcar ausente desconta o dia', p.length === 1 && Number(p[0].payment_amount) === 300 && p[0].week_days === 2)
  await user(adm1.id)
  await attempt('delete from attendance_records where worker_id = $1 and date = $2', [ana, day(6)])
  p = await pend(ana)
  ok('apagar o registro de presença também desconta', Number(p[0].payment_amount) === 150 && p[0].week_days === 1)
  await mark(adm1.id, ana, day(7)) // sábado seguinte: outra semana
  ok('o sábado seguinte abre outra semana (outro pagamento)', (await pend(ana, day(7))).length === 1 && (await pend(ana, W)).length === 1)
  ok('um pagamento pendente por pessoa e semana (não duplica)', (await q("select count(*)::int n from team_payments where member_id = $1 and source = 'attendance' and status = 'pending'", [ana]))[0].n === 2)

  // extra semanal
  await user(adm1.id)
  await attempt("insert into attendance_extras (worker_id, week_start_date, extra_value) values ($1, $2, 40) on conflict (worker_id, week_start_date) do update set extra_value = excluded.extra_value", [ana, W])
  p = await pend(ana)
  ok('o extra semanal entra no valor da semana', Number(p[0].payment_amount) === 190 && Number(p[0].week_extra) === 40, JSON.stringify(p[0]))
  await attempt("update attendance_extras set extra_value = 0 where worker_id = $1 and week_start_date = $2", [ana, W])
  ok('zerar o extra volta ao valor sem extra', Number((await pend(ana))[0].payment_amount) === 150)

  // extra negativo = desconto (vale)
  await attempt("update attendance_extras set extra_value = -100 where worker_id = $1 and week_start_date = $2", [ana, W])
  p = await pend(ana)
  ok('extra negativo é desconto (150 - 100 = 50)', p.length === 1 && Number(p[0].payment_amount) === 50 && Number(p[0].week_extra) === -100, JSON.stringify(p[0]))
  await attempt("update attendance_extras set extra_value = -500 where worker_id = $1 and week_start_date = $2", [ana, W])
  ok('desconto maior que o valor da semana: nada a pagar (não vira valor negativo)', (await pend(ana)).length === 0)
  await attempt("update attendance_extras set extra_value = 0 where worker_id = $1 and week_start_date = $2", [ana, W])
  ok('tirando o desconto o pagamento volta', Number((await pend(ana))[0]?.payment_amount) === 150)

  // separado por pessoas
  await mark(adm1.id, bia, day(0))
  await mark(adm1.id, bia, day(2))
  const pb = await pend(bia)
  ok('cada pessoa tem o seu pagamento (Bia: 2 x 200)', pb.length === 1 && Number(pb[0].payment_amount) === 400 && pb[0].member_name === 'BIA SEMANA')
  ok('Ana segue com o dela', Number((await pend(ana))[0].payment_amount) === 150)
  // mensalista fora
  await mark(adm1.id, mensal, day(0))
  ok('mensalista não entra no pagamento semanal', (await rows(mensal)).length === 0)

  // a diária mudou: recalcula a semana pendente
  await internal()
  await c.query('update team_members set daily_cost = 180 where id = $1', [ana])
  p = await pend(ana)
  ok('mudar a diária recalcula a semana ainda pendente', Number(p[0].payment_amount) === 180 && Number(p[0].week_rate) === 180, JSON.stringify(p[0]))
  await c.query('update team_members set daily_cost = 150 where id = $1', [ana])

  // semana antes da data de início não conta
  await c.query("update team_payment_config set auto_from = '2026-03-07'")
  await mark(adm1.id, ana, '2026-02-28')
  ok('semana anterior à data de início não gera pagamento (o histórico não vira pendência)', (await rows(ana, '2026-02-28')).length === 0)
  await c.query("update team_payment_config set auto_from = '2026-01-01'")

  // ---------------------------------------------------------------- quem vê e quem paga
  await user(fin.id)
  const seeFin = await attempt("select payment_amount, week_days, week_rate from team_payments where member_id = $1 and week_start = $2", [ana, W])
  ok('o financeiro vê o pagamento calculado, com os dias e a diária', seeFin.rows.length === 1 && Number(seeFin.rows[0].payment_amount) === 150)
  await user(adm1.id)
  ok('o admin vê', (await attempt('select id from team_payments where member_id = $1', [ana])).rows.length >= 1)
  for (const [nome, sub] of [['o gestor', ges.id], ['outro usuário', other.id]]) {
    await user(sub)
    ok(`${nome} NÃO vê os pagamentos calculados`, Number((await one('select count(*) n from team_payments')).n) === 0)
  }
  // o gestor marca presença (pode, é equipe interna) e o pagamento é calculado mesmo assim
  const gm = await mark(ges.id, bia, day(3))
  ok('o gestor marca presença e o cálculo acontece (sem ele poder ver o valor)', !gm.error && Number((await pend(bia))[0].payment_amount) === 600, gm.error?.message)

  // semana aberta não se paga
  const openWeek = (await one("select public.team_week_start(public.today_br()) + 7 d")).d
  const openIso = iso(openWeek)
  await internal()
  await c.query("insert into attendance_records (worker_id, date, is_present) values ($1, $2, true)", [ana, openIso])
  const openRow = (await pend(ana, openIso))[0]
  ok('a semana que ainda vai começar também vai contando', !!openRow && Number(openRow.payment_amount) === 150)
  await user(fin.id)
  const early = await attempt("update team_payments set status = 'paid' where id = $1", [openRow.id])
  ok('semana aberta não se paga antes de fechar', /ainda não fechou/.test(early.error?.message ?? ''), early.error?.message)

  // ---------------------------------------------------------------- semana fechada: o financeiro paga, pessoa por pessoa
  const ana1 = (await pend(ana))[0]
  const edit = await attempt("update team_payments set payment_amount = 9999, member_id = $2, reference = 'outra', period_start = '2020-01-01', week_days = 99, week_rate = 1, work_id = null, notes = 'obs', payment_method = 'PIX' where id = $1 returning payment_amount, member_id, reference, period_start, week_days, week_rate, work_id, notes, payment_method", [ana1.id, bia])
  ok('o financeiro não muda valor, pessoa nem período; só forma e observação', edit.rows[0] && Number(edit.rows[0].payment_amount) === 150 && edit.rows[0].member_id === ana && edit.rows[0].reference === 'Semana 07/03 a 13/03' && edit.rows[0].week_days === 1 && Number(edit.rows[0].week_rate) === 150 && edit.rows[0].work_id === work && edit.rows[0].notes === 'obs' && edit.rows[0].payment_method === 'PIX', edit.error?.message ?? JSON.stringify(edit.rows[0]))
  await user(adm1.id)
  const admPay = await attempt("update team_payments set payment_amount = 1 where id = $1 returning payment_amount", [ana1.id])
  ok('nem o admin muda o valor calculado', Number(admPay.rows[0]?.payment_amount) === 150)
  await user(fin.id)
  const pay = await attempt("update team_payments set status = 'paid' where id = $1 returning status, paid_at", [ana1.id])
  ok('semana fechada: o financeiro paga a Ana (data de hoje)', pay.rows[0]?.status === 'paid' && !!pay.rows[0].paid_at, pay.error?.message)
  ok('...e a Bia segue pendente', (await pend(bia)).length === 1)
  const back = await attempt("update team_payments set status = 'pending' where id = $1", [ana1.id])
  ok('pagamento feito não volta a pendente', /já foi feito/.test(back.error?.message ?? ''), back.error?.message)
  ok('o financeiro não exclui pagamento calculado', /só o administrador exclui/.test((await attempt('delete from team_payments where id = $1', [ana1.id])).error?.message ?? ''))

  // presença muda depois de paga: só a diferença
  await internal()
  await c.query('update team_members set daily_cost = 200 where id = $1', [ana]) // reajuste depois do pagamento
  await mark(adm1.id, ana, day(2))
  let a = await rows(ana)
  const paidA = a.filter((r) => r.status === 'paid')
  const pendA = a.filter((r) => r.status === 'pending')
  ok('presença nova depois do pagamento gera só o complemento', paidA.length === 1 && Number(paidA[0].payment_amount) === 150 && pendA.length === 1 && Number(pendA[0].payment_amount) === 150, JSON.stringify(a.map((r) => [r.status, r.payment_amount])))
  ok('o complemento usa a diária que valeu na semana paga (150), não o reajuste (200)', Number(pendA[0].week_rate) === 150 && pendA[0].week_days === 2 && /complemento/.test(pendA[0].reference), JSON.stringify(pendA[0]))
  await user(fin.id)
  const pay2 = await attempt("update team_payments set status = 'paid' where id = $1 returning status", [pendA[0].id])
  ok('o financeiro paga o complemento', pay2.rows[0]?.status === 'paid')
  await mark(adm1.id, ana, day(2), false)
  a = await rows(ana)
  ok('se a presença cai depois de paga, nada fica pendente e o pago continua', a.length === 2 && a.every((r) => r.status === 'paid'), JSON.stringify(a.map((r) => [r.status, r.payment_amount])))
  await c.query("update team_members set daily_cost = 150 where id = $1", [ana])

  // admin exclui um pagamento calculado pendente
  await user(adm1.id)
  const bpend = (await pend(bia))[0]
  ok('o admin exclui um pagamento calculado pendente', (await attempt('delete from team_payments where id = $1', [bpend.id])).rowCount === 1)
  await mark(adm1.id, bia, day(4))
  ok('a próxima presença recalcula e recria o pendente da semana (3 dias já marcados: 0, 2, 3 e 4 = 4 x 200)', Number((await pend(bia))[0]?.payment_amount) === 800)

  // pagamento lançado à mão continua igual
  await user(fin.id)
  const manual = await attempt("insert into team_payments (member_id, reference, payment_amount, source, week_start, week_days, week_rate) values ($1, 'AVULSO', 55, 'attendance', '2026-03-07', 9, 9) returning source, week_start, week_days, week_rate, status", [ana])
  ok('pagamento lançado à mão nasce manual (não se finge de calculado)', manual.rows[0]?.source === 'manual' && manual.rows[0].week_start === null && manual.rows[0].week_days === null && manual.rows[0].week_rate === null, manual.error?.message)
  const manualEdit = await attempt("update team_payments set payment_amount = 60, source = 'attendance' where id = (select id from team_payments where reference = 'AVULSO') returning payment_amount, source", [])
  ok('o pagamento manual continua editável (valor), sem virar calculado', Number(manualEdit.rows[0]?.payment_amount) === 60 && manualEdit.rows[0].source === 'manual')
  const manualDel = await attempt("delete from team_payments where reference = 'AVULSO'", [])
  ok('e o financeiro ainda exclui o pagamento manual', manualDel.rowCount === 1)

  // excluir a pessoa mantém o pagamento (com o nome guardado)
  await internal()
  await c.query('delete from team_members where id = $1', [bia])
  const kept = await q("select member_id, member_name from team_payments where member_name = 'BIA SEMANA'")
  ok('excluir a pessoa mantém o pagamento com o nome guardado', kept.length >= 1 && kept.every((r) => r.member_id === null))
} catch (e) {
  console.log('ERRO', e.message)
  failed++
} finally {
  await c.query('ROLLBACK')
  await c.end()
}
console.log(failed ? `\n${failed} FALHA(S)` : '\nTudo certo (transação desfeita)')
process.exit(failed ? 1 : 0)
