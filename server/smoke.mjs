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
// material de teste próprio (o catálogo real pode mudar); a busca em MAIÚSCULAS prova que o ilike ignora caixa
await db.query("insert into public.materials (name) values ('smoke-cimento-ilike')")
r = await sb.from('materials').select('id,name').ilike('name', '%CIMENTO-ILIKE%')
ok('ilike', !r.error && r.data.length === 1 && r.data[0].name === 'smoke-cimento-ilike', r.error?.message)
await db.query("delete from public.materials where name = 'smoke-cimento-ilike'")
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
// Materiais > Materiais Locados lista as locações de todas as obras, com o nome da obra (embed)
const rall = await sb.from('work_rented_materials').select('id, name, works:work_id(id, name)').eq('name', 'smoke-andaime')
ok('lista geral de locados traz o nome da obra (embed)', !rall.error && rall.data.length === 1 && rall.data[0].works?.id === work.id && !!rall.data[0].works?.name, rall.error?.message)
await sb.from('work_rented_materials').delete().eq('id', rent.data?.id)
const ranon = await mk0().from('work_rented_materials').select('id')
ok('anon não lê materiais locados', !!ranon.error || ranon.data.length === 0)

// --- perdas de materiais e metas (equipe interna) ---
// material de teste próprio (o catálogo real pode estar vazio); sai no final pelo nome "smoke-mat%"
await db.query("insert into public.materials (name, unit_of_measure, unit_price, stock_quantity) values ('smoke-mat-perda', 'kg', 12, 100)")
const mat0 = (await sb.from('materials').select('id,name,unit_price').eq('name', 'smoke-mat-perda').single()).data
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
  // etapa própria do teste: nunca altera etapa real (o card espelho sai junto ao excluir a etapa)
  const smokeStageId = (await db.query("insert into public.work_stages (work_id, name) values ($1, 'smoke-etapa-rls') returning id", [work.id])).rows[0].id
  const allTasks = (await sb.from('planner_tasks').select('id')).data.length
  const allStages = (await sb.from('work_stages').select('id')).data.length
  // item de planilha (materiais alocados com valores) criado direto no banco; removido no final do bloco
  const allocId = (await db.query("insert into public.work_extra_materials (work_id, code, name, unit, quantity, source) values ($1, 'SMK', 'smoke-item', 'UN', 3, 'smoke-planilha') returning id", [work.id])).rows[0].id
  await db.query('insert into public.work_extra_material_values (extra_material_id, unit_price, total_cost) values ($1, 2, 6)', [allocId])
  const allocSel = () => sb.from('work_extra_materials').select('id, code, name, unit, quantity, materials(name), work_extra_material_values(unit_price, total_cost)').eq('work_id', work.id).not('source', 'is', null).eq('code', 'SMK').order('name', { ascending: true })
  const allocAdmin = await allocSel()
  const av = [allocAdmin.data?.[0]?.work_extra_material_values].flat()[0]
  ok('admin lê os itens alocados com os valores (embed)', !allocAdmin.error && allocAdmin.data.length === 1 && Number(av?.total_cost) === 6, allocAdmin.error?.message)
  // equipamento de teste (criado no banco) com valor de compra e custo de manutenção
  const eqId = (await db.query("insert into public.equipment (name, purchase_value) values ('smoke-equip', 500) returning id")).rows[0].id
  await db.query('insert into public.equipment_maintenances (equipment_id, maintenance_cost, maintenance_date) values ($1, 80, current_date)', [eqId])
  const eqSel = () => sb.from('equipment').select('id, name, purchase_value, equipment_maintenances(id, maintenance_cost)').eq('id', eqId)
  const eqAdmin = await eqSel()
  const eqAdminCost = [eqAdmin.data?.[0]?.equipment_maintenances].flat()[0]?.maintenance_cost
  ok('admin lê o equipamento com os valores', !eqAdmin.error && Number(eqAdmin.data[0]?.purchase_value) === 500 && Number(eqAdminCost) === 80, eqAdmin.error?.message)
  // veículo de teste (criado no banco) com valor de compra, custo de manutenção e nota de combustível
  const vehId = (await db.query("insert into public.vehicles (plate, model, purchase_value) values ('SMK0A00', 'smoke-veiculo', 90000) returning id")).rows[0].id
  await db.query('insert into public.vehicle_maintenances (vehicle_id, maintenance_cost, odometer_km) values ($1, 150, 1000)', [vehId])
  await db.query('insert into public.vehicle_fuel_receipts (vehicle_id, liters, price_per_liter, total_value, odometer_km) values ($1, 30, 6.5, 195, 1200)', [vehId])
  const vehSel = () => sb.from('vehicles').select('id, plate, odometer_km, purchase_value, vehicle_maintenances(id, maintenance_cost), vehicle_fuel_receipts(id, liters, price_per_liter, total_value)').eq('id', vehId)
  const vAdmin = await vehSel()
  const vA = vAdmin.data?.[0]
  const vAm = [vA?.vehicle_maintenances].flat()[0]
  const vAf = [vA?.vehicle_fuel_receipts].flat()[0]
  ok('admin lê o veículo com todos os valores', !vAdmin.error && Number(vA?.purchase_value) === 90000 && Number(vAm?.maintenance_cost) === 150 && Number(vAf?.total_value) === 195 && Number(vAf?.price_per_liter) === 6.5, vAdmin.error?.message)
  ok('o km do veículo acompanha o maior km lançado', vA?.odometer_km === 1200, String(vA?.odometer_km))
  // solicitação de compra e pagamento da equipe de teste (Faturamento), com valores
  const smkMember = (await db.query('select id from public.team_members order by name limit 1')).rows[0].id
  const reqId = (await db.query("insert into public.purchase_requests (item, quantity, unit, requested_by, status, supplier, quoted_value, final_value) values ('smoke-compra', 3, 'un', $1, 'quoting', 'Loja Smoke', 150, 140) returning id", [smokeUserId])).rows[0].id
  await db.query("insert into public.purchase_quotes (request_id, supplier, quoted_value, round) values ($1, 'smoke-fornecedor', 77, 1)", [reqId])
  await db.query("insert into public.team_payments (member_id, reference, payment_amount) values ($1, 'smoke-pagamento', 321)", [smkMember])
  // presença de uma pessoa só do teste, numa semana futura (sempre aberta): a contagem da semana vira pagamento pendente
  await db.query("delete from public.team_payments where member_name = 'smoke-semana'") // sobra de um teste interrompido
  await db.query("delete from public.team_members where name = 'smoke-semana'")
  const wkMember = (await db.query("insert into public.team_members (name, daily_cost, payment_type, status) values ('smoke-semana', 120, 'daily', 'active') returning id")).rows[0].id
  const wkDates = (await db.query("select (public.team_week_start(public.today_br()) + 14)::text d1, (public.team_week_start(public.today_br()) + 15)::text d2")).rows[0]
  await db.query('insert into public.attendance_records (worker_id, date, is_present) values ($1, $2, true), ($1, $3, true)', [wkMember, wkDates.d1, wkDates.d2])
  const wkSel = () => sb.from('team_payments').select('id, member_name, payment_amount, status, source, week_days, week_rate, week_extra').eq('member_name', 'smoke-semana')
  const wkAdmin = await wkSel()
  ok('admin vê o pagamento semanal calculado pela presença (2 dias x 120)', !wkAdmin.error && wkAdmin.data.length === 1 && Number(wkAdmin.data[0].payment_amount) === 240 && wkAdmin.data[0].week_days === 2 && Number(wkAdmin.data[0].week_rate) === 120 && wkAdmin.data[0].source === 'attendance' && wkAdmin.data[0].status === 'pending', wkAdmin.error?.message ?? JSON.stringify(wkAdmin.data))
  const reqSel = () => sb.from('purchase_requests').select('id, item, status, supplier, quoted_value, final_value').eq('id', reqId)
  const reqAdmin = await reqSel()
  ok('admin lê a solicitação de compra com os valores', !reqAdmin.error && reqAdmin.data.length === 1 && Number(reqAdmin.data[0].quoted_value) === 150 && Number(reqAdmin.data[0].final_value) === 140, reqAdmin.error?.message)
  const quotesAdmin = await sb.from('purchase_quotes').select('supplier, quoted_value').eq('request_id', reqId)
  ok('admin lê as cotações com os valores', !quotesAdmin.error && quotesAdmin.data.length === 1 && Number(quotesAdmin.data[0].quoted_value) === 77, quotesAdmin.error?.message)
  // pedido de OUTRO usuário (o admin não é o solicitante): ele não atende, só o financeiro
  const otherUser = (await db.query('select id from public.profiles where id <> $1 order by email limit 1', [smokeUserId])).rows[0].id
  const reqOther = (await db.query("insert into public.purchase_requests (item, quantity, requested_by) values ('smoke-compra-outro', 1, $1) returning id", [otherUser])).rows[0].id
  const admAtend = await sb.from('purchase_requests').update({ status: 'approved', supplier: 'Admin' }).eq('id', reqOther).select('id')
  ok('o admin NÃO pula o fluxo (aprovar exige as cotações enviadas pelo financeiro)', !!admAtend.error && /não permitida/.test(admAtend.error.message), admAtend.error?.message)
  const admQuote = await sb.from('purchase_quotes').insert({ request_id: reqOther, supplier: 'Admin', quoted_value: 1 }).select('id')
  ok('o admin NÃO lança cotação (só o financeiro)', !!admQuote.error, admQuote.error?.message)
  const reqOtherRow = (await db.query('select status, supplier from public.purchase_requests where id = $1', [reqOther])).rows[0]
  ok('...e o pedido continua pendente pelo financeiro', reqOtherRow.status === 'requested' && reqOtherRow.supplier === null)
  const payAdmin = await sb.from('team_payments').select('reference, payment_amount').eq('reference', 'smoke-pagamento')
  ok('admin lê o pagamento da equipe com o valor', !payAdmin.error && payAdmin.data.length === 1 && Number(payAdmin.data[0].payment_amount) === 321, payAdmin.error?.message)
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
  const vP = await vehSel()
  ok('prestador não enxerga veículos', !vP.error && vP.data.length === 0, vP.error?.message)
  const reqP = await reqSel()
  ok('o solicitante vê a própria solicitação, sem valores (mas vê fornecedor e situação)', !reqP.error && reqP.data.length === 1 && reqP.data[0].supplier === 'Loja Smoke' && !('quoted_value' in reqP.data[0]) && !('final_value' in reqP.data[0]), reqP.error?.message)
  const newReq = await sb.from('purchase_requests').insert({ item: 'smoke-pedido', quantity: 2, unit: 'un', status: 'approved', supplier: 'Fornecedor Falso', quoted_value: 9, final_value: 9 }).select('id, status, supplier, quoted_value').single()
  ok('o prestador solicita compra e a parte do financeiro é ignorada (situação "solicitada")', !newReq.error && newReq.data.status === 'requested' && newReq.data.supplier === null && !('quoted_value' in newReq.data), newReq.error?.message)
  const reqEdit = await sb.from('purchase_requests').update({ status: 'approved' }).eq('id', newReq.data?.id).select('id')
  ok('o prestador não aprova a própria solicitação', !!reqEdit.error && /não permitida/.test(reqEdit.error.message), reqEdit.error?.message)
  const quotesP = await sb.from('purchase_quotes').select('id')
  ok('o prestador não enxerga as cotações (são valores)', !quotesP.error && quotesP.data.length === 0, quotesP.error?.message)
  const quoteP = await sb.from('purchase_quotes').insert({ request_id: newReq.data?.id, supplier: 'Intruso', quoted_value: 1 }).select('id')
  ok('o prestador não lança cotação', !!quoteP.error, quoteP.error?.message)
  const payP = await sb.from('team_payments').select('id')
  ok('o prestador não enxerga o pagamento da equipe', !payP.error && payP.data.length === 0)
  // manutenção da casa: o colaborador faz check-in, lança material (baixa no estoque) e faz check-out
  const manMat = (await db.query("insert into public.materials (name, unit_of_measure, stock_quantity) values ('smoke-mat-man', 'kg', 2) returning id")).rows[0].id
  const manStock = async () => Number((await db.query('select stock_quantity from public.materials where id = $1', [manMat])).rows[0].stock_quantity)
  const ci = await sb.from('house_maintenances').insert({ work_id: work.id, service_type: 'Diarista', performed_by: 'smoke-man', status: 'in_progress' }).select('id, status, check_in_at, check_out_at, created_by').single()
  ok('colaborador faz check-in (hora de entrada do servidor)', !ci.error && ci.data.status === 'in_progress' && !!ci.data.check_in_at && ci.data.check_out_at === null && ci.data.created_by === smokeUserId, ci.error?.message)
  const manTooMuch = await sb.from('house_maintenance_materials').insert({ maintenance_id: ci.data?.id, material_id: manMat, quantity: 5 })
  ok('material acima do estoque é recusado com mensagem clara', !!manTooMuch.error && /Estoque insuficiente/.test(manTooMuch.error.message), manTooMuch.error?.message)
  ok('...e o estoque não mexe', (await manStock()) === 2)
  const manUse = await sb.from('house_maintenance_materials').insert({ maintenance_id: ci.data?.id, material_id: manMat, quantity: 1 }).select('material_name, unit, quantity').single()
  ok('material dentro do estoque dá baixa (2 → 1)', !manUse.error && manUse.data.material_name === 'smoke-mat-man' && (await manStock()) === 1, manUse.error?.message)
  const co = await sb.from('house_maintenances').update({ status: 'done' }).eq('id', ci.data?.id).select('status, check_in_at, check_out_at').single()
  ok('check-out grava a hora de saída (depois da entrada)', !co.error && co.data.status === 'done' && new Date(co.data.check_out_at) >= new Date(co.data.check_in_at), co.error?.message)
  const manList = await sb.from('house_maintenances').select('id, house_maintenance_materials(material_name, quantity)').eq('id', ci.data?.id)
  ok('a lista traz a manutenção com os materiais usados (embed)', !manList.error && manList.data.length === 1 && [manList.data[0].house_maintenance_materials].flat().length === 1)
  const manDel = await sb.from('house_maintenances').delete().eq('id', ci.data?.id).select('id')
  ok('colaborador exclui a manutenção dele e o material volta ao estoque (1 → 2)', !manDel.error && manDel.data.length === 1 && (await manStock()) === 2, manDel.error?.message)
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
  const anyStage = smokeStageId
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
  const eqG = await eqSel()
  const eqGm = [eqG.data?.[0]?.equipment_maintenances].flat()[0]
  ok('gestor lê equipamento e manutenções SEM os valores', !eqG.error && eqG.data.length === 1 && eqG.data[0].name === 'smoke-equip' && !('purchase_value' in eqG.data[0]) && !!eqGm && !('maintenance_cost' in eqGm), eqG.error?.message)
  const eqGIns = await sb.from('equipment').insert({ name: 'smoke-equip-g', purchase_value: 99 }).select('id, name, purchase_value').single()
  ok('gestor cadastra equipamento (o valor é descartado)', !eqGIns.error && eqGIns.data.name === 'smoke-equip-g' && !('purchase_value' in eqGIns.data), eqGIns.error?.message)
  const eqGKept = (await db.query("select purchase_value::int v from public.equipment where name = 'smoke-equip-g'")).rows[0]?.v
  ok('o valor enviado pelo gestor não foi gravado', eqGKept === 0, `valor=${eqGKept}`)
  const vG = await vehSel()
  const vGv = vG.data?.[0]
  const vGm = [vGv?.vehicle_maintenances].flat()[0]
  const vGf = [vGv?.vehicle_fuel_receipts].flat()[0]
  ok('gestor lê veículo, manutenção e nota de combustível SEM os valores', !vG.error && vG.data.length === 1 && vGv.plate === 'SMK0A00' && !('purchase_value' in vGv) && !!vGm && !('maintenance_cost' in vGm) && !!vGf && Number(vGf.liters) === 30 && !('total_value' in vGf) && !('price_per_liter' in vGf), vG.error?.message)
  const vGIns = await sb.from('vehicle_fuel_receipts').insert({ vehicle_id: vehId, liters: 12, total_value: 99, price_per_liter: 8 }).select('id, liters').single()
  const vGKept = (await db.query('select total_value::int t, price_per_liter::int p from public.vehicle_fuel_receipts where id = $1', [vGIns.data?.id])).rows[0]
  ok('gestor registra abastecimento (litros ficam, o valor enviado é descartado)', !vGIns.error && Number(vGIns.data.liters) === 12 && vGKept?.t === 0 && vGKept?.p === 0, vGIns.error?.message)
  const vGFilter = await sb.from('vehicle_fuel_receipts').select('id').gt('total_value', 100)
  ok('gestor não descobre o valor da nota por filtro', vGFilter.error?.code === '42501', vGFilter.error?.code)
  const reqG = await reqSel()
  ok('o gestor vê a solicitação de compra, sem os valores', !reqG.error && reqG.data.length === 1 && reqG.data[0].item === 'smoke-compra' && !('quoted_value' in reqG.data[0]) && !('final_value' in reqG.data[0]), reqG.error?.message)
  const reqGFilter = await sb.from('purchase_requests').select('id').gt('quoted_value', 100)
  ok('o gestor não descobre o valor cotado por filtro', reqGFilter.error?.code === '42501', reqGFilter.error?.code)
  const quotesG = await sb.from('purchase_quotes').select('id')
  ok('o gestor não enxerga as cotações', !quotesG.error && quotesG.data.length === 0, quotesG.error?.message)
  const quotesGFilter = await sb.from('purchase_quotes').select('id').gt('quoted_value', 10)
  ok('o gestor não descobre o valor de cotação por filtro', quotesGFilter.error?.code === '42501', quotesGFilter.error?.code)
  const payG = await sb.from('team_payments').select('id')
  ok('o gestor não enxerga o pagamento da equipe', !payG.error && payG.data.length === 0)
  const wkG = await sb.from('team_payments').select('id, week_rate').eq('member_name', 'smoke-semana')
  ok('o gestor não enxerga o pagamento semanal nem a diária', !wkG.error && wkG.data.length === 0, wkG.error?.message)

  // ---- papel Financeiro: valores do Faturamento sim; valores gerais e áreas da equipe interna não
  await db.query("update public.profiles set role = 'financeiro' where id = $1", [smokeUserId])
  const reqF = await reqSel()
  ok('o financeiro vê a solicitação de compra COM os valores', !reqF.error && reqF.data.length === 1 && Number(reqF.data[0].quoted_value) === 150 && Number(reqF.data[0].final_value) === 140, reqF.error?.message)
  const payF = await sb.from('team_payments').select('reference, payment_amount').eq('reference', 'smoke-pagamento')
  ok('o financeiro vê o pagamento da equipe com o valor', !payF.error && payF.data.length === 1 && Number(payF.data[0].payment_amount) === 321, payF.error?.message)
  const worksF = await sb.from('works').select('*').limit(2)
  ok('o financeiro NÃO vê os valores gerais das obras', !worksF.error && worksF.data.length > 0 && worksF.data.every((w) => w.name && !('contracted_value' in w) && !('budget_planned' in w)), worksF.error?.message)
  const memF = await sb.from('team_members').select('*').limit(2)
  ok('o financeiro NÃO vê a diária e o salário da equipe', !memF.error && memF.data.length > 0 && memF.data.every((m) => !('daily_cost' in m) && !('fixed_salary' in m)))
  const memPix = await sb.from('team_members').select('id, name, pix_key').limit(2)
  ok('o financeiro vê a chave PIX (para pagar)', !memPix.error && memPix.data.length > 0 && memPix.data.every((m) => 'pix_key' in m), memPix.error?.message)
  const quotesF = await sb.from('purchase_quotes').select('supplier, quoted_value').eq('request_id', reqId)
  ok('o financeiro lê as cotações com os valores', !quotesF.error && quotesF.data.length === 1 && Number(quotesF.data[0].quoted_value) === 77, quotesF.error?.message)
  // fluxo: o financeiro cota (3 fornecedores), o admin aprova, o financeiro compra, recebe, libera o pagamento
  const flowId = newReq.data?.id
  const flowStatus = async () => (await db.query('select * from public.purchase_requests where id = $1', [flowId])).rows[0]
  const fq1 = await sb.from('purchase_quotes').insert({ request_id: flowId, supplier: 'Smoke A', quoted_value: 120, payment_mode: 'advance', delivery_days: 5 }).select('id, round, supplier').single()
  ok('o financeiro lança a primeira cotação (rodada 1)', !fq1.error && fq1.data.round === 1, fq1.error?.message)
  ok('...e a solicitação entra em cotação', (await flowStatus()).status === 'quoting')
  const fqDup = await sb.from('purchase_quotes').insert({ request_id: flowId, supplier: ' smoke a ', quoted_value: 100 }).select('id')
  ok('não repete o fornecedor na mesma rodada', !!fqDup.error && fqDup.error.code === '23505', fqDup.error?.code)
  await sb.from('purchase_quotes').insert({ request_id: flowId, supplier: 'Smoke B', quoted_value: 110, payment_mode: 'after_delivery' })
  const fTooFew = await sb.from('purchase_requests').update({ status: 'quotes_sent' }).eq('id', flowId).select('id')
  ok('com 2 cotações não envia ao admin (mínimo 3)', !!fTooFew.error && /ao menos 3/.test(fTooFew.error.message), fTooFew.error?.message)
  const fq3 = await sb.from('purchase_quotes').insert({ request_id: flowId, supplier: 'Smoke C', quoted_value: 130, payment_mode: 'after_delivery' }).select('id').single()
  const fSend = await sb.from('purchase_requests').update({ status: 'quotes_sent' }).eq('id', flowId).select('status').single()
  ok('com 3 fornecedores diferentes o financeiro envia ao admin', !fSend.error && fSend.data.status === 'quotes_sent', fSend.error?.message)
  const fLate = await sb.from('purchase_quotes').insert({ request_id: flowId, supplier: 'Smoke D', quoted_value: 1 }).select('id')
  ok('depois de enviadas não entram mais cotações', !!fLate.error, fLate.error?.message)
  const fSelfApprove = await sb.from('purchase_requests').update({ status: 'approved', approved_quote_id: fq3.data?.id }).eq('id', flowId).select('id')
  ok('o financeiro não aprova a cotação', !!fSelfApprove.error && /Somente o administrador/.test(fSelfApprove.error.message), fSelfApprove.error?.message)

  // admin (quem abriu o pedido) recusa e depois aprova
  await db.query("update public.profiles set role = 'admin' where id = $1", [smokeUserId])
  const aNoWhy = await sb.from('purchase_requests').update({ status: 'quoting' }).eq('id', flowId).select('id')
  ok('o admin só recusa com o motivo', !!aNoWhy.error && /motivo da recusa/.test(aNoWhy.error.message), aNoWhy.error?.message)
  const aRej = await sb.from('purchase_requests').update({ status: 'quoting', admin_notes: 'smoke: refazer' }).eq('id', flowId).select('status, quote_round, admin_notes').single()
  ok('o admin recusa: volta ao financeiro, nova rodada e motivo guardado', !aRej.error && aRej.data.status === 'quoting' && aRej.data.quote_round === 2 && aRej.data.admin_notes === 'smoke: refazer', aRej.error?.message)
  await db.query("update public.profiles set role = 'financeiro' where id = $1", [smokeUserId])
  const r2 = []
  for (const [n, v, m] of [['Smoke A', 100, 'after_delivery'], ['Smoke B', 105, 'advance'], ['Smoke E', 99, 'after_delivery']]) {
    r2.push(await sb.from('purchase_quotes').insert({ request_id: flowId, supplier: n, quoted_value: v, payment_mode: m }).select('id, round').single())
  }
  ok('rodada 2: o mesmo fornecedor cota de novo', r2.every((x) => !x.error && x.data.round === 2), r2.find((x) => x.error)?.error?.message)
  const fSend2 = await sb.from('purchase_requests').update({ status: 'quotes_sent' }).eq('id', flowId).select('status').single()
  ok('rodada 2: envia de novo ao admin', !fSend2.error && fSend2.data.status === 'quotes_sent', fSend2.error?.message)
  await db.query("update public.profiles set role = 'admin' where id = $1", [smokeUserId])
  const aOld = await sb.from('purchase_requests').update({ status: 'approved', approved_quote_id: fq3.data?.id }).eq('id', flowId).select('id')
  ok('cotação de rodada antiga não vale', !!aOld.error && /Escolha uma das cotações/.test(aOld.error.message), aOld.error?.message)
  const aOk = await sb.from('purchase_requests').update({ status: 'approved', approved_quote_id: r2[2].data?.id }).eq('id', flowId).select('status, supplier, quoted_value, final_value, payment_mode, approver_id').single()
  ok('o admin aprova: copia fornecedor, valor e pagamento da cotação', !aOk.error && aOk.data.status === 'approved' && aOk.data.supplier === 'Smoke E' && Number(aOk.data.final_value) === 99 && aOk.data.payment_mode === 'after_delivery' && aOk.data.approver_id === smokeUserId, aOk.error?.message)
  const aQuotes = await sb.from('purchase_quotes').select('id, round').eq('request_id', flowId)
  ok('o admin vê as cotações das duas rodadas (histórico)', !aQuotes.error && aQuotes.data.length === 6, String(aQuotes.data?.length))

  // financeiro compra, recebe e confere, libera o pagamento (após a entrega)
  await db.query("update public.profiles set role = 'financeiro' where id = $1", [smokeUserId])
  const fBadMode = await sb.from('purchase_requests').update({ status: 'awaiting_payment' }).eq('id', flowId).select('id')
  ok('pagamento após a entrega não vai para "aguardando pagamento"', !!fBadMode.error && /Pagamento antecipado vai para/.test(fBadMode.error.message), fBadMode.error?.message)
  const fBuy = await sb.from('purchase_requests').update({ status: 'awaiting_delivery', invoice_number: 'NF-SMK' }).eq('id', flowId).select('status, purchased_at, handled_by').single()
  ok('o financeiro faz a compra (aguardando entrega, data gravada)', !fBuy.error && fBuy.data.status === 'awaiting_delivery' && !!fBuy.data.purchased_at && fBuy.data.handled_by === smokeUserId, fBuy.error?.message)
  const fPayEarly = await sb.from('purchase_requests').update({ status: 'closed' }).eq('id', flowId).select('id')
  ok('após a entrega: não paga nem encerra antes de receber e conferir', !!fPayEarly.error, fPayEarly.error?.message)
  const fRcv = await sb.from('purchase_requests').update({ status: 'awaiting_release', receipt_notes: 'smoke: conferido' }).eq('id', flowId).select('status, received_by, receipt_notes').single()
  ok('o financeiro recebe e confere: liberar pagamento', !fRcv.error && fRcv.data.status === 'awaiting_release' && fRcv.data.received_by === smokeUserId, fRcv.error?.message)
  const fRel = await sb.from('purchase_requests').update({ status: 'closed' }).eq('id', flowId).select('status, payment_released_by, closed_at').single()
  ok('o financeiro libera o pagamento e encerra', !fRel.error && fRel.data.status === 'closed' && fRel.data.payment_released_by === smokeUserId && !!fRel.data.closed_at, fRel.error?.message)
  // pagamento antecipado: libera antes da entrega
  const advId = (await db.query("insert into public.purchase_requests (item, quantity, requested_by) values ('smoke-antecipado', 1, $1) returning id", [smokeUserId])).rows[0].id
  const advQ = []
  for (const [n, v] of [['Adv A', 50], ['Adv B', 40], ['Adv C', 45]]) {
    advQ.push((await sb.from('purchase_quotes').insert({ request_id: advId, supplier: n, quoted_value: v, payment_mode: 'advance' }).select('id').single()).data?.id)
  }
  await sb.from('purchase_requests').update({ status: 'quotes_sent' }).eq('id', advId)
  await db.query("update public.profiles set role = 'admin' where id = $1", [smokeUserId])
  await sb.from('purchase_requests').update({ status: 'approved', approved_quote_id: advQ[1] }).eq('id', advId)
  await db.query("update public.profiles set role = 'financeiro' where id = $1", [smokeUserId])
  const aBuy = await sb.from('purchase_requests').update({ status: 'awaiting_payment' }).eq('id', advId).select('status').single()
  ok('antecipado: a compra fica aguardando a liberação do pagamento', !aBuy.error && aBuy.data.status === 'awaiting_payment', aBuy.error?.message)
  const aPay = await sb.from('purchase_requests').update({ status: 'awaiting_delivery' }).eq('id', advId).select('status, payment_released_by').single()
  ok('antecipado: o financeiro libera o pagamento antes da entrega', !aPay.error && aPay.data.status === 'awaiting_delivery' && aPay.data.payment_released_by === smokeUserId, aPay.error?.message)
  const aClose = await sb.from('purchase_requests').update({ status: 'closed', receipt_notes: 'ok' }).eq('id', advId).select('status, closed_at').single()
  ok('antecipado: receber e conferir encerra a compra', !aClose.error && aClose.data.status === 'closed' && !!aClose.data.closed_at, aClose.error?.message)
  const fDel = await sb.from('purchase_requests').delete().eq('id', advId).select('id')
  ok('o financeiro não exclui solicitação (só o admin)', !fDel.error && fDel.data.length === 0, fDel.error?.message)
  const newPay = await sb.from('team_payments').insert({ member_id: smkMember, reference: 'smoke-pagamento-2', payment_amount: 50 }).select('member_name, status').single()
  ok('o financeiro lança pagamento da equipe', !newPay.error && newPay.data.status === 'pending' && !!newPay.data.member_name, newPay.error?.message)
  const wkFin = await wkSel()
  ok('o financeiro vê o pagamento semanal com dias, diária e valor', !wkFin.error && wkFin.data.length === 1 && Number(wkFin.data[0].payment_amount) === 240 && Number(wkFin.data[0].week_rate) === 120, wkFin.error?.message)
  const wkEdit = await sb.from('team_payments').update({ payment_amount: 1, week_days: 99 }).eq('id', wkFin.data?.[0]?.id).select('payment_amount, week_days').single()
  ok('o financeiro não altera o valor calculado', !wkEdit.error && Number(wkEdit.data.payment_amount) === 240 && wkEdit.data.week_days === 2, wkEdit.error?.message)
  const wkPay = await sb.from('team_payments').update({ status: 'paid' }).eq('id', wkFin.data?.[0]?.id).select('id')
  ok('semana aberta não se paga antes de fechar', !!wkPay.error && /ainda não fechou/.test(wkPay.error.message), wkPay.error?.message)
  const wkDel = await sb.from('team_payments').delete().eq('id', wkFin.data?.[0]?.id).select('id')
  ok('o financeiro não exclui pagamento calculado (só o admin)', !!wkDel.error && /só o administrador exclui/.test(wkDel.error.message), wkDel.error?.message)
  const finWork = await sb.from('works').insert({ name: 'smoke-nao-pode' }).select('id')
  ok('o financeiro não cria obra (não é equipe interna)', !!finWork.error, finWork.error?.message)
  const finVeh = await sb.from('vehicles').select('id')
  ok('o financeiro não enxerga veículos', !finVeh.error && finVeh.data.length === 0)
  await db.query("update public.profiles set role = 'gestor' where id = $1", [smokeUserId])
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

await db.query("delete from public.equipment where name like 'smoke-equip%'")
await db.query("delete from public.house_maintenances where performed_by = 'smoke-man'")
await db.query("delete from public.materials where name like 'smoke-mat%'") // as movimentações saem em cascata
await db.query("delete from public.purchase_requests where item like 'smoke-%'")
await db.query("delete from public.team_payments where reference like 'smoke-%' or member_name like 'smoke-%'")
await db.query("delete from public.team_members where name = 'smoke-semana'") // a presença sai em cascata
await db.query("delete from public.vehicles where plate like 'SMK%'") // manutenções e abastecimentos saem em cascata
await db.query("delete from public.work_goals where title = 'smoke-meta'")
await db.query("delete from public.work_stages where name like 'smoke-%'") // o card espelho sai em cascata
await db.query("delete from public.planner_tasks where title like 'smoke-%'")
// remove o usuário de teste (e o perfil/dados dele em cascata); se algo ainda o referenciar, ele fica
await db.query('delete from auth.users where id = $1', [smokeUserId]).catch((e) => console.log('usuário de teste mantido:', e.message))
await db.end()
console.log(failed ? `\n${failed} FALHA(S)` : '\nTudo certo')
process.exit(failed ? 1 : 0)
