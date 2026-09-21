/**
 * Service Worker para Gestão de Obras PWA
 * Estratégias:
 * - Precache do app shell e assets essenciais
 * - Stale-While-Revalidate / Cache-First para fontes e assets estáticos
 * - Network-First com fallback para cache em requisições de API do Supabase (GET /rest/v1/)
 * - Cache-First para arquivos de mídia/storage do Supabase (/storage/v1/)
 * - Offline fallback gracioso para navegação de páginas (SPA)
 */

const CACHE_VERSION = 'obras-v1.0.0'
const STATIC_CACHE_NAME = `obras-static-${CACHE_VERSION}`
const SUPABASE_API_CACHE = `obras-supabase-api-${CACHE_VERSION}`
const SUPABASE_STORAGE_CACHE = `obras-supabase-storage-${CACHE_VERSION}`
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

// Instalação do Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting()),
  )
})

// Ativação e limpeza de caches antigos
self.addEventListener('activate', (event) => {
  const allowedCaches = [
    STATIC_CACHE_NAME,
    SUPABASE_API_CACHE,
    SUPABASE_STORAGE_CACHE,
    DYNAMIC_CACHE_NAME,
  ]

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

  // 1. Requisições para Supabase REST API (Network-First)
  // Permite ler dados atualizados em tempo real, mas se a rede falhar/oscilar, serve a última resposta válida em cache
  if (url.hostname.includes('supabase.co') && url.pathname.startsWith('/rest/v1')) {
    event.respondWith(handleSupabaseApiRequest(request))
    return
  }

  // 2. Requisições para Supabase Storage (Cache-First)
  // Imagens de recibos, fotos de diário de obra, etc.
  if (url.hostname.includes('supabase.co') && url.pathname.startsWith('/storage/v1')) {
    event.respondWith(handleSupabaseStorageRequest(request))
    return
  }

  // 3. Fontes do Google (Cache-First)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(handleCacheFirst(request, STATIC_CACHE_NAME))
    return
  }

  // 4. Navegações do usuário (SPA routes como /obras, /diario-obra, /materiais)
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(request))
    return
  }

  // 5. Assets estáticos do Vite (/assets/..., .js, .css, .svg, .png, etc.)
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/assets/') ||
      url.pathname.endsWith('.js') ||
      url.pathname.endsWith('.css') ||
      url.pathname.endsWith('.svg') ||
      url.pathname.endsWith('.png') ||
      url.pathname.endsWith('.ico') ||
      url.pathname.endsWith('.webmanifest'))
  ) {
    event.respondWith(handleStaleWhileRevalidate(request, DYNAMIC_CACHE_NAME))
    return
  }

  // 6. Demais requisições com StaleWhileRevalidate
  event.respondWith(handleStaleWhileRevalidate(request, DYNAMIC_CACHE_NAME))
})

/**
 * Estratégia Network-First para requisições da API Supabase
 */
async function handleSupabaseApiRequest(request) {
  const cache = await caches.open(SUPABASE_API_CACHE)
  try {
    // Tenta rede com timeout de 4 segundos
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 4000)

    const networkResponse = await fetch(request.clone(), {
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (networkResponse && networkResponse.status === 200) {
      cache.put(request, networkResponse.clone())
    }
    return networkResponse
  } catch (error) {
    // Se a rede falhar ou der timeout, tenta o cache
    const cachedResponse = await cache.match(request)
    if (cachedResponse) {
      return cachedResponse
    }
    // Se não houver cache nem rede, retorna resposta padrão com status 503
    return new Response(
      JSON.stringify({
        error: 'offline',
        message: 'Você está offline e este dado ainda não foi sincronizado.',
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }
}

/**
 * Estratégia Cache-First para mídias do Storage Supabase
 */
async function handleSupabaseStorageRequest(request) {
  const cache = await caches.open(SUPABASE_STORAGE_CACHE)
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
    return cached || new Response('Asset indisponível offline', { status: 503 })
  }
}

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
 * Estratégia Stale-While-Revalidate para assets
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
