// Testa (RLS, transação desfeita no final): excluir material (20_excluir_material.sql).
// Material usado em composições de obras pode ser excluído (o retrato sai junto); com consumo registrado, não.
// Uso: node db/azure/test-excluir-material.mjs (lê DATABASE_URL do .env.local)
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
  const presta = await one("select id from profiles where lower(role) = 'prestador' order by email limit 1")
  const work = (await one('select id from works limit 1')).id

  // serviço da obra com uma composição que usa o material (o gatilho tira o "retrato" em compositions_history)
  const svc = (await one("insert into services (name, unit) values ('SERVICO TESTE MAT', 'm2') returning id")).id
  const mat = (await one("insert into materials (name, unit_of_measure) values ('MATERIAL TESTE', 'kg') returning id")).id
  await c.query('insert into compositions (service_id, material_id, coefficient) values ($1, $2, 1.5)', [svc, mat])
  const ws = (await one('insert into work_services (work_id, service_id, target_quantity) values ($1, $2, 10) returning id', [work, svc])).id
  ok('há o retrato da composição usando o material', Number((await one('select count(*) n from compositions_history where material_id = $1', [mat])).n) === 1)
  const extra = (await one('insert into work_extra_materials (work_id, material_id, quantity) values ($1, $2, 3) returning id', [work, mat])).id
  const loss = (await one("insert into material_losses (work_id, material_id, material_name, quantity) values ($1, $2, 'MATERIAL TESTE', 1) returning id", [work, mat])).id

  // ---------------------------------------------------------------- prestador não exclui
  await as('obras_authenticated', presta.id)
  ok('prestador não exclui material', (await attempt('delete from materials where id = $1', [mat])).rowCount === 0)

  // ---------------------------------------------------------------- admin exclui material usado em composição
  await as('obras_authenticated', admin.id)
  const del = await attempt('delete from materials where id = $1', [mat])
  ok('admin exclui o material usado em composição de obra', !del.error && del.rowCount === 1, del.error?.message)
  await c.query('RESET ROLE')
  ok('o retrato da composição saiu junto (cascata)', Number((await one('select count(*) n from compositions_history where material_id = $1', [mat])).n) === 0)
  ok('o serviço da obra continua existindo', !!(await one('select 1 from work_services where id = $1', [ws])))
  ok('a lista de materiais da obra perdeu o item (cascata)', !(await one('select 1 from work_extra_materials where id = $1', [extra])))
  const lossRow = await one('select material_id, material_name from material_losses where id = $1', [loss])
  ok('a perda registrada continua, só sem o vínculo (guarda o nome)', lossRow?.material_id === null && lossRow.material_name === 'MATERIAL TESTE')

  // ---------------------------------------------------------------- consumo registrado trava
  const mat2 = (await one("insert into materials (name, unit_of_measure) values ('MATERIAL COM CONSUMO', 'kg') returning id")).id
  await c.query('insert into consumption_tracking (work_service_id, material_id, quantity_actual) values ($1, $2, 5)', [ws, mat2])
  await as('obras_authenticated', admin.id)
  const blocked = await attempt('delete from materials where id = $1', [mat2])
  ok('material com consumo registrado NÃO é excluído (protege o histórico)', blocked.error?.code === '23503', blocked.error?.code)
  await c.query('RESET ROLE')
  ok('...e o consumo continua lá', Number((await one('select count(*) n from consumption_tracking where material_id = $1', [mat2])).n) === 1)
} catch (e) {
  console.log('ERRO', e.message)
  failed++
} finally {
  await c.query('ROLLBACK')
  await c.end()
}
console.log(failed ? `\n${failed} FALHA(S)` : '\nTudo certo (transação desfeita)')
process.exit(failed ? 1 : 0)
