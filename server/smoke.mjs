// Teste de fumaça da API compatível com Supabase (node server/smoke.mjs). Usa o supabase-js de verdade.
// Cria e remove os próprios registros, inclusive o usuário de teste (smoke-*@example.com).
// Suba a API local assim:  ALLOW_SIGNUP=true ROLE_CACHE_MS=0 pnpm dev:api
// (o cadastro aberto vem FECHADO por padrão; o teste usa signUp; ROLE_CACHE_MS=0 desliga o cache de papel).
import { existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'

// O papel do usuário é lido do banco a cada requisição; o teste o altera direto no banco
// (cadastro aberto sempre entra como prestador).
if (existsSync('.env.local')) process.loadEnvFile('.env.local')
const dbUrl = new URL(process.env.DATABASE_URL)
const db = new pg.Client({
  host: dbUrl.hostname,
  port: Number(dbUrl.port || 5432),
  user: decodeURIComponent(dbUrl.username),
  password: decodeURIComponent(dbUrl.password),
  database: dbUrl.pathname.slice(1),
  ssl: { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== 'false' },
})
await db.connect()
// Cards que já existiam no Planner (o teste mexe em etapas, o que recria cards espelho; ao final remove os novos)
const preTasks = (await db.query('select id from public.planner_tasks')).rows.map((r) => r.id)

const API = process.env.API_URL ?? 'http://localhost:3001'
const anon = process.env.VITE_SUPABASE_ANON_KEY ?? 'anon'
const sb = createClient(API, anon, { auth: { persistSession: false, autoRefreshToken: false } })
const mk0 = () => createClient(API, anon, { auth: { persistSession: false, autoRefreshToken: false } })

let failed = 0
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -> ' + extra : ''}`)
  if (!cond) failed++
}

// --- anon ---
let r = await sb.from('works').select('id,name').limit(2)
ok('anon NÃO lê works (sem acesso público)', !r.error && r.data.length === 0, r.error?.message)
r = await sb.from('materials').select('id,unit_price').limit(2)
ok('anon NÃO lê materials (preços)', !r.error && r.data.length === 0)
r = await sb.from('airbnb_properties').select('id').limit(1)
ok('anon NÃO lê airbnb_properties', !r.error && r.data.length === 0)
r = await sb.from('profiles').select('id')
ok('anon NÃO lê profiles (RLS)', !r.error && r.data.length === 0)
r = await sb.from('team_members').insert({ name: 'x' })
ok('anon NÃO escreve team_members (RLS)', !!r.error, r.error?.code)
r = await sb.from('tabela_que_nao_existe').select('*')
ok('tabela inexistente -> PGRST205', r.error?.code === 'PGRST205', r.error?.code)

// --- auth ---
const email = `smoke-${Date.now()}@example.com`
const password = 'Teste#12345'
let s = await sb.auth.signUp({ email, password, options: { data: { role: 'admin', full_name: 'Smoke' } } })
ok('signUp devolve sessão', !s.error && !!s.data.session, s.error?.message)
let { data: me } = await sb.auth.getUser()
ok('getUser', me.user?.email === email)
const prof = await sb.from('profiles').select('role').eq('id', s.data.user.id).maybeSingle()
ok('cadastro aberto entra como prestador (ignora role=admin do cliente)', prof.data?.role === 'prestador', JSON.stringify(prof.data))
const smokeUserId = s.data.user.id
await db.query("update public.profiles set role = 'admin' where id = $1", [smokeUserId])
const bad = await createClient(API, anon, { auth: { persistSession: false } }).auth.signInWithPassword({ email, password: 'errada' })
ok('senha errada rejeitada', !!bad.error, bad.error?.message)
await sb.auth.signOut()
s = await sb.auth.signInWithPassword({ email, password })
ok('signIn', !s.error && !!s.data.session, s.error?.message)
const ref = await sb.auth.refreshSession()
ok('refreshSession', !ref.error && !!ref.data.session, ref.error?.message)
s = ref

// --- rest autenticado ---
r = await sb.from('profiles').select('id,email,role')
ok('authenticated lê profiles', !r.error && r.data.length >= 6, `${r.data?.length} linhas`)
const w0 = (await sb.from('works').select('id').limit(1).single()).data.id
const m0 = (await db.query('select id from public.team_members order by name limit 1')).rows[0].id
const emb = await sb.from('planner_tasks').insert({ title: 'smoke-embed', work_id: w0, assignee_id: m0 }).select('id, works:work_id(id, name), team_members:assignee_id(id, name, role, phone)').single()
ok('embed m2o (obra e Pessoa Responsável = membro da equipe)', !emb.error && emb.data.works?.id === w0 && emb.data.team_members?.id === m0 && !!emb.data.team_members?.name, emb.error?.message)
await sb.from('planner_tasks').delete().eq('id', emb.data?.id)
r = await sb.from('works').select('id,name,work_stages(id,name)').limit(1)
ok('embed o2m (work_stages)', !r.error && Array.isArray(r.data[0]?.work_stages), r.error?.message)
r = await sb.from('work_stages').select('id', { count: 'exact', head: true })
ok('count exact head', !r.error && r.count === (await db.query('select count(*)::int n from public.work_stages')).rows[0].n, `count=${r.count}`)
r = await sb.from('work_stages').select('id,status,progress_percentage').in('status', ['completed', 'in_progress']).order('created_at', { ascending: false }).limit(3)
ok('in + order + limit', !r.error && r.data.length <= 3, r.error?.message)
r = await sb.from('materials').select('id,name').ilike('name', '%cim%')
ok('ilike', !r.error && r.data.length >= 1, r.error?.message)
r = await sb.from('attendance_records').select('id,date').gte('date', '2020-01-01').lte('date', '2099-12-31').limit(1)
ok('gte/lte em date', !r.error && r.data.length === 1, r.error?.message)

// --- mutações ---
const work = (await sb.from('works').select('id').limit(1).single()).data
let ins = await sb.from('planner_tasks').insert({ title: 'smoke', work_id: work.id, status: 'pending' }).select('*, works:work_id(id,name)').single()
ok('insert + select + single', !ins.error && ins.data.title === 'smoke' && ins.data.works?.id === work.id, ins.error?.message)
const id = ins.data?.id
let up = await sb.from('planner_tasks').update({ status: 'completed' }).eq('id', id)
ok('update', !up.error, up.error?.message)
const chk = await sb.from('planner_tasks').select('status,updated_at,created_at').eq('id', id).single()
ok('update persistiu + trigger updated_at', chk.data?.status === 'completed' && chk.data.updated_at >= chk.data.created_at)
const mt = await sb.from('planner_tasks').select('id').eq('id', '00000000-0000-0000-0000-000000000000').maybeSingle()
ok('maybeSingle sem linha -> null', !mt.error && mt.data === null, mt.error?.message)
const sg = await sb.from('planner_tasks').select('id').eq('id', '00000000-0000-0000-0000-000000000000').single()
ok('single sem linha -> PGRST116', sg.error?.code === 'PGRST116', sg.error?.code)
const dup = await sb.from('worker_groups').insert({ name: 'Alvenaria' })
ok('violação UNIQUE -> 23505', dup.error?.code === '23505', dup.error?.code)
const wk = (await sb.from('team_members').select('id').limit(1).single()).data
const day = '2099-01-01'
const u1 = await sb.from('attendance_records').upsert({ worker_id: wk.id, date: day, is_present: true }, { onConflict: 'worker_id,date' }).select()
const u2 = await sb.from('attendance_records').upsert({ worker_id: wk.id, date: day, is_present: false }, { onConflict: 'worker_id,date' }).select()
ok('upsert onConflict (insere e depois atualiza)', !u1.error && !u2.error && u2.data[0].is_present === false, (u1.error ?? u2.error)?.message)
await sb.from('attendance_records').delete().eq('worker_id', wk.id).eq('date', day)
const del = await sb.from('planner_tasks').delete().eq('id', id)
ok('delete', !del.error, del.error?.message)

// --- porcentagem das tarefas do Planner ---
const pr = await sb.from('planner_tasks').insert({ title: 'smoke-progress', work_id: work.id, status: 'in_progress', progress_percentage: 40 }).select('id,progress_percentage').single()
ok('planner_tasks aceita progress_percentage', !pr.error && pr.data.progress_percentage === 40, pr.error?.message)
const pu = await sb.from('planner_tasks').update({ progress_percentage: 80 }).eq('id', pr.data?.id).select('progress_percentage').single()
ok('atualiza o progresso', pu.data?.progress_percentage === 80, pu.error?.message)
const over = await sb.from('planner_tasks').update({ progress_percentage: 150 }).eq('id', pr.data?.id)
ok('CHECK rejeita progresso > 100', over.error?.code === '23514', over.error?.code)
const mir = await sb.from('planner_tasks').select('id,progress_percentage').eq('work_id', work.id).eq('id', pr.data?.id)
ok('porcentagem aparece na consulta por obra', mir.data?.[0]?.progress_percentage === 80)
await sb.from('planner_tasks').delete().eq('id', pr.data?.id)

// --- Cronograma (work_stages) <-> Planner (planner_tasks) ---
const stg = await sb.from('work_stages').insert({ work_id: work.id, name: 'smoke-cronograma', start_date: '2099-01-01', end_date_planned: '2099-01-10', progress_percentage: 20, status: 'in_progress' }).select('id').single()
ok('cria etapa no cronograma', !stg.error, stg.error?.message)
const mirror = await sb.from('planner_tasks').select('id,title,progress_percentage,stage_id,work_id').eq('stage_id', stg.data?.id).single()
ok('etapa aparece no Planner com os mesmos dados', mirror.data?.title === 'smoke-cronograma' && mirror.data.progress_percentage === 20 && mirror.data.work_id === work.id, mirror.error?.message)
await sb.from('planner_tasks').update({ progress_percentage: 70 }).eq('id', mirror.data?.id)
const back = await sb.from('work_stages').select('progress_percentage').eq('id', stg.data?.id).single()
ok('progresso editado no Planner volta para o cronograma', Number(back.data?.progress_percentage) === 70, JSON.stringify(back.data))
await sb.from('work_stages').delete().eq('id', stg.data?.id)
const gone = await sb.from('planner_tasks').select('id').eq('stage_id', stg.data?.id)
ok('excluir etapa remove a tarefa espelho', !gone.error && gone.data.length === 0)

// --- status "Em atraso" no Planner ---
const dly = await sb.from('planner_tasks').insert({ title: 'smoke-atraso', status: 'delayed', work_id: work.id }).select('id,status').single()
ok('tarefa aceita o status delayed (Em Atraso)', !dly.error && dly.data.status === 'delayed', dly.error?.message)
const dbad = await sb.from('planner_tasks').update({ status: 'qualquer' }).eq('id', dly.data?.id)
ok('status inválido continua rejeitado', dbad.error?.code === '23514', dbad.error?.code)
await sb.from('planner_tasks').delete().eq('id', dly.data?.id)

// --- proteção contra apagar/atualizar tudo sem filtro ---
const nodel = await sb.from('action_types').delete() // tabela vazia: o teste nunca apaga dados reais
ok('DELETE sem filtro é recusado', nodel.error?.code === '21000', nodel.error?.code)
const noupd = await sb.from('action_types').update({ name: 'x' })
ok('UPDATE sem filtro é recusado', noupd.error?.code === '21000', noupd.error?.code)

// --- materiais locados ---
const rent = await sb.from('work_rented_materials').insert({ work_id: work.id, name: 'smoke-andaime', quantity: 2, unit: 'un', rental_cost: 15.5, cost_period: 'dia', start_date: '2099-01-01', expected_return_date: '2099-01-10' }).select('id,quantity,rental_cost').single()
ok('insere material locado', !rent.error && Number(rent.data.rental_cost) === 15.5, rent.error?.message)
const rbad = await sb.from('work_rented_materials').insert({ work_id: work.id, name: 'smoke-ruim', start_date: '2099-01-10', expected_return_date: '2099-01-01' })
ok('CHECK rejeita devolução antes do início', rbad.error?.code === '23514', rbad.error?.code)
const rup = await sb.from('work_rented_materials').update({ returned_date: '2099-01-05' }).eq('id', rent.data?.id).select('returned_date').single()
ok('registra devolução', rup.data?.returned_date === '2099-01-05', rup.error?.message)
const rlist = await sb.from('work_rented_materials').select('id').eq('work_id', work.id).eq('name', 'smoke-andaime')
ok('lista por obra', rlist.data?.length === 1)
await sb.from('work_rented_materials').delete().eq('id', rent.data?.id)
const ranon = await mk0().from('work_rented_materials').select('id')
ok('anon não lê materiais locados', !!ranon.error || ranon.data.length === 0)

// --- perdas de materiais e metas (equipe interna) ---
const mat0 = (await sb.from('materials').select('id,name,unit_price').limit(1).single()).data
const loss = await sb.from('material_losses').insert({ work_id: work.id, material_id: mat0.id, material_name: mat0.name, quantity: 2.5, unit: 'kg', unit_cost: mat0.unit_price ?? 0, reason: 'quebra' }).select('id, created_by, works:work_id(id, name), reporter:created_by(full_name, email)').single()
ok('registra perda de material (em nome de quem lançou)', !loss.error && loss.data.created_by === smokeUserId && loss.data.works?.id === work.id && !!loss.data.reporter?.email, loss.error?.message)
const lossBad = await sb.from('material_losses').insert({ work_id: work.id, material_name: 'x', quantity: 1, reason: 'invalido' })
ok('motivo de perda inválido é rejeitado', lossBad.error?.code === '23514', lossBad.error?.code)
await sb.from('material_losses').delete().eq('id', loss.data?.id)
const goal = await sb.from('work_goals').insert({ work_id: work.id, title: 'smoke-meta', reward_description: 'Bônus', reward_amount: 300 }).select('id').single()
ok('admin cria meta com premiação', !goal.error, goal.error?.message)
const gm = await sb.from('work_goal_members').insert([{ goal_id: goal.data?.id, user_id: smokeUserId }])
ok('admin define quem participa da meta', !gm.error, gm.error?.message)
const gget = await sb.from('work_goals').select('*, work_goal_members(user_id, user:user_id(id, full_name, email))').eq('id', goal.data?.id).single()
ok('meta traz os participantes (embed aninhado)', !gget.error && gget.data.work_goal_members?.[0]?.user?.id === smokeUserId, gget.error?.message)

// --- storage ---
const png = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])], { type: 'image/png' })
const path = `smoke/${Date.now()}.png`
let st = await sb.storage.from('planner-attachments').upload(path, png, { cacheControl: '3600', upsert: true })
ok('upload pequeno', !st.error, st.error?.message)
const pub = sb.storage.from('planner-attachments').getPublicUrl(path).data.publicUrl
let f = await fetch(pub)
ok('GET público', f.status === 200 && (await f.arrayBuffer()).byteLength === 11 && f.headers.get('content-type') === 'image/png', `${f.status}`)
const html = new Blob(['<script>alert(1)</script>'], { type: 'text/html' })
const hp = `smoke/${Date.now()}.html`
await sb.storage.from('planner-attachments').upload(hp, html)
f = await fetch(sb.storage.from('planner-attachments').getPublicUrl(hp).data.publicUrl)
ok('HTML vira download (sem XSS same-origin)', f.headers.get('content-type') === 'application/octet-stream' && /attachment/.test(f.headers.get('content-disposition') ?? ''))
st = await sb.storage.from('planner-attachments').remove([path, hp])
ok('remove', !st.error, st.error?.message)
f = await fetch(pub)
ok('após remover -> 404', f.status === 404, `${f.status}`)
const dl = await sb.storage.from('work-photos').list('', { limit: 5 })
ok('list bucket', !dl.error, dl.error?.message)

// --- upload em pedaços (> 4 MB) ---
const big = new Uint8Array(5_500_000).map((_, i) => i % 251)
const bigName = `smoke/big-${Date.now()}.jpg`
{
  const uploadId = crypto.randomUUID()
  const CH = 3_000_000
  const hdr = { Authorization: `Bearer ${s.data.session.access_token}` }
  for (let i = 0; i * CH < big.length; i++) {
    const rr = await fetch(`${API}/storage/v1/chunk/${uploadId}/${i}`, { method: 'POST', headers: hdr, body: big.slice(i * CH, (i + 1) * CH) })
    if (!rr.ok) ok(`chunk ${i}`, false, await rr.text())
  }
  const done = await fetch(`${API}/storage/v1/chunk/${uploadId}/complete`, { method: 'POST', headers: { ...hdr, 'content-type': 'application/json' }, body: JSON.stringify({ bucket: 'work-photos', path: bigName, contentType: 'image/jpeg', upsert: true }) })
  ok('upload em pedaços (5,5 MB)', done.ok, done.ok ? '' : await done.text())
  const g = await fetch(`${API}/storage/v1/object/public/work-photos/${bigName}`)
  const buf = new Uint8Array(await g.arrayBuffer())
  ok('download do arquivo grande íntegro', g.status === 200 && buf.length === big.length && buf[1000] === big[1000] && buf.at(-1) === big.at(-1), `${g.status} ${buf.length}`)
  const rg = await fetch(`${API}/storage/v1/object/public/work-photos/${bigName}`, { headers: { Range: 'bytes=10-19' } })
  ok('Range 206', rg.status === 206 && (await rg.arrayBuffer()).byteLength === 10, `${rg.status}`)
  await sb.storage.from('work-photos').remove([bigName])
}

// --- permissões do Prestador (via API, com RLS) ---
{
  // dois membros da equipe e um card de cada (criados direto no banco; removidos no final do bloco)
  const [mA, mB] = (await db.query('select id from public.team_members order by name limit 2')).rows
  const mineId = (await db.query("insert into public.planner_tasks (title, work_id, assignee_id) values ('smoke-meu', $1, $2) returning id", [work.id, mA.id])).rows[0].id
  const theirsId = (await db.query("insert into public.planner_tasks (title, work_id, assignee_id) values ('smoke-dele', $1, $2) returning id", [work.id, mB.id])).rows[0].id
  const allTasks = (await sb.from('planner_tasks').select('id')).data.length
  const allStages = (await sb.from('work_stages').select('id')).data.length
  // item de planilha (materiais alocados com valores) criado direto no banco; removido no final do bloco
  const allocId = (await db.query("insert into public.work_extra_materials (work_id, code, name, unit, quantity, source) values ($1, 'SMK', 'smoke-item', 'UN', 3, 'smoke-planilha') returning id", [work.id])).rows[0].id
  await db.query('insert into public.work_extra_material_values (extra_material_id, unit_price, total_cost) values ($1, 2, 6)', [allocId])
  const allocSel = () => sb.from('work_extra_materials').select('id, code, name, unit, quantity, materials(name), work_extra_material_values(unit_price, total_cost)').eq('work_id', work.id).not('source', 'is', null).eq('code', 'SMK').order('name', { ascending: true })
  const allocAdmin = await allocSel()
  const av = [allocAdmin.data?.[0]?.work_extra_material_values].flat()[0]
  ok('admin lê os itens alocados com os valores (embed)', !allocAdmin.error && allocAdmin.data.length === 1 && Number(av?.total_cost) === 6, allocAdmin.error?.message)
  // admin cria usuário (o cadastro aberto vem fechado) com o papel escolhido
  const nuEmail = `smoke-nu-${Date.now()}@example.com`
  const cu = await sb.functions.invoke('create-user', { body: { email: nuEmail, password: 'segredo123', fullName: 'Novo Smoke', role: 'gestor' } })
  const nuProf = (await db.query('select role from public.profiles where email = $1', [nuEmail])).rows[0]
  ok('admin cria usuário com o papel escolhido', !cu.error && nuProf?.role === 'gestor', cu.error?.message)
  const cuDup = await sb.functions.invoke('create-user', { body: { email: nuEmail, password: 'segredo123', role: 'gestor' } })
  ok('e-mail repetido é recusado ao criar usuário', !!cuDup.error)
  const nuLogin = await mk0().auth.signInWithPassword({ email: nuEmail, password: 'segredo123' })
  ok('usuário criado pelo admin consegue entrar', !nuLogin.error && !!nuLogin.data.session, nuLogin.error?.message)
  await db.query('delete from auth.users where email = $1', [nuEmail])
  await db.query("update public.profiles set role = 'prestador', team_member_id = $2 where id = $1", [smokeUserId, mA.id])
  const allocPrest = await allocSel()
  const pv = [allocPrest.data?.[0]?.work_extra_material_values].flat().filter(Boolean)
  ok('prestador vê os itens alocados, mas sem os valores', !allocPrest.error && allocPrest.data.length === 1 && Number(allocPrest.data[0].quantity) === 3 && pv.length === 0, allocPrest.error?.message)
  const mine = await sb.from('planner_tasks').select('id,assignee_id')
  ok('prestador vê só as tarefas atribuídas a ele', !mine.error && mine.data.length > 0 && mine.data.length < allTasks && mine.data.every((t) => t.assignee_id === mA.id), `${mine.data?.length} de ${allTasks}`)
  const others = await sb.from('planner_tasks').select('id').eq('assignee_id', mB.id)
  ok('prestador não enxerga tarefas de outro membro', !others.error && others.data.length === 0)
  const forOther = await sb.from('planner_tasks').insert({ title: 'smoke-outro', assignee_id: mB.id })
  ok('prestador não cria tarefa para outro membro', forOther.error?.code === '42501', forOther.error?.code)
  const stagesSeen = await sb.from('work_stages').select('id')
  ok('prestador vê as etapas do cronograma de todos', !stagesSeen.error && stagesSeen.data.length === allStages, `${stagesSeen.data?.length} etapas`)
  const stIns = await sb.from('work_stages').insert({ work_id: work.id, name: 'smoke-prestador' })
  ok('prestador não cria etapa no cronograma', stIns.error?.code === '42501', stIns.error?.code)
  const anyStage = stagesSeen.data[0].id
  const stUpd = await sb.from('work_stages').update({ name: 'hack' }).eq('id', anyStage).select()
  ok('prestador não altera etapa', !stUpd.error && stUpd.data.length === 0)
  const stDel = await sb.from('work_stages').delete().eq('id', anyStage).select()
  ok('prestador não exclui etapa', !stDel.error && stDel.data.length === 0)
  const rev = await sb.from('revenues').select('id')
  const exp = await sb.from('expenses').select('id')
  ok('prestador não enxerga receitas nem despesas (ROI)', !rev.error && !exp.error && rev.data.length === 0 && exp.data.length === 0)
  const expIns = await sb.from('expenses').insert({ work_id: work.id, value: 1, description: 'x' })
  ok('prestador não lança despesa', expIns.error?.code === '42501', expIns.error?.code)
  const pLoss = await sb.from('material_losses').insert({ work_id: work.id, material_name: 'smoke-perda-prestador', quantity: 1, reason: 'clima' }).select('id').single()
  ok('prestador registra perda de material', !pLoss.error, pLoss.error?.message)
  const pLosses = await sb.from('material_losses').select('id')
  ok('prestador vê as perdas registradas', !pLosses.error && pLosses.data.length >= 1)
  await sb.from('material_losses').delete().eq('id', pLoss.data?.id)
  const myGoals = await sb.from('work_goals').select('id, reward_description')
  ok('prestador vê só as metas em que participa', !myGoals.error && myGoals.data.length === 1 && myGoals.data[0].id === goal.data?.id)
  const pGoal = await sb.from('work_goals').insert({ work_id: work.id, title: 'x', reward_description: 'x' })
  ok('prestador não cria meta', pGoal.error?.code === '42501', pGoal.error?.code)
  const pPaid = await sb.from('work_goals').update({ paid_at: '2026-11-09' }).eq('id', goal.data?.id).select()
  ok('prestador não marca a premiação como entregue', !pPaid.error && pPaid.data.length === 0)
  const selfRole = await sb.from('profiles').update({ role: 'admin' }).eq('id', smokeUserId)
  ok('prestador não se promove a admin', !!selfRole.error, selfRole.error?.message)
  const selfLink = await sb.from('profiles').update({ team_member_id: mB.id }).eq('id', smokeUserId)
  ok('prestador não troca o próprio vínculo', !!selfLink.error, selfLink.error?.message)
  // Gestor: mesmas permissões do admin (todos os cards do Planner), mas sem nenhum valor (R$)
  await db.query("update public.profiles set role = 'gestor' where id = $1", [smokeUserId])
  const asGestor = await sb.from('planner_tasks').select('id,assignee_id')
  ok('gestor vê todos os cards do Planner (como o admin)', !asGestor.error && asGestor.data.length === allTasks && asGestor.data.some((t) => t.assignee_id === mB.id), `${asGestor.data?.length} de ${allTasks}`)
  // obra de teste própria (nunca mexe em obra real): criada e removida aqui
  const wid = (await db.query("insert into public.works (name, contracted_value, budget_planned) values ('smoke-obra-valores', 777, 888) returning id")).rows[0].id
  const gWorks = await sb.from('works').select('*').eq('id', wid)
  const valueKeys = ['contracted_value', 'budget_planned', 'entry_value', 'payment_method', 'installments']
  ok('gestor lê as obras SEM as colunas de valor', !gWorks.error && gWorks.data.length > 0 && gWorks.data.every((w) => w.name && valueKeys.every((k) => !(k in w))), gWorks.error?.message)
  const gEmb = await sb.from('materials').select('name, unit_price').limit(2)
  ok('gestor lê materiais sem o preço', !gEmb.error && gEmb.data.length > 0 && gEmb.data.every((m) => !('unit_price' in m)))
  const gFilter = await sb.from('works').select('id').gt('contracted_value', 1000)
  ok('gestor não descobre valor por filtro', gFilter.error?.code === '42501', gFilter.error?.code)
  const gOrder = await sb.from('works').select('id').order('budget_planned')
  ok('gestor não descobre valor por ordenação', gOrder.error?.code === '42501', gOrder.error?.code)
  const gRev = await sb.from('revenues').select('id')
  const gExp = await sb.from('expenses').select('id')
  ok('gestor não enxerga receitas nem despesas', !gRev.error && !gExp.error && gRev.data.length === 0 && gExp.data.length === 0)
  const gUpd = await sb.from('works').update({ notes: 'gestor edita', contracted_value: 1 }).eq('id', wid).select('id, notes')
  const kept = (await db.query('select contracted_value::int v from public.works where id = $1', [wid])).rows[0].v
  ok('gestor edita a obra sem alterar o valor contratado', !gUpd.error && gUpd.data.length === 1 && kept === 777, `valor=${kept}`)
  await db.query('delete from public.works where id = $1', [wid])
  const gCreate = await sb.functions.invoke('create-user', { body: { email: `smoke-x-${Date.now()}@example.com`, password: 'segredo123', role: 'prestador' } })
  ok('gestor não cria usuário', !!gCreate.error)
  const gestorStage = await sb.from('work_stages').update({ notes: 'ok' }).eq('id', anyStage).select()
  ok('gestor continua alterando o cronograma', !gestorStage.error && gestorStage.data.length === 1)
  await sb.from('work_stages').update({ notes: null }).eq('id', anyStage)
  const anonTasks = await mk0().from('planner_tasks').select('id')
  ok('sem login não lê cards do Planner', !anonTasks.error && anonTasks.data.length === 0)
  await db.query('delete from public.planner_tasks where id = any($1)', [[mineId, theirsId]])
  await db.query('delete from public.work_extra_materials where id = $1', [allocId])
}

// --- functions ---
const fn = await sb.functions.invoke('generate-composition', { body: { serviceName: 'Teste', unit: 'm2' } })
ok('functions.invoke generate-composition', !fn.error && Array.isArray(fn.data?.materials), fn.error?.message)

await db.query("delete from public.work_goals where title = 'smoke-meta'")
await db.query('delete from public.planner_tasks where not (id = any($1::uuid[]))', [preTasks])
// remove o usuário de teste (e o perfil/dados dele em cascata); se algo ainda o referenciar, ele fica
await db.query('delete from auth.users where id = $1', [smokeUserId]).catch((e) => console.log('usuário de teste mantido:', e.message))
await db.end()
console.log(failed ? `\n${failed} FALHA(S)` : '\nTudo certo')
process.exit(failed ? 1 : 0)
