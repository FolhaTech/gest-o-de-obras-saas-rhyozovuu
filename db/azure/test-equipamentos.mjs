// Testa (RLS, transação desfeita no final): equipamentos e manutenções (16_equipamentos.sql).
// Uso: node db/azure/test-equipamentos.mjs (lê DATABASE_URL do .env.local)
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
  const [p1, p2] = await q("select id from profiles where lower(role) = 'prestador' order by email limit 2")
  await c.query("update profiles set role = 'gestor' where id = $1", [p2.id]) // gestor só nesta transação
  const work = (await one('select id from works limit 1')).id

  // ---------------------------------------------------------------- gestor cadastra e registra manutenção
  await as('obras_authenticated', p2.id)
  const eq = await attempt(
    "insert into equipment (name, code, purchase_date, work_id) values ('BETONEIRA TESTE', 'EQ-1', '2026-03-01', $1) returning id, status, maintenance_interval_months, initial_maintenance_count, purchase_value",
    [work],
  )
  ok('gestor cadastra equipamento', !eq.error, eq.error?.message)
  const row = eq.rows[0]
  ok('padrões: em uso, intervalo de 6 meses, 0 manutenções anteriores', row?.status === 'active' && row.maintenance_interval_months === 6 && row.initial_maintenance_count === 0)
  const m = await attempt("insert into equipment_maintenances (equipment_id, maintenance_date, description) values ($1, '2026-09-01', 'troca de óleo') returning id, created_by", [row.id])
  ok('gestor registra manutenção', !m.error, m.error?.message)
  ok('manutenção guarda quem registrou', m.rows[0]?.created_by === p2.id)
  ok('gestor edita o equipamento', (await attempt("update equipment set work_id = null where id = $1", [row.id])).rowCount === 1)

  // ---------------------------------------------------------------- restrições de dados
  ok('intervalo de 0 meses é rejeitado', (await attempt("insert into equipment (name, maintenance_interval_months) values ('x', 0)")).error?.code === '23514')
  ok('manutenções anteriores negativas são rejeitadas', (await attempt("insert into equipment (name, initial_maintenance_count) values ('x', -1)")).error?.code === '23514')
  ok('situação inválida é rejeitada', (await attempt("insert into equipment (name, status) values ('x', 'perdido')")).error?.code === '23514')
  ok('valor de compra negativo é rejeitado', (await attempt("insert into equipment (name, purchase_value) values ('x', -5)")).error?.code === '23514')
  ok('manutenção sem equipamento é rejeitada', (await attempt("insert into equipment_maintenances (equipment_id) values ('00000000-0000-0000-0000-000000000000')")).error?.code === '23503')

  // ---------------------------------------------------------------- prestador só consulta
  await as('obras_authenticated', p1.id)
  ok('prestador vê os equipamentos', (await q('select id from equipment where id = $1', [row.id])).length === 1)
  ok('prestador vê as manutenções', (await q('select id from equipment_maintenances where equipment_id = $1', [row.id])).length === 1)
  ok('prestador não cadastra equipamento', (await attempt("insert into equipment (name) values ('x')")).error?.code === '42501')
  ok('prestador não altera equipamento', (await attempt("update equipment set name = 'x' where id = $1", [row.id])).rowCount === 0)
  ok('prestador não registra manutenção', (await attempt('insert into equipment_maintenances (equipment_id) values ($1)', [row.id])).error?.code === '42501')
  ok('prestador não exclui equipamento', (await attempt('delete from equipment where id = $1', [row.id])).rowCount === 0)

  // ---------------------------------------------------------------- anônimo
  await as('obras_anon', null)
  ok('anônimo não lê equipamentos', (await attempt('select id from equipment')).error?.code === '42501' || (await q('select id from equipment')).length === 0)

  // ---------------------------------------------------------------- admin e cascata
  await as('obras_authenticated', admin.id)
  ok('admin exclui a manutenção', (await attempt('delete from equipment_maintenances where id = $1', [m.rows[0].id])).rowCount === 1)
  await attempt("insert into equipment_maintenances (equipment_id, maintenance_date) values ($1, '2026-10-01')", [row.id])
  ok('admin exclui o equipamento', (await attempt('delete from equipment where id = $1', [row.id])).rowCount === 1)
  await c.query('RESET ROLE')
  ok('excluir o equipamento apaga as manutenções (cascata)', Number((await one('select count(*) n from equipment_maintenances where equipment_id = $1', [row.id])).n) === 0)

  // excluir a obra não apaga o equipamento: ele volta para o depósito
  const w = (await one("insert into works (name) values ('OBRA TESTE EQ') returning id")).id
  const e2 = (await one("insert into equipment (name, work_id) values ('SERRA TESTE', $1) returning id", [w])).id
  await c.query('delete from works where id = $1', [w])
  ok('excluir a obra mantém o equipamento (volta ao depósito)', (await one('select work_id from equipment where id = $1', [e2])).work_id === null)
} catch (e) {
  console.log('ERRO', e.message)
  failed++
} finally {
  await c.query('ROLLBACK')
  await c.end()
}
console.log(failed ? `\n${failed} FALHA(S)` : '\nTudo certo (transação desfeita)')
process.exit(failed ? 1 : 0)
