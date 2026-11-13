// Testa (RLS, transação desfeita no final): o Financeiro CONSULTA as áreas financeiras (27_financeiro_consulta.sql) e não
// grava nada fora do Faturamento. Se a migração 27 ainda não está aplicada, ela roda DENTRO da transação.
// Uso: node db/azure/test-financeiro-consulta.mjs (lê DATABASE_URL do .env.local)
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
const count = async (t) => Number((await one(`select count(*)::int n from public.${t}`)).n)

try {
  await c.query('BEGIN')
  if (!(await one("select 1 x from pg_policies where tablename = 'expenses' and policyname = 'expenses_financeiro_read'"))) {
    await c.query(readFileSync('db/azure/27_financeiro_consulta.sql', 'utf8'))
    console.log('(migração 27 aplicada dentro da transação, ainda não está no banco)')
  }
  const [adm] = await q("select id from profiles where lower(role) = 'admin' order by email limit 1")
  const [fin, ges, pre] = await q("select id from profiles where lower(role) = 'prestador' order by email limit 3")
  await c.query("update profiles set role = 'financeiro' where id = $1", [fin.id])
  await c.query("update profiles set role = 'gestor' where id = $1", [ges.id])
  const work = (await one('select id from works limit 1')).id

  // dados de teste nas tabelas que eram fechadas
  await internal()
  await c.query("insert into expenses (work_id, description, value) values ($1, 'DESPESA TESTE FIN', 123.45)", [work])
  await c.query("insert into revenues (work_id, description, value) values ($1, 'RECEITA TESTE FIN', 678.9)", [work])
  await c.query("insert into external_contracts (work_id, service_description, total_value) values ($1, 'CONTRATO TESTE FIN', 999)", [work])
  await c.query("insert into worker_groups (name) values ('GRUPO TESTE FIN')")

  // ---------------------------------------------------------------- lê tudo o que foi liberado (mesma contagem do dono do banco)
  const READ = [
    'expenses', 'revenues', 'work_extra_material_values', 'work_goals', 'work_goal_members', 'attendance_records',
    'attendance_extras', 'external_contracts', 'worker_groups', 'service_providers', 'works', 'work_services',
    'work_extra_materials', 'work_rented_materials', 'work_stages', 'materials', 'material_movements', 'team_members',
    'equipment', 'equipment_maintenances', 'work_diaries', 'company_settings', 'purchase_requests', 'team_payments',
  ]
  const owner = {}
  await internal()
  for (const t of READ) owner[t] = await count(t)
  await user(fin.id)
  for (const t of READ) {
    const r = await attempt(`select count(*)::int n from public.${t}`)
    ok(`o financeiro lê ${t} (${owner[t]} linha(s))`, !r.error && r.rows[0].n === owner[t], r.error?.message ?? `${r.rows[0]?.n} de ${owner[t]}`)
  }
  ok('as tabelas de teste têm linhas (a comparação vale)', owner.expenses >= 1 && owner.revenues >= 1 && owner.external_contracts >= 1 && owner.worker_groups >= 1 && owner.attendance_records >= 1)
  const exp = await attempt("select value from expenses where description = 'DESPESA TESTE FIN'")
  ok('lê o valor da despesa', Number(exp.rows[0]?.value) === 123.45)

  // ---------------------------------------------------------------- não grava nada (só consulta)
  const W = [
    ['expenses', "insert into expenses (description, value) values ('x', 1)"],
    ['revenues', "insert into revenues (description, value) values ('x', 1)"],
    ['works', "insert into works (name) values ('x')"],
    ['materials', "insert into materials (name, unit_of_measure) values ('x', 'un')"],
    ['team_members', "insert into team_members (name) values ('x')"],
    ['attendance_records', "insert into attendance_records (worker_id, date, is_present) select id, '2026-01-01', true from team_members limit 1"],
    ['attendance_extras', "insert into attendance_extras (worker_id, week_start_date, extra_value) select id, '2026-01-03', 5 from team_members limit 1"],
    ['external_contracts', "insert into external_contracts (service_description) values ('x')"],
    ['worker_groups', "insert into worker_groups (name) values ('x')"],
    ['equipment', "insert into equipment (name) values ('x')"],
    ['work_services', 'insert into work_services (work_id) values ($1)'],
  ]
  for (const [t, sql] of W) {
    const r = await attempt(sql, sql.includes('$1') ? [work] : [])
    ok(`o financeiro NÃO cria em ${t}`, r.error?.code === '42501' || (!r.error && r.rowCount === 0), r.error?.message ?? `rowCount ${r.rowCount}`)
  }
  for (const [t, sql] of [
    ['expenses', "update expenses set value = 1 where description = 'DESPESA TESTE FIN'"],
    ['revenues', "update revenues set value = 1 where description = 'RECEITA TESTE FIN'"],
    ['works', 'update works set notes = $1 where id = $2'],
    ['team_members', "update team_members set daily_cost = 1 where id = (select id from team_members limit 1)"],
    ['external_contracts', "update external_contracts set total_value = 1 where service_description = 'CONTRATO TESTE FIN'"],
    ['worker_groups', "update worker_groups set name = 'y' where name = 'GRUPO TESTE FIN'"],
    ['materials', "update materials set unit_price = 1 where id = (select id from materials limit 1)"],
  ]) {
    const r = await attempt(sql, sql.includes('$1') ? ['x', work] : [])
    ok(`o financeiro NÃO altera ${t}`, !!r.error || r.rowCount === 0, `rowCount ${r.rowCount}`)
  }
  for (const [t, sql] of [
    ['expenses', "delete from expenses where description = 'DESPESA TESTE FIN'"],
    ['revenues', "delete from revenues where description = 'RECEITA TESTE FIN'"],
    ['external_contracts', "delete from external_contracts where service_description = 'CONTRATO TESTE FIN'"],
    ['worker_groups', "delete from worker_groups where name = 'GRUPO TESTE FIN'"],
    ['attendance_records', 'delete from attendance_records'],
  ]) {
    const r = await attempt(sql)
    ok(`o financeiro NÃO exclui de ${t}`, !!r.error || r.rowCount === 0, `rowCount ${r.rowCount}`)
  }

  // ---------------------------------------------------------------- continua fechado para o financeiro
  const CLOSED = ['team_member_documents', 'planner_tasks', 'planner_task_attachments', 'vehicles', 'vehicle_maintenances', 'vehicle_fuel_receipts', 'house_maintenances', 'airbnb_properties', 'airbnb_rentals', 'airbnb_transactions']
  for (const t of CLOSED) {
    await user(fin.id)
    const r = await attempt(`select count(*)::int n from public.${t}`)
    ok(`o financeiro NÃO lê ${t}`, !!r.error || r.rows[0].n === 0, r.error?.message ?? `${r.rows[0]?.n}`)
  }

  // ---------------------------------------------------------------- os outros papéis não ganharam nada
  for (const [nome, sub] of [['o gestor', ges.id], ['o prestador', pre.id]]) {
    await user(sub)
    for (const t of ['expenses', 'revenues', 'work_extra_material_values']) {
      const r = await attempt(`select count(*)::int n from public.${t}`)
      ok(`${nome} NÃO lê ${t}`, !!r.error || r.rows[0].n === 0, r.error?.message ?? `${r.rows[0]?.n}`)
    }
  }
  await user(pre.id)
  for (const t of ['attendance_records', 'external_contracts', 'worker_groups']) {
    const r = await attempt(`select count(*)::int n from public.${t}`)
    ok(`o prestador continua sem ler ${t}`, !!r.error || r.rows[0].n === 0, r.error?.message ?? `${r.rows[0]?.n}`)
  }
  await user(adm.id)
  ok('o admin segue lendo despesas e receitas', (await count('expenses')) >= 1 && (await count('revenues')) >= 1)
  await as('obras_anon', null)
  const anon = await attempt('select count(*)::int n from public.expenses')
  ok('anônimo não lê despesas', !!anon.error || anon.rows[0].n === 0)
} catch (e) {
  console.log('ERRO', e.message)
  failed++
} finally {
  await c.query('ROLLBACK')
  await c.end()
}
console.log(failed ? `\n${failed} FALHA(S)` : '\nTudo certo (transação desfeita)')
process.exit(failed ? 1 : 0)
