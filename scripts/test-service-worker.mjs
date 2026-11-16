// Testa public/sw.js (Service Worker) sem navegador: carrega o arquivo num contexto simulado e dispara os eventos.
// Garante que a API e os arquivos do storage nunca passam pelo cache (a tela não mostra lista velha depois de
// adicionar/alterar) e que os caches antigos são apagados na ativação. Uso: node scripts/test-service-worker.mjs
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

let failed = 0
const ok = (n, c, extra = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${extra ? '  -> ' + extra : ''}`)
  if (!c) failed++
}

const ORIGIN = 'https://app.exemplo.com.br'

function loadSw({ cacheNames = [] } = {}) {
  const handlers = {}
  const deleted = []
  const opened = []
  const claimed = { n: 0 }
  const cacheStore = new Map()
  const fakeCache = {
    addAll: async () => {},
    match: async (req) => cacheStore.get(typeof req === 'string' ? req : req.url),
    put: async (req, res) => cacheStore.set(typeof req === 'string' ? req : req.url, res),
  }
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type, fn) => (handlers[type] = fn),
    skipWaiting: async () => {},
    clients: { claim: async () => void claimed.n++ },
  }
  const ctx = {
    self,
    URL,
    Promise,
    Response: class { constructor(body, init) { this.body = body; this.status = init?.status ?? 200 } clone() { return this } },
    fetch: async () => ({ status: 200, clone() { return this } }),
    caches: {
      open: async (n) => (opened.push(n), fakeCache),
      keys: async () => cacheNames,
      delete: async (n) => (deleted.push(n), true),
    },
  }
  vm.createContext(ctx)
  vm.runInContext(readFileSync('public/sw.js', 'utf8'), ctx)
  return { handlers, deleted, opened, claimed }
}

const { handlers } = loadSw()
const passa = (url, extra = {}) => {
  let respondido = false
  handlers.fetch({ request: { method: 'GET', url, cache: 'default', mode: 'cors', ...extra }, respondWith: () => (respondido = true) })
  return respondido
}

// ---------------------------------------------------------------- a API nunca passa pelo cache
ok('os eventos do Service Worker estão registrados', ['install', 'activate', 'fetch', 'message'].every((e) => typeof handlers[e] === 'function'))
ok('REST (listas e consultas) vai direto para a rede', !passa(`${ORIGIN}/rest/v1/materials?select=*&order=created_at.desc`) && !passa(`${ORIGIN}/rest/v1/work_stages?work_id=eq.123`))
ok('login e sessão vão direto para a rede', !passa(`${ORIGIN}/auth/v1/user`) && !passa(`${ORIGIN}/auth/v1/session`))
ok('arquivos do storage (inclusive notas fiscais privadas) não são guardados', !passa(`${ORIGIN}/storage/v1/object/authenticated/purchase-invoices/x/nf.pdf`) && !passa(`${ORIGIN}/storage/v1/object/public/receipts/a.jpg`))
ok('funções e /api vão direto para a rede', !passa(`${ORIGIN}/functions/v1/analyze-schedule`) && !passa(`${ORIGIN}/api/gateway`))
ok('a API de um host do Supabase também não passa pelo cache', !passa('https://xyz.supabase.co/rest/v1/works?select=*') && !passa('https://xyz.supabase.co/storage/v1/object/public/a/b.png'))
ok('pedido "sem cache" (no-store/reload) vai direto para a rede', !passa(`${ORIGIN}/logo.png`, { cache: 'no-store' }) && !passa(`${ORIGIN}/assets/app.js`, { cache: 'reload' }))
ok('POST, PUT, PATCH e DELETE nunca são interceptados', ['POST', 'PUT', 'PATCH', 'DELETE'].every((m) => !passa(`${ORIGIN}/rest/v1/works`, { method: m })))
ok('esquemas que não são http são ignorados', !passa('chrome-extension://abc/x.js') && !passa('blob:https://app.exemplo.com.br/1') && !passa('data:text/plain,oi'))
ok('outras origens (que não sejam fontes) não são mexidas', !passa('https://api.terceiro.com/dados.json') && !passa('https://cdn.outro.com/imagem.png'))
ok('a página /api-docs ou /apple-touch-icon.svg não é confundida com a API', passa(`${ORIGIN}/apple-touch-icon.svg`) === true)

// ---------------------------------------------------------------- o que ainda é guardado
ok('arquivos do app (com hash) usam o cache', passa(`${ORIGIN}/assets/index-ABC123.js`) && passa(`${ORIGIN}/assets/index-ABC123.css`) && passa(`${ORIGIN}/favicon.svg`))
ok('navegação das páginas passa pelo Service Worker (fallback offline)', passa(`${ORIGIN}/materiais`, { mode: 'navigate' }) && passa(`${ORIGIN}/`, { mode: 'navigate' }))
ok('fontes do Google usam o cache', passa('https://fonts.googleapis.com/css2?family=Inter') && passa('https://fonts.gstatic.com/s/inter/x.woff2'))
ok('qualquer outra coisa da própria origem vai para a rede (sem regra genérica de cache)', !passa(`${ORIGIN}/algum-dado.json`) && !passa(`${ORIGIN}/relatorio`))

// ---------------------------------------------------------------- ativação: apaga os caches da versão anterior
const antigos = ['obras-static-obras-v1.0.0', 'obras-supabase-api-obras-v1.0.0', 'obras-supabase-storage-obras-v1.0.0', 'obras-dynamic-obras-v1.0.0']
const atual = ['obras-static-obras-v1.1.0', 'obras-dynamic-obras-v1.1.0']
const ativ = loadSw({ cacheNames: [...antigos, ...atual, 'cache-de-outro-app'] })
let esperar
await new Promise((res) => {
  ativ.handlers.activate({ waitUntil: (p) => { esperar = p; res() } })
})
await esperar
ok('a ativação apaga os caches antigos (inclusive os de API e de storage com dados velhos)', antigos.every((n) => ativ.deleted.includes(n)) && ativ.deleted.includes('cache-de-outro-app'), ativ.deleted.join(', '))
ok('...e mantém os caches da versão atual', atual.every((n) => !ativ.deleted.includes(n)))
ok('...e assume o controle das páginas abertas', ativ.claimed.n === 1)

// a versão mudou (sem isso o navegador não troca o Service Worker velho)
ok('a versão do cache foi trocada (as páginas abertas pegam o Service Worker novo)', /CACHE_VERSION = 'obras-v1\.[1-9]/.test(readFileSync('public/sw.js', 'utf8')) || /CACHE_VERSION = 'obras-v[2-9]/.test(readFileSync('public/sw.js', 'utf8')))

console.log(failed ? `\n${failed} FALHA(S)` : '\nTudo certo')
process.exit(failed ? 1 : 0)
