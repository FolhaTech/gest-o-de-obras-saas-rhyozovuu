// Testa (transação desfeita no final): quem está em Equipes > Prestadores também vira opção de "Pessoa Responsável"
// (linha espelho em team_members). Uso: node db/azure/test-prestadores-responsavel.mjs (lê DATABASE_URL do .env.local)
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
const one = async (sql, p) => (await c.query(sql, p)).rows[0]
const as = async (role, sub) => {
  await c.query('RESET ROLE')
  await c.query(`SET LOCAL ROLE ${role}`)
  await c.query("select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', $2, true)", [sub ?? '', 'authenticated'])
}

try {
  await c.query('BEGIN')
  const admin = await one("select id from profiles where lower(role) = 'admin' order by email limit 1")
  const presta = await one("select id from profiles where lower(role) = 'prestador' order by email limit 1")
  const work = (await one('select id from works limit 1')).id
  const funcionarios0 = Number((await one('select count(*) n from team_members where provider_id is null')).n)

  // cadastra o prestador como o admin faria na tela (o gatilho roda sob RLS)
  await as('obras_authenticated', admin.id)
  const prov = (
    await one(
      "insert into service_providers (name, service_type, contact_phone) values ('PRESTADOR TESTE', 'Calceteiro', '13999990000') returning id",
    )
  ).id
  let m = await one('select * from team_members where provider_id = $1', [prov])
  ok('prestador cadastrado vira opção de responsável (linha em team_members)', !!m)
  ok('espelho leva nome, função e telefone', m?.name === 'PRESTADOR TESTE' && m.role === 'Calceteiro' && m.phone === '13999990000')
  ok('espelho é do tipo prestador, ativo e fora das médias', m?.type === 'provider' && m.status === 'active' && m.participates_in_averages === false)
  ok('não entra na contagem de funcionários', Number((await one('select count(*) n from team_members where provider_id is null')).n) === funcionarios0)

  await c.query("update service_providers set name = 'PRESTADOR TESTE 2', service_type = 'Pedreiro' where id = $1", [prov])
  m = await one('select * from team_members where provider_id = $1', [prov])
  ok('renomear o prestador atualiza o espelho', m?.name === 'PRESTADOR TESTE 2' && m.role === 'Pedreiro')

  // usa como Pessoa Responsável e como vínculo de usuário
  const card = (await one("insert into planner_tasks (title, work_id, assignee_id) values ('CARD DO PRESTADOR', $1, $2) returning id", [work, m.id])).id
  ok('prestador pode ser a Pessoa Responsável de um card', !!card)
  await c.query('update profiles set team_member_id = $2 where id = $1', [presta.id, m.id])
  ok('usuário pode ser vinculado a um prestador', (await one('select team_member_id from profiles where id = $1', [presta.id])).team_member_id === m.id)
  ok('"Responsável" digitado com o nome do prestador resolve para ele', (await one("select public.match_team_member('PRESTADOR TESTE 2') id")).id === m.id)

  // excluir o prestador remove o espelho e solta as referências
  await c.query('delete from service_providers where id = $1', [prov])
  ok('excluir o prestador remove o espelho', !(await one('select 1 from team_members where provider_id = $1', [prov])))
  ok('o card fica sem responsável', (await one('select assignee_id from planner_tasks where id = $1', [card])).assignee_id === null)
  ok('o vínculo do usuário é desfeito', (await one('select team_member_id from profiles where id = $1', [presta.id])).team_member_id === null)
} catch (e) {
  console.log('ERRO', e.message)
  failed++
} finally {
  await c.query('ROLLBACK')
  await c.end()
}
console.log(failed ? `\n${failed} FALHA(S)` : '\nTudo certo (transação desfeita)')
process.exit(failed ? 1 : 0)
