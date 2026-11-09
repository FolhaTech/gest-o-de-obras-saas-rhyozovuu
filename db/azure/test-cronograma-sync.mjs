// Testa a sincronia Cronograma (work_stages) <-> Planner (planner_tasks) dentro de uma transação
// que é desfeita no final (nada é gravado). Uso: node db/azure/test-cronograma-sync.mjs
// Lê DATABASE_URL do ambiente ou do .env.local.
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
const one = async (sql, p) => (await c.query(sql, p)).rows[0]
const day = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10))

try {
  await c.query('BEGIN')
  // Roda como usuário logado: os gatilhos (SECURITY DEFINER) precisam funcionar sob RLS.
  await c.query('SET LOCAL ROLE obras_authenticated')
  // como administrador (só o Admin vê/edita todos os cards do Planner)
  const adminId = (await one("select id from profiles where lower(role) = 'admin' order by email limit 1")).id
  await c.query("select set_config('request.jwt.claim.sub', $1, true)", [adminId])
  const work = (await one('select id from works limit 1')).id

  const st = await one(
    `insert into work_stages (work_id, name, manager, start_date, end_date_planned, progress_percentage, status, notes)
     values ($1, 'ETAPA TESTE', 'Francisco', '2026-12-01', '2026-12-20', 25, 'in_progress', 'obs teste') returning id`,
    [work],
  )
  let t = await one('select * from planner_tasks where stage_id = $1', [st.id])
  ok('etapa criada gera tarefa no Planner', !!t)
  ok(
    'campos iguais (título/obra/datas/progresso/status/obs)',
    t?.title === 'ETAPA TESTE' &&
      t.work_id === work &&
      day(t.start_date) === '2026-12-01' &&
      day(t.due_date) === '2026-12-20' &&
      t.progress_percentage === 25 &&
      t.status === 'in_progress' &&
      t.description === 'obs teste',
  )
  const fr = (await one("select public.match_team_member('Francisco') id")).id
  ok('responsável "Francisco" vira membro da equipe (card e etapa)', !!fr && t?.assignee_id === fr)
  ok('etapa guarda o membro responsável', (await one('select manager_member_id from work_stages where id = $1', [st.id])).manager_member_id === fr)

  await c.query(
    `update work_stages set name = 'ETAPA TESTE 2', progress_percentage = 100, status = 'completed' where id = $1`,
    [st.id],
  )
  t = await one('select * from planner_tasks where stage_id = $1', [st.id])
  ok('editar etapa atualiza a tarefa', t.title === 'ETAPA TESTE 2' && t.progress_percentage === 100 && t.status === 'completed')
  const taskId = t.id

  await c.query(
    `update planner_tasks set progress_percentage = 60, status = 'in_progress', title = 'DO PLANNER' where id = $1`,
    [taskId],
  )
  let s = await one('select * from work_stages where id = $1', [st.id])
  ok(
    'editar tarefa atualiza a etapa (progresso/status/nome)',
    Number(s.progress_percentage) === 60 && s.status === 'in_progress' && s.name === 'DO PLANNER',
  )
  ok('fim realizado é limpo ao reabrir', s.end_date_real === null)

  await c.query(`update planner_tasks set status = 'completed', progress_percentage = 100 where id = $1`, [taskId])
  s = await one('select * from work_stages where id = $1', [st.id])
  ok('concluir tarefa conclui a etapa e define fim realizado', s.status === 'completed' && !!s.end_date_real)

  const m = await one("select id, name from team_members where status = 'active' order by name limit 1")
  await c.query('update planner_tasks set assignee_id = $2 where id = $1', [taskId, m.id])
  s = await one('select manager, manager_member_id from work_stages where id = $1', [st.id])
  ok('responsável do Planner vai para a etapa (nome e membro)', s.manager === m.name.trim() && s.manager_member_id === m.id, s.manager)

  await c.query(`update work_stages set notes = 'ultima' where id = $1`, [st.id])
  const t6 = await one('select description from planner_tasks where stage_id = $1', [st.id])
  ok('sem loop e observação sincronizada', t6.description === 'ultima')

  await c.query(`update work_stages set status = 'delayed' where id = $1`, [st.id])
  ok('etapa Atrasado vira tarefa Em Atraso', (await one('select status from planner_tasks where stage_id = $1', [st.id])).status === 'delayed')
  await c.query(`update planner_tasks set status = 'in_progress' where id = $1`, [taskId])
  ok('tarefa Em Andamento tira a etapa do atraso', (await one('select status from work_stages where id = $1', [st.id])).status === 'in_progress')
  await c.query(`update planner_tasks set status = 'delayed' where id = $1`, [taskId])
  ok('tarefa Em Atraso marca a etapa como Atrasado', (await one('select status from work_stages where id = $1', [st.id])).status === 'delayed')

  const before = Number((await one('select count(*) n from work_stages')).n)
  const plain = await one(`insert into planner_tasks (title, work_id) values ('avulsa', $1) returning id`, [work])
  await c.query('update planner_tasks set progress_percentage = 10 where id = $1', [plain.id])
  ok('tarefa avulsa não gera etapa', before === Number((await one('select count(*) n from work_stages')).n))

  await c.query('delete from planner_tasks where id = $1', [taskId])
  ok('excluir a tarefa espelho NÃO exclui a etapa do cronograma', !!(await one('select id from work_stages where id = $1', [st.id])))
  await c.query(`update work_stages set name = 'ETAPA VOLTOU' where id = $1`, [st.id])
  ok('editar a etapa recria a tarefa espelho', !!(await one('select id from planner_tasks where stage_id = $1', [st.id])))

  const st2 = await one(`insert into work_stages (work_id, name) values ($1, 'ETAPA 2') returning id`, [work])
  ok('etapa sem datas também gera tarefa', !!(await one('select id from planner_tasks where stage_id = $1', [st2.id])))
  await c.query('delete from work_stages where id = $1', [st2.id])
  ok('excluir etapa exclui a tarefa', !(await one('select id from planner_tasks where stage_id = $1', [st2.id])))
} catch (e) {
  console.log('ERRO', e.message)
  failed++
} finally {
  await c.query('ROLLBACK')
  await c.end()
}
console.log(failed ? `\n${failed} FALHA(S)` : '\nTudo certo (transação desfeita)')
process.exit(failed ? 1 : 0)
