/**
 * Service Worker para Gestão de Obras PWA
 * Estratégias:
 * - Precache do app shell e assets essenciais
 * - Stale-While-Revalidate / Cache-First SÓ para fontes e assets estáticos do app (arquivos com hash no nome)
 * - Offline fallback gracioso para navegação de páginas (SPA)
 * - A API (/rest/v1, /auth/v1, /storage/v1, /functions/v1, /api) NUNCA passa pelo cache: os dados e os arquivos vêm
 *   sempre da rede. (Antes, a API na mesma origem caía na regra genérica de Stale-While-Revalidate e a tela mostrava
 *   a lista antiga depois de adicionar ou alterar, até recarregar a página.)
 */

const CACHE_VERSION = 'obras-v1.1.0'
const STATIC_CACHE_NAME = `obras-static-${CACHE_VERSION}`
const DYNAMIC_CACHE_NAME = `obras-dynamic-${CACHE_VERSION}`

// Assets essenciais para carregar o shell da aplicação
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/favicon.ico',
  '/pwa-icon.svg',
  '/pwa-192x192.svg',
  '/pwa-512x512.svg',
  '/pwa-maskable-512x512.svg',
  '/apple-touch-icon.svg',
]

// Caminhos da API do próprio app (e do Supabase, se algum dia voltar): sempre direto na rede
const API_PREFIXES = ['/rest/v1', '/auth/v1', '/storage/v1', '/functions/v1', '/realtime/v1', '/api']
const isApiPath = (pathname) => API_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))

// Instalação do Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting()),
  )
})

// Ativação e limpeza de caches antigos (inclui os caches de API e de storage da versão anterior)
self.addEventListener('activate', (event) => {
  const allowedCaches = [STATIC_CACHE_NAME, DYNAMIC_CACHE_NAME]

  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames.map((name) => {
            if (!allowedCaches.includes(name)) {
              return caches.delete(name)
            }
          }),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

// Mensagem para forçar skip waiting se acionado pela UI
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// Interceptação de requisições
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Ignorar métodos não-GET (POST, PUT, DELETE, PATCH devem ir direto para o servidor)
  if (request.method !== 'GET') {
    return
  }

  // Ignorar esquemas não suportados (ex: chrome-extension://, blob:, data:)
  if (!url.protocol.startsWith('http')) {
    return
  }

  // A API e os arquivos do storage nunca são guardados nem servidos do cache: sempre da rede, sempre atualizados
  // (notas fiscais e outros documentos privados também não ficam guardados no navegador por aqui)
  if (isApiPath(url.pathname)) {
    return
  }

  // Quem pede "sem cache" (cache: 'no-store' ou 'reload') é atendido direto pela rede
  if (request.cache === 'no-store' || request.cache === 'reload') {
    return
  }

  // Fontes do Google (Cache-First)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(handleCacheFirst(request, STATIC_CACHE_NAME))
    return
  }

  // Outras origens (APIs externas, imagens de terceiros...): não mexe
  if (url.origin !== self.location.origin) {
    return
  }

  // Navegações do usuário (SPA routes como /obras, /diario-obra, /materiais)
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(request))
    return
  }

  // Assets estáticos do Vite (/assets/..., com hash no nome) e ícones
  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.webmanifest')
  ) {
    event.respondWith(handleStaleWhileRevalidate(request, DYNAMIC_CACHE_NAME))
    return
  }

  // Todo o resto vai direto para a rede
})

/**
 * Estratégia Cache-First simples
 */
async function handleCacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) {
    return cached
  }

  try {
    const networkResponse = await fetch(request)
    if (networkResponse && networkResponse.status === 200) {
      cache.put(request, networkResponse.clone())
    }
    return networkResponse
  } catch (err) {
    return cached || new Response('Offline', { status: 503 })
  }
}

/**
 * Estratégia Stale-While-Revalidate para assets estáticos do app
 */
async function handleStaleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)

  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse && networkResponse.status === 200) {
        cache.put(request, networkResponse.clone())
      }
      return networkResponse
    })
    .catch(() => cached)

  return cached || fetchPromise
}

/**
 * Estratégia para navegações SPA: busca na rede e faz fallback para /index.html em cache se offline
 */
async function handleNavigationRequest(request) {
  try {
    const networkResponse = await fetch(request)
    return networkResponse
  } catch (error) {
    const staticCache = await caches.open(STATIC_CACHE_NAME)
    const cachedIndex = await staticCache.match('/index.html')
    if (cachedIndex) {
      return cachedIndex
    }
    const fallback = await staticCache.match('/')
    if (fallback) {
      return fallback
    }
    return new Response(
      '<h1>Offline</h1><p>Conecte-se à internet para carregar o aplicativo.</p>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    )
  }
}
