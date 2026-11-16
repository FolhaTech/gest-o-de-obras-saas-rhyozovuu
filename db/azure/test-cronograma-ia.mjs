// Testa (RLS, transação desfeita no final): observações do responsável para a análise do Cronograma com IA (29).
// Se a migração 29 ainda não está aplicada, ela roda DENTRO da transação (e é desfeita junto).
// Uso: node db/azure/test-cronograma-ia.mjs (lê DATABASE_URL do .env.local)
import { existsSync, readFileSync } from 'node:fs'
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
const internal = async () => {
  await c.query('RESET ROLE')
  await c.query("select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', '', true)")
}
const user = (sub) => as('obras_authenticated', sub)

try {
  await c.query('BEGIN')
  if (!(await one("select to_regclass('public.schedule_ai_notes') t")).t) {
    await c.query(readFileSync('db/azure/29_cronograma_ia_observacoes.sql', 'utf8'))
    console.log('(migração 29 aplicada dentro da transação, ainda não está no banco)')
  }
  const adm = await one("select id from profiles where lower(role) = 'admin' order by email limit 1")
  const [ges, pre, fin] = await q("select id from profiles where lower(role) = 'prestador' order by email limit 3")
  await c.query("update profiles set role = 'gestor' where id = $1", [ges.id])
  await c.query("update profiles set role = 'financeiro' where id = $1", [fin.id])

  const works = await q('select id from works order by name limit 2')
  const [w1, w2] = works.map((w) => w.id)
  await internal()
  const s1 = (await one("insert into work_stages (work_id, name, start_date, end_date_planned) values ($1, '  Etapa teste IA  ', '2026-11-01', '2026-11-10') returning id", [w1])).id
  const sOther = (await one("insert into work_stages (work_id, name) values ($1, 'Etapa de outra obra') returning id", [w2])).id

  // ---------------------------------------------------------------- admin e gestor gravam
  await user(adm.id)
  const n1 = await attempt("insert into schedule_ai_notes (work_id, stage_id, kind, from_list, reason) values ($1, $2, 'rejected', 'do_first', '  Falta material, chega semana que vem  ') returning id, stage_name, reason, active, created_by", [w1, s1])
  ok('o admin registra que não vai seguir uma etapa e o motivo', !n1.error && n1.rowCount === 1, n1.error?.message)
  ok('o nome da etapa e o autor ficam guardados, o motivo sem espaços nas pontas, nasce ativa', n1.rows[0]?.stage_name === 'Etapa teste IA' && n1.rows[0].created_by === adm.id && n1.rows[0].reason === 'Falta material, chega semana que vem' && n1.rows[0].active === true, JSON.stringify(n1.rows[0]))
  await user(ges.id)
  const n2 = await attempt("insert into schedule_ai_notes (work_id, kind, reason) values ($1, 'constraint', 'A equipe de pintura só chega dia 20') returning id, stage_id, stage_name, from_list", [w1])
  ok('o gestor registra uma restrição geral', !n2.error && n2.rowCount === 1, n2.error?.message)
  const n2b = await attempt("insert into schedule_ai_notes (work_id, stage_id, stage_name, from_list, kind, reason) values ($1, $2, 'x', 'can_wait', 'constraint', 'Restrição com etapa junto') returning stage_id, stage_name, from_list", [w1, s1])
  ok('restrição geral não fica presa a etapa nem a lista', n2b.rows[0]?.stage_id === null && n2b.rows[0].stage_name === null && n2b.rows[0].from_list === null, JSON.stringify(n2b.rows[0]))

  // ---------------------------------------------------------------- regras de conteúdo
  await user(adm.id)
  ok('motivo curto demais é recusado', (await attempt("insert into schedule_ai_notes (work_id, kind, reason) values ($1, 'constraint', 'ab')", [w1])).error?.code === '23514')
  ok('motivo só com espaços é recusado', (await attempt("insert into schedule_ai_notes (work_id, kind, reason) values ($1, 'constraint', '     ')", [w1])).error?.code === '23514')
  ok('motivo acima de 500 caracteres é recusado', (await attempt("insert into schedule_ai_notes (work_id, kind, reason) values ($1, 'constraint', $2)", [w1, 'x'.repeat(501)])).error?.code === '23514')
  ok('tipo inválido é recusado', /Tipo de observação inválido/.test((await attempt("insert into schedule_ai_notes (work_id, kind, reason) values ($1, 'outro', 'motivo válido')", [w1])).error?.message ?? ''))
  ok('lista inválida é recusada', (await attempt("insert into schedule_ai_notes (work_id, stage_id, kind, from_list, reason) values ($1, $2, 'rejected', 'qualquer', 'motivo válido')", [w1, s1])).error?.code === '23514')
  ok('recusar etapa exige informar a etapa', /Informe a etapa/.test((await attempt("insert into schedule_ai_notes (work_id, kind, from_list, reason) values ($1, 'rejected', 'do_first', 'motivo válido')", [w1])).error?.message ?? ''))
  ok('recusar etapa exige informar a lista', /Informe de qual lista/.test((await attempt("insert into schedule_ai_notes (work_id, stage_id, kind, reason) values ($1, $2, 'rejected', 'motivo válido')", [w1, s1])).error?.message ?? ''))
  ok('a etapa precisa ser da mesma obra', /não pertence a esta obra/.test((await attempt("insert into schedule_ai_notes (work_id, stage_id, kind, from_list, reason) values ($1, $2, 'rejected', 'do_first', 'motivo válido')", [w1, sOther])).error?.message ?? ''))
  ok('obra inexistente é recusada', !!(await attempt("insert into schedule_ai_notes (work_id, kind, reason) values (gen_random_uuid(), 'constraint', 'motivo válido')")).error)

  // ---------------------------------------------------------------- desativar (a IA deixa de considerar)
  const off = await attempt("update schedule_ai_notes set active = false, work_id = $2, kind = 'constraint', from_list = 'can_wait', reason = 'motivo corrigido' where id = $1 returning active, work_id, stage_id, kind, from_list, reason", [n1.rows[0].id, w2])
  ok('desativa a observação; o que ela é (obra, etapa, tipo) não muda', off.rows[0]?.active === false && off.rows[0].work_id === w1 && off.rows[0].stage_id === s1 && off.rows[0].kind === 'rejected' && off.rows[0].from_list === 'do_first' && off.rows[0].reason === 'motivo corrigido', JSON.stringify(off.rows[0]))

  // ---------------------------------------------------------------- quem lê e grava
  const count = async (role, sub) => {
    await as(role, sub)
    const r = await attempt('select id from schedule_ai_notes where work_id = $1', [w1])
    return r.error ? -1 : r.rows.length
  }
  ok('o admin lê as observações', (await count('obras_authenticated', adm.id)) >= 3)
  ok('o gestor lê as observações', (await count('obras_authenticated', ges.id)) >= 3)
  ok('o prestador NÃO lê', (await count('obras_authenticated', pre.id)) === 0)
  ok('o financeiro NÃO lê', (await count('obras_authenticated', fin.id)) === 0)
  ok('anônimo NÃO lê', (await count('obras_anon', null)) <= 0)
  for (const [nome, sub] of [['o prestador', pre.id], ['o financeiro', fin.id]]) {
    await user(sub)
    ok(`${nome} NÃO grava`, (await attempt("insert into schedule_ai_notes (work_id, kind, reason) values ($1, 'constraint', 'tentativa de gravar')", [w1])).error?.code === '42501')
    ok(`${nome} NÃO altera nem apaga`, (await attempt("update schedule_ai_notes set active = false where work_id = $1", [w1])).rowCount === 0 && (await attempt('delete from schedule_ai_notes where work_id = $1', [w1])).rowCount === 0)
  }
  await user(ges.id)
  ok('o gestor apaga uma observação', (await attempt('delete from schedule_ai_notes where id = $1', [n2.rows[0].id])).rowCount === 1)

  // ---------------------------------------------------------------- excluir etapa e obra
  await internal()
  // excluir o autor também só zera o campo (a observação fica)
  const authorTmp = (await one("select id from profiles where id <> $1 and id <> $2 and id <> $3 and id <> $4 order by email limit 1", [adm.id, ges.id, pre.id, fin.id])).id
  await c.query("insert into schedule_ai_notes (work_id, kind, reason, created_by) values ($1, 'constraint', 'autor sai do sistema', $2)", [w1, authorTmp])
  await c.query('delete from work_stages where id = $1', [s1])
  const kept = await one('select stage_id, stage_name from schedule_ai_notes where id = $1', [n1.rows[0].id])
  ok('excluir a etapa mantém a observação com o nome guardado', kept?.stage_id === null && kept.stage_name === 'Etapa teste IA', JSON.stringify(kept))
  await c.query('update schedule_ai_notes set created_by = null where created_by = $1', [authorTmp])
  ok('o autor sair do sistema mantém a observação (autor fica em branco)', Number((await one("select count(*) n from schedule_ai_notes where reason = 'autor sai do sistema' and created_by is null")).n) === 1)
  const wTmp = (await one("insert into works (name) values ('OBRA TESTE IA') returning id")).id
  await c.query("insert into schedule_ai_notes (work_id, kind, reason) values ($1, 'constraint', 'some junto com a obra')", [wTmp])
  await c.query('delete from works where id = $1', [wTmp])
  ok('excluir a obra apaga as observações dela', Number((await one('select count(*) n from schedule_ai_notes where work_id = $1', [wTmp])).n) === 0)
} catch (e) {
  console.log('ERRO', e.message)
  failed++
} finally {
  await c.query('ROLLBACK')
  await c.end()
}
console.log(failed ? `\n${failed} FALHA(S)` : '\nTudo certo (transação desfeita)')
process.exit(failed ? 1 : 0)
