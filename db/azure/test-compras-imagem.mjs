// Testa (RLS, transação desfeita no final): imagem do item no pedido e imagem em cada cotação (28_compras_imagem_item.sql).
// Se a migração 28 ainda não está aplicada, ela roda DENTRO da transação (e é desfeita junto).
// Uso: node db/azure/test-compras-imagem.mjs (lê DATABASE_URL do .env.local)
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
  if (!(await one("select 1 x from information_schema.columns where table_name = 'purchase_requests' and column_name = 'item_image_path'"))) {
    await c.query(readFileSync('db/azure/28_compras_imagem_item.sql', 'utf8'))
    console.log('(migração 28 aplicada dentro da transação, ainda não está no banco)')
  }
  const [adm] = await q("select id from profiles where lower(role) = 'admin' order by email limit 1")
  const [req1, fin, ges, other] = await q("select id from profiles where lower(role) = 'prestador' order by email limit 4")
  await c.query("update profiles set role = 'financeiro' where id = $1", [fin.id])
  await c.query("update profiles set role = 'gestor' where id = $1", [ges.id])

  const bucket = await one("select public, file_size_limit from storage.buckets where id = 'purchase-images'")
  ok('o bucket das imagens é privado e limita o tamanho', bucket?.public === false && Number(bucket.file_size_limit) === 10485760, JSON.stringify(bucket))

  const put = async (sub, path, mime = 'image/jpeg', size = 100) => {
    await user(sub)
    return attempt("insert into storage.objects (bucket_id, name, owner, metadata, data) values ('purchase-images', $1, $2, $3::jsonb, $4) returning id", [path, sub, JSON.stringify({ size, mimetype: mime }), Buffer.from('imagem de teste')])
  }
  const see = async (role, sub, path) => {
    await as(role, sub)
    const r = await attempt("select id from storage.objects where bucket_id = 'purchase-images' and name = $1", [path])
    return r.error ? -1 : r.rows.length
  }
  const newReq = async (sub, item) => {
    await user(sub)
    return (await one("insert into purchase_requests (item, quantity) values ($1, 1) returning id", [item])).id
  }

  // ---------------------------------------------------------------- imagem do item (solicitante)
  const R = await newReq(req1.id, 'ITEM COM IMAGEM')
  const itemImg = `${R}/item/foto.jpg`
  ok('o solicitante envia a imagem do item', !(await put(req1.id, itemImg)).error)
  ok('JPG, PNG, WEBP e HEIC são aceitos', !(await put(req1.id, `${R}/item/b.png`, 'image/png', 3000000)).error && !(await put(req1.id, `${R}/item/c.webp`, 'image/webp')).error && !(await put(req1.id, `${R}/item/d.heic`, 'image/heic')).error)
  ok('PDF não vale (só imagem)', (await put(req1.id, `${R}/item/x.pdf`, 'application/pdf')).error?.code === '42501')
  ok('outro tipo é recusado (html)', (await put(req1.id, `${R}/item/x.html`, 'text/html')).error?.code === '42501')
  ok('acima de 10 MB é recusada', (await put(req1.id, `${R}/item/g.jpg`, 'image/jpeg', 10485761)).error?.code === '42501')
  ok('fora da pasta do item é recusada', (await put(req1.id, `${R}/foto.jpg`)).error?.code === '42501' && (await put(req1.id, 'solta.jpg')).error?.code === '42501' && (await put(req1.id, `${R}/outra/foto.jpg`)).error?.code === '42501')
  ok('pasta de solicitação que não existe é recusada', (await put(req1.id, '00000000-0000-0000-0000-000000000000/item/foto.jpg')).error?.code === '42501')
  for (const [nome, sub] of [['outro usuário', other.id], ['o financeiro', fin.id], ['o gestor', ges.id], ['o admin', adm.id]]) {
    ok(`${nome} NÃO envia imagem para o item de outra pessoa`, (await put(sub, `${R}/item/intruso.jpg`)).error?.code === '42501')
  }
  ok('quem solicitou lê a imagem', (await see('obras_authenticated', req1.id, itemImg)) === 1)
  ok('o gestor lê a imagem (vê todos os pedidos)', (await see('obras_authenticated', ges.id, itemImg)) === 1)
  ok('o financeiro lê a imagem', (await see('obras_authenticated', fin.id, itemImg)) === 1)
  ok('o admin lê a imagem', (await see('obras_authenticated', adm.id, itemImg)) === 1)
  ok('outro usuário NÃO lê a imagem do pedido alheio', (await see('obras_authenticated', other.id, itemImg)) === 0)
  ok('anônimo NÃO lê', (await see('obras_anon', null, itemImg)) <= 0)

  // liga a imagem ao pedido
  await user(req1.id)
  const link = await attempt("update purchase_requests set item_image_path = $2, item_image_name = 'foto.jpg' where id = $1 returning item_image_path, item_image_name", [R, itemImg])
  ok('o solicitante liga a imagem ao pedido', link.rows[0]?.item_image_path === itemImg && link.rows[0].item_image_name === 'foto.jpg', link.error?.message)
  const foreign = await attempt("update purchase_requests set item_image_path = $2 where id = $1", [R, `${fin.id}/item/x.jpg`])
  ok('imagem de outra pasta não vale', /pasta desta solicitação/.test(foreign.error?.message ?? ''), foreign.error?.message)
  const asQuote = await attempt("update purchase_requests set item_image_path = $2 where id = $1", [R, `${R}/quotes/${R}/x.jpg`])
  ok('imagem de cotação não vale como imagem do item', /pasta desta solicitação/.test(asQuote.error?.message ?? ''), asQuote.error?.message)
  const clear = await attempt("update purchase_requests set item_image_path = null, item_image_name = 'sobra.jpg' where id = $1 returning item_image_path, item_image_name", [R])
  ok('tirar a imagem limpa também o nome', clear.rows[0]?.item_image_path === null && clear.rows[0].item_image_name === null)
  await attempt("update purchase_requests set item_image_path = $2, item_image_name = 'foto.jpg' where id = $1", [R, itemImg])
  const born = await attempt("insert into purchase_requests (item, item_image_path, item_image_name) values ('NASCE COM IMAGEM', 'x/item/y.jpg', 'y.jpg') returning item_image_path, item_image_name", [])
  ok('o pedido não nasce com imagem (envia depois, na pasta dele)', born.rows[0]?.item_image_path === null && born.rows[0].item_image_name === null, born.error?.message)
  await user(fin.id)
  const finEdit = await attempt("update purchase_requests set item_image_path = null where id = $1 returning item_image_path", [R])
  ok('o financeiro não mexe na imagem do item', finEdit.rows[0]?.item_image_path === itemImg)
  await user(adm.id)
  const admEdit = await attempt("update purchase_requests set item_image_path = null where id = $1 returning item_image_path", [R])
  ok('o admin também não', admEdit.rows[0]?.item_image_path === itemImg)

  // o solicitante apaga a imagem enquanto pendente
  const delItem = await (async () => { await user(req1.id); return attempt("delete from storage.objects where bucket_id = 'purchase-images' and name = $1", [`${R}/item/d.heic`]) })()
  ok('o solicitante apaga a imagem enquanto o pedido está pendente', delItem.rowCount === 1)
  await user(other.id)
  ok('outro usuário não apaga', (await attempt("delete from storage.objects where bucket_id = 'purchase-images' and name = $1", [itemImg])).rowCount === 0)

  // ---------------------------------------------------------------- imagem da cotação (financeiro)
  await user(fin.id)
  const q1 = (await one("insert into purchase_quotes (request_id, supplier, quoted_value) values ($1, 'LOJA A', 100) returning id", [R])).id
  const qImg = `${R}/quotes/${q1}/proposta.jpg`
  ok('o financeiro envia a imagem da cotação', !(await put(fin.id, qImg)).error)
  ok('PDF e outro tipo não valem na cotação', (await put(fin.id, `${R}/quotes/${q1}/x.pdf`, 'application/pdf')).error?.code === '42501' && (await put(fin.id, `${R}/quotes/${q1}/x.gif`, 'image/gif')).error?.code === '42501')
  ok('acima de 10 MB é recusada na cotação', (await put(fin.id, `${R}/quotes/${q1}/g.jpg`, 'image/jpeg', 10485761)).error?.code === '42501')
  ok('fora da pasta da cotação é recusada', (await put(fin.id, `${R}/quotes/x.jpg`)).error?.code === '42501' && (await put(fin.id, `${R}/proposta.jpg`)).error?.code === '42501')
  for (const [nome, sub] of [['o admin', adm.id], ['o gestor', ges.id], ['quem solicitou', req1.id], ['outro usuário', other.id]]) {
    ok(`${nome} NÃO envia imagem de cotação`, (await put(sub, `${R}/quotes/${q1}/intruso.jpg`)).error?.code === '42501')
  }
  ok('o financeiro lê a imagem da cotação', (await see('obras_authenticated', fin.id, qImg)) === 1)
  ok('o admin lê a imagem da cotação', (await see('obras_authenticated', adm.id, qImg)) === 1)
  ok('o gestor NÃO lê a imagem da cotação', (await see('obras_authenticated', ges.id, qImg)) === 0)
  ok('quem solicitou NÃO lê a imagem da cotação (mas lê a do item)', (await see('obras_authenticated', req1.id, qImg)) === 0 && (await see('obras_authenticated', req1.id, itemImg)) === 1)
  ok('outro usuário NÃO lê', (await see('obras_authenticated', other.id, qImg)) === 0)

  await user(fin.id)
  const qLink = await attempt("update purchase_quotes set image_path = $2, image_name = 'proposta.jpg' where id = $1 returning image_path, image_name", [q1, qImg])
  ok('o financeiro liga a imagem à cotação', qLink.rows[0]?.image_path === qImg && qLink.rows[0].image_name === 'proposta.jpg', qLink.error?.message)
  const qForeign = await attempt("update purchase_quotes set image_path = $2 where id = $1", [q1, `${R}/quotes/${R}/x.jpg`])
  ok('imagem da pasta de outra cotação não vale', /pasta desta cotação/.test(qForeign.error?.message ?? ''), qForeign.error?.message)
  const qItem = await attempt("update purchase_quotes set image_path = $2 where id = $1", [q1, itemImg])
  ok('a imagem do item não vale como imagem de cotação', /pasta desta cotação/.test(qItem.error?.message ?? ''))
  const qClear = await attempt("update purchase_quotes set image_path = null, image_name = 'sobra.jpg' where id = $1 returning image_path, image_name", [q1])
  ok('tirar a imagem da cotação limpa o nome', qClear.rows[0]?.image_path === null && qClear.rows[0].image_name === null)
  await attempt("update purchase_quotes set image_path = $2, image_name = 'proposta.jpg' where id = $1", [q1, qImg])

  // o pedido já está em cotação: o solicitante não troca mais a imagem do item, mas ainda a vê
  await user(req1.id)
  const late = await attempt("update purchase_requests set item_image_path = null where id = $1", [R])
  ok('depois que o financeiro começa a cotar o solicitante não troca a imagem do item', /já está com o financeiro/.test(late.error?.message ?? ''), late.error?.message)
  ok('...nem envia nem apaga', (await put(req1.id, `${R}/item/tarde.jpg`)).error?.code === '42501' && (await attempt("delete from storage.objects where bucket_id = 'purchase-images' and name = $1", [itemImg])).rowCount === 0)
  ok('...mas continua vendo a imagem do item', (await see('obras_authenticated', req1.id, itemImg)) === 1)

  // enviadas ao admin: a cotação não aceita mais imagem
  await user(fin.id)
  await attempt("insert into purchase_quotes (request_id, supplier, quoted_value) values ($1, 'LOJA B', 90), ($1, 'LOJA C', 95)", [R])
  const sent = await attempt("update purchase_requests set status = 'quotes_sent' where id = $1 returning status", [R])
  ok('(preparo) cotações enviadas ao admin', sent.rows[0]?.status === 'quotes_sent', sent.error?.message)
  ok('depois de enviadas não entra imagem de cotação', (await put(fin.id, `${R}/quotes/${q1}/tarde.jpg`)).error?.code === '42501')
  ok('...nem se apaga', (await attempt("delete from storage.objects where bucket_id = 'purchase-images' and name = $1", [qImg])).rowCount === 0)

  // ---------------------------------------------------------------- limpeza
  // excluir uma cotação apaga a imagem dela (cotação nova, ainda em cotação)
  const R2 = await newReq(req1.id, 'LIMPEZA')
  await user(fin.id)
  const q2 = (await one("insert into purchase_quotes (request_id, supplier, quoted_value) values ($1, 'LOJA X', 10) returning id", [R2])).id
  await put(fin.id, `${R2}/quotes/${q2}/a.jpg`)
  await user(fin.id)
  await attempt('delete from purchase_quotes where id = $1', [q2])
  await internal()
  ok('excluir a cotação apaga a imagem dela', Number((await one("select count(*) n from storage.objects where bucket_id = 'purchase-images' and name like $1", [`${R2}/quotes/${q2}/%`])).n) === 0)
  // excluir a solicitação apaga todas as imagens (item e cotações) e as notas
  await put(req1.id, `${R2}/item/z.jpg`)
  await internal()
  await c.query("insert into storage.objects (bucket_id, name, owner, metadata, data) values ('purchase-invoices', $1, null, '{\"size\":10,\"mimetype\":\"application/pdf\"}'::jsonb, $2)", [`${R}/nf.pdf`, Buffer.from('%PDF')])
  const before = Number((await one("select count(*) n from storage.objects where name like $1 or name like $2", [`${R}/%`, `${R2}/%`])).n)
  await user(adm.id)
  const del1 = await attempt('delete from purchase_requests where id = $1', [R])
  const del2 = await attempt('delete from purchase_requests where id = $1', [R2])
  await internal()
  const after = Number((await one("select count(*) n from storage.objects where name like $1 or name like $2", [`${R}/%`, `${R2}/%`])).n)
  ok('excluir a solicitação apaga as imagens do item, das cotações e as notas', del1.rowCount === 1 && del2.rowCount === 1 && before >= 5 && after === 0, `antes ${before}, depois ${after}`)
} catch (e) {
  console.log('ERRO', e.message)
  failed++
} finally {
  await c.query('ROLLBACK')
  await c.end()
}
console.log(failed ? `\n${failed} FALHA(S)` : '\nTudo certo (transação desfeita)')
process.exit(failed ? 1 : 0)
