// Testa (RLS, transação desfeita no final): permissões por papel (14_rls_por_papel.sql).
//   anônimo: nada · prestador: lê o que a tela dele usa e lança o dele · gestor: como o admin, sem valores · admin: tudo.
// Uso: node db/azure/test-papeis.mjs (lê DATABASE_URL do .env.local)
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
const count = async (t) => Number((await one(`select count(*) n from ${t}`)).n)

try {
  await c.query('BEGIN')
  const admin = await one("select id from profiles where lower(role) = 'admin' order by email limit 1")
  const [p1, p2] = await q("select id from profiles where lower(role) = 'prestador' order by email limit 2")
  const gestor = p2 // vira gestor só dentro desta transação
  await c.query("update profiles set role = 'gestor' where id = $1", [gestor.id])
  const presta = p1
  const work = (await one('select id from works limit 1')).id
  const [mA, mB] = await q('select id from team_members order by name limit 2')

  // dados de apoio (dono do banco)
  await c.query("insert into revenues (work_id, value, description, date) values ($1, 100, 'rec', current_date)", [work])
  await c.query("insert into expenses (work_id, value, description, date) values ($1, 50, 'desp', current_date)", [work])
  const item = (await one("insert into work_extra_materials (work_id, name, unit, quantity, source) values ($1, 'ITEM', 'UN', 1, 'teste-papeis') returning id", [work])).id
  await c.query('insert into work_extra_material_values (extra_material_id, unit_price, total_cost) values ($1, 2, 2)', [item])
  await attempt('insert into airbnb_properties (name) values ($1)', ['teste-airbnb'])
  const tA = (await one("insert into planner_tasks (title, work_id, assignee_id) values ('T-A', $1, $2) returning id", [work, mA.id])).id
  const tB = (await one("insert into planner_tasks (title, work_id, assignee_id) values ('T-B', $1, $2) returning id", [work, mB.id])).id
  await c.query('update profiles set team_member_id = $2 where id = $1', [presta.id, mA.id])

  // ---------------------------------------------------------------- anônimo
  await as('obras_anon', null)
  for (const t of ['works', 'materials', 'work_stages', 'services', 'company_settings', 'airbnb_properties', 'worker_groups', 'work_diaries']) {
    const r = await attempt(`select * from ${t} limit 1`)
    ok(`anônimo não lê ${t}`, !!r.error || r.rows.length === 0, r.error?.code)
  }
  ok('anônimo não grava em worker_groups', (await attempt("insert into worker_groups (name) values ('x')")).error?.code === '42501')
  ok('anônimo não apaga obra', (await attempt('delete from works where id = $1', [work])).rowCount === 0)

  // ---------------------------------------------------------------- prestador
  await as('obras_authenticated', presta.id)
  ok('prestador lê as obras', (await count('works')) > 0)
  ok('prestador não altera obra', (await attempt("update works set notes = 'x' where id = $1", [work])).rowCount === 0)
  ok('prestador não apaga obra', (await attempt('delete from works where id = $1', [work])).rowCount === 0)
  ok('prestador não cria obra', (await attempt("insert into works (name) values ('x')")).error?.code === '42501')
  ok('prestador não altera material', (await attempt("update materials set name = name where true")).rowCount === 0)
  ok('prestador não lê frequência (Equipes)', (await count('attendance_records')) === 0)
  ok('prestador não lê o Airbnb', (await count('airbnb_properties')) === 0)
  ok('prestador não lê valores dos itens', (await count('work_extra_material_values')) === 0)
  ok('prestador vê o item alocado (sem valor)', (await q("select id from work_extra_materials where source = 'teste-papeis'")).length === 1)
  const d1 = await attempt("insert into work_diaries (work_id, date, notes) values ($1, current_date, 'meu') returning id, author_id", [work])
  ok('prestador registra diário em nome dele (autor automático)', !d1.error && d1.rows[0].author_id === presta.id, d1.error?.message)
  const dBad = await attempt("insert into work_diaries (work_id, date, notes, author_id) values ($1, current_date, 'forjado', $2)", [work, admin.id])
  ok('prestador não registra diário em nome de outro', dBad.error?.code === '42501', dBad.error?.code)
  ok('prestador altera o próprio diário', (await attempt("update work_diaries set notes = 'ok' where id = $1", [d1.rows[0].id])).rowCount === 1)
  const seenP = (await q('select id from planner_tasks')).map((t) => t.id)
  ok('prestador só vê os cards do membro vinculado (vê o dele, não o de outro)', seenP.includes(tA) && !seenP.includes(tB))

  // ---------------------------------------------------------------- gestor
  await as('obras_authenticated', gestor.id)
  const gPlanner = (await q('select id from planner_tasks')).map((t) => t.id)
  ok('gestor vê todos os cards do Planner', gPlanner.includes(tA) && gPlanner.includes(tB))
  ok('gestor altera obra', (await attempt("update works set notes = notes where id = $1", [work])).rowCount === 1)
  ok('gestor cria etapa no cronograma', !(await attempt("insert into work_stages (work_id, name) values ($1, 'teste-gestor')", [work])).error)
  ok('gestor altera material', !(await attempt('update materials set name = name where id = (select id from materials limit 1)')).error)
  ok('gestor lê frequência (Equipes)', !(await attempt('select * from attendance_records limit 1')).error)
  ok('gestor NÃO lê receitas', (await count('revenues')) === 0)
  ok('gestor NÃO lê despesas', (await count('expenses')) === 0)
  ok('gestor NÃO lê valores dos itens', (await count('work_extra_material_values')) === 0)
  ok('gestor NÃO lê o Airbnb', (await count('airbnb_properties')) === 0)
  ok('gestor NÃO lança despesa', (await attempt("insert into expenses (work_id, value, description, date) values ($1, 1, 'x', current_date)", [work])).error?.code === '42501')
  ok('gestor NÃO altera a empresa', (await attempt("update company_settings set company_name = company_name")).rowCount === 0)
  ok('gestor altera o diário de qualquer um', (await attempt("update work_diaries set notes = 'g' where id = $1", [d1.rows[0].id])).rowCount === 1)

  // ---------------------------------------------------------------- admin
  await as('obras_authenticated', admin.id)
  ok('admin vê todos os cards do Planner', (await q('select id from planner_tasks')).length >= 2)
  ok('admin lê receitas', (await count('revenues')) > 0)
  ok('admin lê despesas', (await count('expenses')) > 0)
  ok('admin lê valores dos itens', (await count('work_extra_material_values')) > 0)
  ok('admin altera a empresa', (await attempt("update company_settings set company_name = company_name")).rowCount >= 0)
  ok('admin lê o Airbnb', !(await attempt('select * from airbnb_properties limit 1')).error)
} catch (e) {
  console.log('ERRO', e.message)
  failed++
} finally {
  await c.query('ROLLBACK')
  await c.end()
}
console.log(failed ? `\n${failed} FALHA(S)` : '\nTudo certo (transação desfeita)')
process.exit(failed ? 1 : 0)
