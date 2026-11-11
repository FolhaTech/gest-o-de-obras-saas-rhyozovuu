// Testa (RLS, transação desfeita no final): manutenção das casas com check-in/check-out e baixa de estoque
// (21_manutencao_casas.sql). Uso: node db/azure/test-manutencao-casas.mjs (lê DATABASE_URL do .env.local)
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
const stock = async (id) => Number((await one('select stock_quantity from materials where id = $1', [id])).stock_quantity)

try {
  await c.query('BEGIN')
  const admin = await one("select id from profiles where lower(role) = 'admin' order by email limit 1")
  const [p1, p2] = await q("select id from profiles where lower(role) = 'prestador' order by email limit 2")
  const work = (await one('select id from works limit 1')).id
  const A = (await one("insert into materials (name, unit_of_measure, stock_quantity) values ('MAT A TESTE', 'kg', 10) returning id")).id
  const B = (await one("insert into materials (name, unit_of_measure, stock_quantity) values ('MAT B TESTE', 'un', 2) returning id")).id

  // ---------------------------------------------------------------- check-in (hora do servidor)
  await as('obras_authenticated', p1.id)
  const m = await attempt("insert into house_maintenances (work_id, service_type, performed_by, status) values ($1, 'Diarista', 'MARIA', 'in_progress') returning id, status, check_in_at, check_out_at, created_by, maintenance_date", [work])
  ok('colaborador faz check-in', !m.error, m.error?.message)
  const row = m.rows[0]
  ok('o check-in grava a hora do servidor (agora)', !!row.check_in_at && Math.abs(Date.now() - new Date(row.check_in_at).getTime()) < 120_000, String(row.check_in_at))
  ok('em andamento: ainda sem saída', row.status === 'in_progress' && row.check_out_at === null)
  ok('o registro leva o nome de quem registrou', row.created_by === p1.id)

  // ---------------------------------------------------------------- materiais e baixa de estoque
  const l1 = await attempt('insert into house_maintenance_materials (maintenance_id, material_id, quantity) values ($1, $2, 3) returning id, material_name, unit', [row.id, A])
  await c.query('RESET ROLE')
  ok('lançar material dá baixa no estoque (10 → 7)', (await stock(A)) === 7, String(await stock(A)))
  ok('nome e unidade ficam gravados na linha', l1.rows[0]?.material_name === 'MAT A TESTE' && l1.rows[0]?.unit === 'kg')
  const mv = await one("select 1 from material_movements where material_id = $1 and type = 'saida' and quantity = 3", [A])
  ok('a baixa também entra nas movimentações do estoque (saída de 3)', !!mv)

  await as('obras_authenticated', p1.id)
  const bad = await attempt('insert into house_maintenance_materials (maintenance_id, material_id, quantity) values ($1, $2, 5)', [row.id, B])
  ok('estoque insuficiente é recusado com mensagem clara', /Estoque insuficiente/.test(bad.error?.message ?? '') && /disponível 2/.test(bad.error?.message ?? ''), bad.error?.message)
  await c.query('RESET ROLE')
  ok('...e o estoque não mexe (continua 2)', (await stock(B)) === 2)

  await as('obras_authenticated', p1.id)
  const both = await attempt('insert into house_maintenance_materials (maintenance_id, material_id, quantity) values ($1, $2, 1), ($1, $3, 5)', [row.id, A, B])
  await c.query('RESET ROLE')
  ok('vários materiais num comando: se um falta, NENHUM entra (atômico)', !!both.error && (await stock(A)) === 7 && Number((await one('select count(*) n from house_maintenance_materials where maintenance_id = $1', [row.id])).n) === 1)

  await as('obras_authenticated', p1.id)
  ok('material zerado/quantidade zero é rejeitada', (await attempt('insert into house_maintenance_materials (maintenance_id, material_id, quantity) values ($1, $2, 0)', [row.id, A])).error?.code === '23514')
  ok('linha sem material é recusada', /Escolha o material/.test((await attempt('insert into house_maintenance_materials (maintenance_id, quantity) values ($1, 1)', [row.id])).error?.message ?? ''))
  ok('o colaborador não altera o estoque direto', (await attempt('update materials set stock_quantity = 999 where id = $1', [A])).rowCount === 0)
  ok('não se edita a quantidade de uma linha (só excluir e lançar de novo)', (await attempt('update house_maintenance_materials set quantity = 1 where id = $1', [l1.rows[0].id])).rowCount === 0)

  // ---------------------------------------------------------------- check-out
  const co = await attempt("update house_maintenances set status = 'done' where id = $1 returning status, check_in_at, check_out_at", [row.id])
  ok('check-out grava a hora de saída do servidor', co.rows[0]?.status === 'done' && !!co.rows[0].check_out_at && new Date(co.rows[0].check_out_at) >= new Date(co.rows[0].check_in_at))
  const stay = new Date(co.rows[0].check_out_at) - new Date(co.rows[0].check_in_at)
  ok('a permanência (saída − entrada) é calculável e não negativa', stay >= 0)
  const again = await attempt("update house_maintenances set notes = 'x' where id = $1 returning check_out_at", [row.id])
  ok('editar outros campos não mexe na saída', String(again.rows[0].check_out_at) === String(co.rows[0].check_out_at))
  const reopen = await attempt("update house_maintenances set status = 'in_progress' where id = $1 returning status, check_out_at, check_in_at", [row.id])
  ok('reabrir limpa a saída e mantém a entrada', reopen.rows[0]?.check_out_at === null && String(reopen.rows[0].check_in_at) === String(co.rows[0].check_in_at))
  await attempt("update house_maintenances set status = 'done' where id = $1", [row.id])

  // ---------------------------------------------------------------- registro retroativo com horas à mão
  const retro = await attempt(
    "insert into house_maintenances (work_id, service_type, maintenance_date, status, check_in_at, check_out_at) values ($1, 'Piscineiro', '2026-01-10', 'done', '2026-01-10T11:00:00Z', '2026-01-10T14:30:00Z') returning check_in_at, check_out_at",
    [work],
  )
  ok('registro retroativo mantém as horas informadas', !retro.error && new Date(retro.rows[0].check_in_at).toISOString() === '2026-01-10T11:00:00.000Z' && new Date(retro.rows[0].check_out_at).toISOString() === '2026-01-10T14:30:00.000Z', retro.error?.message)
  ok('saída antes da entrada é rejeitada', (await attempt("insert into house_maintenances (work_id, service_type, status, check_in_at, check_out_at) values ($1, 'x', 'done', '2026-01-10T14:00:00Z', '2026-01-10T11:00:00Z')", [work])).error?.code === '23514')
  ok('horário no futuro é rejeitado', (await attempt("insert into house_maintenances (work_id, service_type, status, check_in_at) values ($1, 'x', 'done', now() + interval '3 hours')", [work])).error?.code === '23514')
  const noTime = await attempt("insert into house_maintenances (work_id, service_type) values ($1, 'Jardineiro') returning status, check_in_at", [work])
  ok('sem horário: concluída, sem entrada (registro simples)', noTime.rows[0]?.status === 'done' && noTime.rows[0].check_in_at === null)
  ok('situação inválida é rejeitada', (await attempt("insert into house_maintenances (work_id, service_type, status) values ($1, 'x', 'pausada')", [work])).error?.code === '23514')

  // ---------------------------------------------------------------- permissões
  ok('colaborador não registra em nome de outro', (await attempt('insert into house_maintenances (work_id, service_type, created_by) values ($1, $2, $3)', [work, 'Diarista', admin.id])).error?.code === '42501')
  const mine = await attempt('update house_maintenances set created_by = $2 where id = $1 returning created_by', [row.id, admin.id])
  ok('quem registrou não muda', mine.rows[0]?.created_by === p1.id)

  await as('obras_authenticated', p2.id)
  ok('outro colaborador NÃO vê a manutenção alheia', (await q('select id from house_maintenances where id = $1', [row.id])).length === 0)
  ok('...nem as linhas de material dela', (await q('select id from house_maintenance_materials where maintenance_id = $1', [row.id])).length === 0)
  ok('...nem altera', (await attempt("update house_maintenances set notes = 'x' where id = $1", [row.id])).rowCount === 0)
  ok('...nem exclui', (await attempt('delete from house_maintenances where id = $1', [row.id])).rowCount === 0)
  ok('...nem lança material nela', (await attempt('insert into house_maintenance_materials (maintenance_id, material_id, quantity) values ($1, $2, 1)', [row.id, A])).error?.code === '42501')

  await as('obras_authenticated', admin.id)
  ok('admin vê todas as manutenções', (await q('select id from house_maintenances where id = $1', [row.id])).length === 1)
  await as('obras_anon', null)
  ok('anônimo não vê nada', (await attempt('select id from house_maintenances')).error?.code === '42501' || (await q('select id from house_maintenances')).length === 0)

  // ---------------------------------------------------------------- estorno
  await as('obras_authenticated', p1.id)
  const l2 = await attempt('insert into house_maintenance_materials (maintenance_id, material_id, quantity) values ($1, $2, 2) returning id', [row.id, A])
  await c.query('RESET ROLE')
  ok('segundo lançamento: estoque 5', (await stock(A)) === 5)
  await as('obras_authenticated', p1.id)
  ok('colaborador remove uma linha dele', (await attempt('delete from house_maintenance_materials where id = $1', [l2.rows[0].id])).rowCount === 1)
  await c.query('RESET ROLE')
  ok('remover a linha devolve ao estoque (5 → 7)', (await stock(A)) === 7)
  const est = await one("select 1 from material_movements where material_id = $1 and type = 'entrada' and quantity = 2", [A])
  ok('o estorno entra nas movimentações (entrada de 2)', !!est)

  await as('obras_authenticated', p1.id)
  ok('colaborador exclui a manutenção dele', (await attempt('delete from house_maintenances where id = $1', [row.id])).rowCount === 1)
  await c.query('RESET ROLE')
  ok('excluir a manutenção devolve TUDO ao estoque (7 → 10)', (await stock(A)) === 10, String(await stock(A)))

  // material excluído do catálogo: a linha guarda o nome e excluir a manutenção não quebra
  const m3 = (await one("insert into house_maintenances (work_id, service_type, created_by) values ($1, 'Diarista', $2) returning id", [work, p1.id])).id
  await c.query('insert into house_maintenance_materials (maintenance_id, material_id, quantity) values ($1, $2, 1)', [m3, A])
  await c.query('delete from materials where id = $1', [A])
  const kept = await one('select material_id, material_name from house_maintenance_materials where maintenance_id = $1', [m3])
  ok('material excluído do estoque: a linha continua com o nome', kept?.material_id === null && kept.material_name === 'MAT A TESTE')
  ok('...e a manutenção ainda pode ser excluída', (await attempt('delete from house_maintenances where id = $1', [m3])).rowCount === 1)
} catch (e) {
  console.log('ERRO', e.message)
  failed++
} finally {
  await c.query('ROLLBACK')
  await c.end()
}
console.log(failed ? `\n${failed} FALHA(S)` : '\nTudo certo (transação desfeita)')
process.exit(failed ? 1 : 0)
