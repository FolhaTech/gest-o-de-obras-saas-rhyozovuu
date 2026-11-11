// Testa (RLS, transação desfeita no final): histórico do progresso dos cards do Planner (19_planner_historico_progresso.sql).
// Uso: node db/azure/test-planner-historico.mjs (lê DATABASE_URL do .env.local)
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
const hist = (id) => q('select * from planner_task_progress_history where task_id = $1 order by changed_at, id', [id])

try {
  await c.query('BEGIN')
  const admin = await one("select id from profiles where lower(role) = 'admin' order by email limit 1")
  const [p1] = await q("select id from profiles where lower(role) = 'prestador' order by email limit 1")
  const [mA, mB] = await q('select id from team_members order by name limit 2')
  const work = (await one('select id from works limit 1')).id
  await c.query('update profiles set team_member_id = $2 where id = $1', [p1.id, mA.id])

  // ---------------------------------------------------------------- criação
  await as('obras_authenticated', admin.id)
  const t = (await one("insert into planner_tasks (title, work_id, progress_percentage, assignee_id) values ('CARD HIST', $1, 10, $2) returning id", [work, mA.id])).id
  let h = await hist(t)
  ok('criar o card grava a linha de criação (de nada para 10%)', h.length === 1 && h[0].old_percentage === null && h[0].new_percentage === 10, JSON.stringify(h[0]))
  ok('a criação guarda quem criou', h[0].changed_by === admin.id)

  // ---------------------------------------------------------------- alterações de porcentagem
  await c.query('update planner_tasks set progress_percentage = 40 where id = $1', [t])
  await c.query('update planner_tasks set progress_percentage = 70 where id = $1', [t])
  h = await hist(t)
  ok('cada alteração vira uma linha (10 → 40 → 70)', h.length === 3 && h[1].old_percentage === 10 && h[1].new_percentage === 40 && h[2].old_percentage === 40 && h[2].new_percentage === 70)
  ok('guarda quem alterou e quando', h[2].changed_by === admin.id && !!h[2].changed_at)
  ok('antes de chegar a 100% não há contagem de dias', h[1].days_to_complete === null && h[2].days_to_complete === null)

  const n0 = h.length
  await c.query("update planner_tasks set title = 'CARD HIST 2', description = 'x' where id = $1", [t])
  await c.query('update planner_tasks set progress_percentage = 70 where id = $1', [t])
  ok('mudar outros campos, ou gravar a mesma porcentagem, não gera linha', (await hist(t)).length === n0)

  await c.query('update planner_tasks set progress_percentage = 55 where id = $1', [t])
  h = await hist(t)
  ok('reduzir a porcentagem também fica registrado (70 → 55)', h.length === n0 + 1 && h[h.length - 1].old_percentage === 70 && h[h.length - 1].new_percentage === 55)

  // ---------------------------------------------------------------- 100% e dias até concluir
  await c.query("update planner_tasks set created_at = now() - interval '5 days' where id = $1", [t])
  await c.query("update planner_tasks set progress_percentage = 100, status = 'completed' where id = $1", [t])
  h = await hist(t)
  const last = h[h.length - 1]
  ok('chegar a 100% grava a linha com os dias desde a criação (5)', last.new_percentage === 100 && last.days_to_complete === 5, JSON.stringify(last))

  const t0 = (await one("insert into planner_tasks (title, work_id) values ('CARD DIA ZERO', $1) returning id", [work])).id
  await c.query('update planner_tasks set progress_percentage = 100 where id = $1', [t0])
  const z = (await hist(t0)).pop()
  ok('concluir no mesmo dia da criação = 0 dias', z.days_to_complete === 0)

  // reabrir e concluir de novo: nova linha de 100% (dias contados da criação)
  await c.query('update planner_tasks set progress_percentage = 80 where id = $1', [t])
  await c.query('update planner_tasks set progress_percentage = 100 where id = $1', [t])
  h = await hist(t)
  ok('reabrir e concluir de novo registra outra conclusão', h.filter((r) => r.new_percentage === 100).length === 2)

  // ---------------------------------------------------------------- vindo do Cronograma
  const st = (await one("insert into work_stages (work_id, name, manager, progress_percentage, status) values ($1, 'ETAPA HIST', null, 20, 'in_progress') returning id", [work])).id
  const mirror = (await one('select id from planner_tasks where stage_id = $1', [st])).id
  await c.query('update work_stages set progress_percentage = 65 where id = $1', [st])
  const mh = await hist(mirror)
  ok('o card espelho da etapa também registra (criação com 20% e 20 → 65)', mh.length === 2 && mh[0].new_percentage === 20 && mh[1].old_percentage === 20 && mh[1].new_percentage === 65, JSON.stringify(mh.map((r) => [r.old_percentage, r.new_percentage])))

  // ---------------------------------------------------------------- acesso
  await as('obras_authenticated', admin.id)
  ok('admin lê o histórico', (await q('select id from planner_task_progress_history where task_id = $1', [t])).length > 0)
  ok('ninguém grava direto no histórico (só o gatilho)', (await attempt("insert into planner_task_progress_history (task_id, new_percentage) values ($1, 1)", [t])).error?.code === '42501')
  ok('ninguém apaga linhas do histórico', (await attempt('delete from planner_task_progress_history where task_id = $1', [t])).rowCount === 0)
  ok('ninguém altera linhas do histórico', (await attempt('update planner_task_progress_history set new_percentage = 0 where task_id = $1', [t])).rowCount === 0)

  await as('obras_authenticated', p1.id)
  const mine = (await one("insert into planner_tasks (title, work_id, assignee_id, progress_percentage) values ('CARD DO PRESTADOR', $1, $2, 0) returning id", [work, mA.id]).catch(() => null))
  // prestador não cria card; o card dele é criado pela equipe interna
  await as('obras_authenticated', admin.id)
  const mineId = (await one("insert into planner_tasks (title, work_id, assignee_id, progress_percentage) values ('CARD DO PRESTADOR', $1, $2, 0) returning id", [work, mA.id])).id
  const otherId = (await one("insert into planner_tasks (title, work_id, assignee_id, progress_percentage) values ('CARD DE OUTRO', $1, $2, 0) returning id", [work, mB.id])).id
  await as('obras_authenticated', p1.id)
  ok('prestador vê o histórico do card dele', (await q('select id from planner_task_progress_history where task_id = $1', [mineId])).length === 1)
  ok('prestador NÃO vê o histórico do card de outro', (await q('select id from planner_task_progress_history where task_id = $1', [otherId])).length === 0)
  await c.query('update planner_tasks set progress_percentage = 30 where id = $1', [mineId])
  const ph = await hist(mineId)
  ok('o prestador altera o próprio card e a linha leva o nome dele', ph.length === 2 && ph[1].changed_by === p1.id && ph[1].new_percentage === 30)

  await as('obras_anon', null)
  ok('anônimo não lê o histórico', (await attempt('select id from planner_task_progress_history')).error?.code === '42501' || (await q('select id from planner_task_progress_history')).length === 0)

  // ---------------------------------------------------------------- cascata
  await c.query('RESET ROLE')
  await c.query('delete from planner_tasks where id = $1', [t])
  ok('excluir o card apaga o histórico dele (cascata)', (await hist(t)).length === 0)
  void mine
} catch (e) {
  console.log('ERRO', e.message)
  failed++
} finally {
  await c.query('ROLLBACK')
  await c.end()
}
console.log(failed ? `\n${failed} FALHA(S)` : '\nTudo certo (transação desfeita)')
process.exit(failed ? 1 : 0)
