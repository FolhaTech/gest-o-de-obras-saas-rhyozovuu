// Testa as permissões do papel Prestador (RLS) numa transação que é desfeita no final.
// Uso: node db/azure/test-permissoes.mjs   (lê DATABASE_URL do ambiente ou do .env.local)
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

// executa uma instrução que pode falhar sem derrubar a transação
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
  await c.query("select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', $2, true)", [sub ?? '', role === 'obras_anon' ? 'anon' : 'authenticated'])
}

try {
  await c.query('BEGIN')

  // --- preparação (como dono do banco) ---
  const presta = await one("select id from profiles where lower(role) = 'prestador' order by email limit 1")
  const staff = await one("select id from profiles where lower(role) = 'admin' order by email limit 1")
  const other = await one("select id from profiles where lower(role) = 'admin' and id <> $1 order by email offset 1 limit 1", [staff.id])
  const members = await q('select id from team_members order by name limit 2')
  const A = members[0].id
  const B = members[1].id
  const work = (await one('select id from works limit 1')).id
  await c.query('update profiles set team_member_id = $2 where id = $1', [presta.id, A])
  const taskA = (await one(`insert into planner_tasks (title, work_id, assignee_id) values ('T-A', $1, $2) returning id`, [work, A])).id
  const taskB = (await one(`insert into planner_tasks (title, work_id, assignee_id) values ('T-B', $1, $2) returning id`, [work, B])).id
  const attA = (await one(`insert into planner_task_attachments (task_id, file_url, file_name, file_type) values ($1, '/x/a.jpg', 'a.jpg', 'image') returning id`, [taskA])).id
  const attB = (await one(`insert into planner_task_attachments (task_id, file_url, file_name, file_type) values ($1, '/x/b.jpg', 'b.jpg', 'image') returning id`, [taskB])).id
  const totalTasks = Number((await one('select count(*) n from planner_tasks')).n)
  const totalStages = Number((await one('select count(*) n from work_stages')).n)
  const ownTasks = Number((await one('select count(*) n from planner_tasks where assignee_id = $1', [A])).n)
  const mirrorA = await one('select id, stage_id from planner_tasks where assignee_id = $1 and stage_id is not null limit 1', [A])

  // --- Prestador ---
  await as('obras_authenticated', presta.id)
  const seen = await q('select id, assignee_id from planner_tasks')
  ok('prestador vê só as tarefas atribuídas a ele', seen.length === ownTasks && seen.every((t) => t.assignee_id === A), `${seen.length} de ${totalTasks}`)
  ok('não enxerga tarefa de outro membro', !seen.some((t) => t.id === taskB) && seen.some((t) => t.id === taskA))
  ok('não altera tarefa de outro', (await attempt('update planner_tasks set title = $2 where id = $1', [taskB, 'x'])).rowCount === 0)
  ok('altera a própria tarefa', (await attempt("update planner_tasks set progress_percentage = 20 where id = $1", [taskA])).rowCount === 1)
  const asg = await attempt('insert into planner_tasks (title, assignee_id) values ($1, $2)', ['x', B])
  ok('não cria tarefa para outro membro', asg.error?.code === '42501', asg.error?.code)
  ok('cria tarefa para si', !(await attempt('insert into planner_tasks (title, assignee_id) values ($1, $2)', ['x', A])).error)
  const sem = await attempt('insert into planner_tasks (title) values ($1)', ['sem responsável'])
  ok('não cria tarefa sem responsável', sem.error?.code === '42501', sem.error?.code)
  const re = await attempt('update planner_tasks set assignee_id = $2 where id = $1', [taskA, B])
  ok('não repassa a própria tarefa para outro', re.error?.code === '42501', re.error?.code)
  ok('não apaga tarefa de outro', (await attempt('delete from planner_tasks where id = $1', [taskB])).rowCount === 0)

  const atts = await q('select id from planner_task_attachments')
  ok('anexos: só os das tarefas dele', atts.some((a) => a.id === attA) && !atts.some((a) => a.id === attB))

  // Cronograma: lê tudo, não altera
  ok('cronograma: vê as etapas de todos', Number((await one('select count(*) n from work_stages')).n) === totalStages, `${totalStages} etapas`)
  const ins = await attempt("insert into work_stages (work_id, name) values ($1, 'x')", [work])
  ok('cronograma: não cria etapa', ins.error?.code === '42501', ins.error?.code)
  ok('cronograma: não altera etapa', (await attempt("update work_stages set name = 'hack'")).rowCount === 0)
  ok('cronograma: não apaga etapa', (await attempt('delete from work_stages')).rowCount === 0)
  const still = Number((await one('select count(*) n from work_stages')).n)
  ok('nenhuma etapa foi perdida', still === totalStages)

  // editar a própria tarefa espelho acompanha o cronograma (gatilho SECURITY DEFINER)
  if (mirrorA) {
    await attempt('update planner_tasks set progress_percentage = 55 where id = $1', [mirrorA.id])
    const st = await one('select progress_percentage from work_stages where id = $1', [mirrorA.stage_id])
    ok('progresso na própria tarefa espelho chega ao cronograma', Number(st.progress_percentage) === 55)
  }

  // Perfis
  const selfLink = await attempt('update profiles set team_member_id = $2 where id = $1', [presta.id, B])
  ok('prestador não troca o próprio vínculo', /administradores/.test(selfLink.error?.message ?? ''), selfLink.error?.message)
  const selfRole = await attempt("update profiles set role = 'admin' where id = $1", [presta.id])
  ok('prestador não se promove', /administradores/.test(selfRole.error?.message ?? ''), selfRole.error?.message)
  ok('prestador não altera o perfil de outros', (await attempt("update profiles set role = 'prestador' where id = $1", [other.id])).rowCount === 0)
  ok('prestador não exclui perfis', (await attempt('delete from profiles where id = $1', [other.id])).rowCount === 0)
  ok('prestador altera o próprio nome', (await attempt("update profiles set full_name = 'Teste Nome' where id = $1", [presta.id])).rowCount === 1)

  // --- Gestor (colaborador): também só os cards em que é Pessoa Responsável ---
  await c.query("RESET ROLE")
  await c.query("select set_config('request.jwt.claim.sub', '', true)")
  await c.query("update profiles set role = 'gestor' where id = $1", [presta.id])
  const ownNow = Number((await one("select count(*) n from planner_tasks where assignee_id = $1", [A])).n)
  await as("obras_authenticated", presta.id)
  const gSeen = await q("select id, assignee_id from planner_tasks")
  ok("gestor vê só os cards em que é Pessoa Responsável", gSeen.length === ownNow && gSeen.every((t) => t.assignee_id === A) && !gSeen.some((t) => t.id === taskB), `${gSeen.length} de ${totalTasks + 2}`)
  ok("gestor não altera card de outro", (await attempt("update planner_tasks set title = $2 where id = $1", [taskB, "x"])).rowCount === 0)
  ok("gestor não cria card para outro", (await attempt("insert into planner_tasks (title, assignee_id) values ($1, $2)", ["x", B])).error?.code === "42501")
  ok("gestor vê só os anexos dos seus cards", (await q("select id from planner_task_attachments where id = $1", [attB])).length === 0)
  ok("gestor continua alterando o cronograma", (await attempt("update work_stages set notes = 'g' where id = (select id from work_stages limit 1)")).rowCount === 1)

  // --- Equipe interna (admin) ---
  await as('obras_authenticated', staff.id)
  ok('admin vê todas as tarefas', Number((await one('select count(*) n from planner_tasks')).n) >= totalTasks)
  ok('admin altera etapa', (await attempt("update work_stages set notes = 'ok' where id = (select id from work_stages limit 1)")).rowCount === 1)
  ok('admin vincula usuário a membro da equipe', (await attempt('update profiles set team_member_id = $2 where id = $1', [presta.id, B])).rowCount === 1)
  ok('admin vê todos os anexos', (await q('select id from planner_task_attachments where id in ($1, $2)', [attA, attB])).length === 2)

  // --- Sem login (anon) ---
  await as('obras_anon', null)
  ok('anônimo não lê tarefas', (await q('select id from planner_tasks')).length === 0)
  ok('anônimo não cria tarefa', (await attempt("insert into planner_tasks (title) values ('x')")).error?.code === '42501')
  ok('anônimo não lê anexos', (await q('select id from planner_task_attachments')).length === 0)
  ok('anônimo ainda lê as obras (modo TV)', (await q('select id from works')).length > 0)
} catch (e) {
  console.log('ERRO', e.message)
  failed++
} finally {
  await c.query('ROLLBACK')
  await c.end()
}
console.log(failed ? `\n${failed} FALHA(S)` : '\nTudo certo (transação desfeita)')
process.exit(failed ? 1 : 0)
