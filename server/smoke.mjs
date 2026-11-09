// Teste de fumaça da API compatível com Supabase (node server/smoke.mjs). Usa o supabase-js de verdade.
// Cria e remove os próprios registros; o usuário de teste (smoke-*@example.com) fica no banco.
import { createClient } from '@supabase/supabase-js'

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
ok('anon lê works (policy anon)', !r.error && r.data.length > 0, r.error?.message)
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
r = await sb.from('planner_tasks').select('*, works:work_id(id, name), team_members:assignee_id(id, name, role, phone)').order('created_at', { ascending: false })
ok('embed m2o (works, team_members)', !r.error && r.data.length >= 2 && 'works' in r.data[0], r.error?.message)
r = await sb.from('works').select('id,name,work_stages(id,name)').limit(1)
ok('embed o2m (work_stages)', !r.error && Array.isArray(r.data[0]?.work_stages), r.error?.message)
r = await sb.from('work_stages').select('id', { count: 'exact', head: true })
ok('count exact head', !r.error && r.count === 16, `count=${r.count}`)
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

// --- functions ---
const fn = await sb.functions.invoke('generate-composition', { body: { serviceName: 'Teste', unit: 'm2' } })
ok('functions.invoke generate-composition', !fn.error && Array.isArray(fn.data?.materials), fn.error?.message)

console.log(failed ? `\n${failed} FALHA(S)` : '\nTudo certo')
process.exit(failed ? 1 : 0)
