// Testa (RLS, transação desfeita no final): veículos, manutenções e abastecimentos (18_veiculos.sql).
// Uso: node db/azure/test-veiculos.mjs (lê DATABASE_URL do .env.local)
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
  const member = (await one('select id from team_members order by name limit 1')).id

  // ---------------------------------------------------------------- gestor cadastra
  await as('obras_authenticated', p2.id)
  const v = await attempt(
    "insert into vehicles (plate, brand, model, year, fuel_type, odometer_km, driver_id) values ('TST1A23', 'Fiat', 'Strada', 2022, 'Flex', 1000, $1) returning id, status, odometer_km, purchase_value",
    [member],
  )
  ok('gestor cadastra veículo', !v.error, v.error?.message)
  const veh = v.rows[0]
  ok('padrões: em uso e valor de compra zerado', veh?.status === 'active' && Number(veh.purchase_value) === 0)

  // ---------------------------------------------------------------- restrições
  ok('placa repetida é recusada', (await attempt("insert into vehicles (plate, model) values ('TST1A23', 'x')")).error?.code === '23505')
  ok('placa repetida em minúsculas e com espaços também', (await attempt("insert into vehicles (plate, model) values ('  tst1a23 ', 'x')")).error?.code === '23505')
  ok('ano inválido é rejeitado', (await attempt("insert into vehicles (plate, model, year) values ('ANO0000', 'x', 1800)")).error?.code === '23514')
  ok('km negativo é rejeitado', (await attempt("insert into vehicles (plate, model, odometer_km) values ('KM00000', 'x', -1)")).error?.code === '23514')
  ok('situação inválida é rejeitada', (await attempt("insert into vehicles (plate, model, status) values ('ST00000', 'x', 'vendido')")).error?.code === '23514')
  ok('veículo sem modelo é rejeitado', (await attempt("insert into vehicles (plate) values ('SEM0000')")).error?.code === '23502')
  ok('litros zero é rejeitado', (await attempt('insert into vehicle_fuel_receipts (vehicle_id, liters) values ($1, 0)', [veh.id])).error?.code === '23514')
  ok('valor negativo é rejeitado', (await attempt('insert into vehicle_fuel_receipts (vehicle_id, liters, total_value) values ($1, 10, -1)', [veh.id])).error?.code === '23514')
  ok('manutenção de veículo inexistente é rejeitada', (await attempt("insert into vehicle_maintenances (vehicle_id) values ('00000000-0000-0000-0000-000000000000')")).error?.code === '23503')

  // ---------------------------------------------------------------- km atual acompanha os lançamentos
  const odo = async () => Number((await one('select odometer_km from vehicles where id = $1', [veh.id])).odometer_km)
  await attempt('insert into vehicle_fuel_receipts (vehicle_id, liters, odometer_km) values ($1, 40, 1500)', [veh.id])
  ok('abastecimento com km maior atualiza o km do veículo (1000 -> 1500)', (await odo()) === 1500, String(await odo()))
  await attempt('insert into vehicle_maintenances (vehicle_id, odometer_km, next_due_km) values ($1, 1800, 11800)', [veh.id])
  ok('manutenção com km maior atualiza o km do veículo (-> 1800)', (await odo()) === 1800)
  await attempt('insert into vehicle_fuel_receipts (vehicle_id, liters, odometer_km) values ($1, 10, 900)', [veh.id])
  ok('km menor (digitação errada) nunca faz o km do veículo voltar', (await odo()) === 1800)
  await attempt('insert into vehicle_fuel_receipts (vehicle_id, liters) values ($1, 10)', [veh.id])
  ok('abastecimento sem km não mexe no km do veículo', (await odo()) === 1800)

  // ---------------------------------------------------------------- prestador não tem acesso
  await as('obras_authenticated', p1.id)
  ok('prestador não lê veículos', Number((await one('select count(*) n from vehicles')).n) === 0)
  ok('prestador não lê abastecimentos', Number((await one('select count(*) n from vehicle_fuel_receipts')).n) === 0)
  ok('prestador não lê manutenções', Number((await one('select count(*) n from vehicle_maintenances')).n) === 0)
  ok('prestador não cadastra veículo', (await attempt("insert into vehicles (plate, model) values ('PRE0000', 'x')")).error?.code === '42501')
  ok('prestador não altera veículo', (await attempt("update vehicles set color = 'x' where id = $1", [veh.id])).rowCount === 0)
  ok('prestador não registra abastecimento', (await attempt('insert into vehicle_fuel_receipts (vehicle_id, liters) values ($1, 5)', [veh.id])).error?.code === '42501')

  // ---------------------------------------------------------------- anônimo
  await as('obras_anon', null)
  ok('anônimo não lê veículos', (await attempt('select id from vehicles')).error?.code === '42501' || Number((await one('select count(*) n from vehicles')).n) === 0)

  // ---------------------------------------------------------------- admin lê e exclui (cascata)
  await as('obras_authenticated', admin.id)
  ok('admin lê o veículo', (await q('select id from vehicles where id = $1', [veh.id])).length === 1)
  ok('admin vê os abastecimentos', (await q('select id from vehicle_fuel_receipts where vehicle_id = $1', [veh.id])).length === 3)
  ok('admin exclui o veículo', (await attempt('delete from vehicles where id = $1', [veh.id])).rowCount === 1)
  await c.query('RESET ROLE')
  ok('excluir o veículo apaga manutenções e abastecimentos (cascata)', Number((await one('select (select count(*) from vehicle_maintenances where vehicle_id = $1) + (select count(*) from vehicle_fuel_receipts where vehicle_id = $1) n', [veh.id])).n) === 0)

  // excluir o responsável ou a obra não apaga o veículo
  const w = (await one("insert into works (name) values ('OBRA TESTE VEIC') returning id")).id
  const m2 = (await one("insert into team_members (name) values ('MOTORISTA TESTE') returning id")).id
  const v2 = (await one("insert into vehicles (plate, model, work_id, driver_id) values ('SOL0000', 'Hilux', $1, $2) returning id", [w, m2])).id
  await c.query('delete from works where id = $1', [w])
  await c.query('delete from team_members where id = $1', [m2])
  const after = await one('select work_id, driver_id from vehicles where id = $1', [v2])
  ok('excluir obra e responsável mantém o veículo (campos ficam vazios)', after?.work_id === null && after?.driver_id === null)
} catch (e) {
  console.log('ERRO', e.message)
  failed++
} finally {
  await c.query('ROLLBACK')
  await c.end()
}
console.log(failed ? `\n${failed} FALHA(S)` : '\nTudo certo (transação desfeita)')
process.exit(failed ? 1 : 0)
