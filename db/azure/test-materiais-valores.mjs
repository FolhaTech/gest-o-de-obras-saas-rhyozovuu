// Testa (RLS, transação desfeita no final): materiais alocados com valores — o Prestador vê os itens e as
// quantidades, mas não os valores (R$). Uso: node db/azure/test-materiais-valores.mjs (lê DATABASE_URL do .env.local)
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
  const admin = await one("select id from profiles where lower(role) = 'admin' order by email limit 1")
  const work = (await one('select id from works limit 1')).id

  // item importado (sem catálogo) + valores, como o script de importação grava
  const item = (
    await one(
      "insert into work_extra_materials (work_id, code, name, unit, quantity, source) values ($1, '999999', 'ITEM TESTE', 'UN', 4, 'teste-valores') returning id",
      [work],
    )
  ).id
  await c.query('insert into work_extra_material_values (extra_material_id, unit_price, total_cost) values ($1, 2.5, 10)', [item])

  await as('obras_authenticated', admin.id)
  ok('admin lê o item com o valor', (await q('select v.total_cost from work_extra_material_values v where v.extra_material_id = $1', [item])).length === 1)
  ok('admin altera o valor', (await attempt('update work_extra_material_values set total_cost = 12 where extra_material_id = $1', [item])).rowCount === 1)

  await as('obras_authenticated', presta.id)
  const seen = await q("select id, quantity, code, name, unit from work_extra_materials where source = 'teste-valores'")
  ok('prestador vê o item e a quantidade', seen.length === 1 && Number(seen[0].quantity) === 4)
  ok('prestador NÃO lê os valores', (await q('select extra_material_id from work_extra_material_values')).length === 0)
  const ins = await attempt('insert into work_extra_material_values (extra_material_id, unit_price, total_cost) values ($1, 1, 1)', [item])
  ok('prestador não grava valores', ins.error?.code === '42501', ins.error?.code)
  ok('prestador não altera valores', (await attempt('update work_extra_material_values set total_cost = 0 where extra_material_id = $1', [item])).rowCount === 0)

  await as('obras_anon', null)
  ok('anônimo não acessa os valores', (await attempt('select extra_material_id from work_extra_material_values')).error?.code === '42501')

  await as('obras_authenticated', admin.id)
  const neg = await attempt('update work_extra_material_values set unit_price = -1 where extra_material_id = $1', [item])
  ok('valor negativo é rejeitado', neg.error?.code === '23514', neg.error?.code)
  await c.query('RESET ROLE')
  await c.query('delete from work_extra_materials where id = $1', [item])
  ok('apagar o item remove o valor (cascata)', Number((await one('select count(*) n from work_extra_material_values where extra_material_id = $1', [item])).n) === 0)
} catch (e) {
  console.log('ERRO', e.message)
  failed++
} finally {
  await c.query('ROLLBACK')
  await c.end()
}
console.log(failed ? `\n${failed} FALHA(S)` : '\nTudo certo (transação desfeita)')
process.exit(failed ? 1 : 0)
