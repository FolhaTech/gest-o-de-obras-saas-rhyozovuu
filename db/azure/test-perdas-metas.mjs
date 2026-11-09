// Testa (RLS, transação desfeita no final): financeiro fechado ao Prestador, controle de perdas de materiais
// e metas de pessoal com premiação. Uso: node db/azure/test-perdas-metas.mjs (lê DATABASE_URL do .env.local)
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
  const presta = await one("select id from profiles where lower(role) = 'prestador' order by email limit 1")
  const presta2 = await one("select id from profiles where lower(role) = 'prestador' and id <> $1 order by email limit 1", [presta.id])
  const admin = await one("select id from profiles where lower(role) = 'admin' order by email limit 1")
  const work = (await one('select id from works limit 1')).id
  const mat = await one('select id, name, unit_price from materials limit 1')

  // dados financeiros de apoio (como dono do banco)
  await c.query("insert into revenues (work_id, value, description, date) values ($1, 100, 'rec-teste', current_date)", [work])
  const fin = await q("select column_name from information_schema.columns where table_name = 'revenues'")
  const hasRev = Number((await one("select count(*) n from revenues")).n) > 0

  // ---------- financeiro ----------
  await as('obras_authenticated', presta.id)
  ok('prestador não lê receitas', (await q('select id from revenues')).length === 0)
  ok('prestador não lê despesas', (await q('select id from expenses')).length === 0)
  ok('prestador não lança despesa', (await attempt("insert into expenses (work_id, value, description, date) values ($1, 1, 'x', current_date)", [work])).error?.code === '42501')
  await as('obras_authenticated', admin.id)
  if (hasRev) ok('admin lê receitas', (await q('select id from revenues')).length > 0, `${fin.length} colunas`)
  ok('admin lança despesa', !(await attempt("insert into expenses (work_id, value, description, date) values ($1, 1, 'x', current_date)", [work])).error)

  // ---------- perdas ----------
  await as('obras_authenticated', presta.id)
  const l1 = await attempt(
    "insert into material_losses (work_id, material_id, material_name, quantity, unit, unit_cost, reason) values ($1, $2, $3, 3, 'un', $4, 'quebra') returning id, created_by",
    [work, mat.id, mat.name, mat.unit_price ?? 0],
  )
  ok('prestador registra perda (em nome dele)', !l1.error && l1.rows[0].created_by === presta.id, l1.error?.message)
  const imp = await attempt("insert into material_losses (work_id, material_name, quantity, created_by) values ($1, 'x', 1, $2)", [work, admin.id])
  ok('não registra perda em nome de outro', imp.error?.code === '42501', imp.error?.code)
  const bad = await attempt("insert into material_losses (work_id, material_name, quantity, reason) values ($1, 'x', 1, 'qualquer')", [work])
  ok('motivo inválido é rejeitado', bad.error?.code === '23514', bad.error?.code)
  const zero = await attempt("insert into material_losses (work_id, material_name, quantity) values ($1, 'x', 0)", [work])
  ok('quantidade zero é rejeitada', zero.error?.code === '23514', zero.error?.code)
  const myLoss = l1.rows[0].id
  ok('prestador altera a própria perda', (await attempt("update material_losses set notes = 'ok' where id = $1", [myLoss])).rowCount === 1)

  await as('obras_authenticated', admin.id)
  const adminLoss = (await attempt("insert into material_losses (work_id, material_name, quantity, reason) values ($1, 'cimento', 2, 'clima') returning id", [work])).rows[0].id
  ok('admin altera a perda do prestador', (await attempt("update material_losses set notes = 'adm' where id = $1", [myLoss])).rowCount === 1)

  await as('obras_authenticated', presta.id)
  ok('prestador vê as perdas de todos', (await q('select id from material_losses')).length >= 2)
  ok('prestador não altera perda de outro', (await attempt("update material_losses set notes = 'x' where id = $1", [adminLoss])).rowCount === 0)
  ok('prestador não exclui perda de outro', (await attempt('delete from material_losses where id = $1', [adminLoss])).rowCount === 0)
  ok('prestador exclui a própria perda', (await attempt('delete from material_losses where id = $1', [myLoss])).rowCount === 1)
  await as('obras_anon', null)
  ok('anônimo não acessa perdas', (await attempt('select id from material_losses')).error?.code === '42501')

  // ---------- metas ----------
  await as('obras_authenticated', presta.id)
  const g0 = await attempt("insert into work_goals (work_id, title, reward_description) values ($1, 'x', 'x')", [work])
  ok('prestador não cria meta', g0.error?.code === '42501', g0.error?.code)

  await as('obras_authenticated', admin.id)
  const goal = (await one("insert into work_goals (work_id, title, reward_description, reward_amount) values ($1, 'Meta teste', 'Bônus', 500) returning id", [work])).id
  await c.query('insert into work_goal_members (goal_id, user_id) values ($1, $2), ($1, $3)', [goal, presta.id, presta2.id])
  const goal2 = (await one("insert into work_goals (work_id, title, reward_description) values ($1, 'Meta de outro', 'Pizza') returning id", [work])).id
  await c.query('insert into work_goal_members (goal_id, user_id) values ($1, $2)', [goal2, admin.id])
  ok('admin vê todas as metas', (await q('select id from work_goals where id in ($1, $2)', [goal, goal2])).length === 2)

  await as('obras_authenticated', presta.id)
  const mine = await q('select id from work_goals')
  ok('participante vê só as metas em que está', mine.some((g) => g.id === goal) && !mine.some((g) => g.id === goal2))
  const members = await q('select user_id from work_goal_members where goal_id = $1', [goal])
  ok('participante vê os membros da equipe da meta', members.length === 2)
  ok('não vê membros de meta alheia', (await q('select user_id from work_goal_members where goal_id = $1', [goal2])).length === 0)
  ok('participante não altera a meta', (await attempt("update work_goals set reward_amount = 9999 where id = $1", [goal])).rowCount === 0)
  ok('participante não se adiciona a outra meta', (await attempt('insert into work_goal_members (goal_id, user_id) values ($1, $2)', [goal2, presta.id])).error?.code === '42501')
  ok('participante não marca a premiação como paga', (await attempt("update work_goals set paid_at = current_date where id = $1", [goal])).rowCount === 0)

  await as('obras_authenticated', admin.id)
  ok('admin marca a premiação como paga', (await attempt("update work_goals set paid_at = current_date where id = $1", [goal])).rowCount === 1)
  await as('obras_anon', null)
  ok('anônimo não lê metas', (await attempt('select id from work_goals')).error?.code === '42501')
} catch (e) {
  console.log('ERRO', e.message)
  failed++
} finally {
  await c.query('ROLLBACK')
  await c.end()
}
console.log(failed ? `\n${failed} FALHA(S)` : '\nTudo certo (transação desfeita)')
process.exit(failed ? 1 : 0)
