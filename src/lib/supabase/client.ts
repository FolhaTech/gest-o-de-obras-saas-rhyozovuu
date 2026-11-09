import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

// O backend (banco PostgreSQL no Azure) é servido pela própria aplicação em /rest/v1, /auth/v1,
// /storage/v1 e /functions/v1 (veja api/gateway.ts e vercel.json), no mesmo protocolo do Supabase.
// Por isso o supabase-js continua sendo o cliente. Em desenvolvimento o vite faz proxy para a API local.
// VITE_API_URL só é necessário se a API estiver em outro domínio.
const API_URL = ((import.meta.env.VITE_API_URL as string | undefined)?.trim() ||
  window.location.origin) as string

// Chave pública "anon". A API não depende dela para autorizar (só o JWT do usuário logado conta),
// mas o supabase-js exige uma chave não vazia.
const ANON_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ||
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim() ||
  'anon'

export const isSupabaseConfigured = Boolean(API_URL && ANON_KEY)

// Import the supabase client like this:
// import { supabase } from "@/lib/supabase/client";
export const supabase = createClient<Database>(API_URL, ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  global: {
    headers: {
      'x-client-info': 'gestao-obras-saas',
    },
  },
})

// ---------------------------------------------------------------------------
// Upload de arquivos grandes: a Vercel limita cada requisição a ~4,5 MB, então arquivos
// maiores que o limite abaixo são enviados em pedaços e remontados no servidor.
// ---------------------------------------------------------------------------
const CHUNK_THRESHOLD = 4_000_000
const CHUNK_SIZE = 3_000_000

async function uploadInChunks(
  bucket: string,
  path: string,
  file: Blob,
  options?: { contentType?: string; cacheControl?: string; upsert?: boolean },
) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) {
    return { data: null, error: new Error('Faça login para enviar arquivos grandes.') }
  }
  const uploadId = crypto.randomUUID()
  const headers = { Authorization: `Bearer ${token}` }
  try {
    for (let i = 0; i * CHUNK_SIZE < file.size; i++) {
      const res = await fetch(`${API_URL}/storage/v1/chunk/${uploadId}/${i}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/octet-stream' },
        body: file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message || 'Falha no envio')
    }
    const done = await fetch(`${API_URL}/storage/v1/chunk/${uploadId}/complete`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bucket,
        path,
        contentType: options?.contentType || file.type || 'application/octet-stream',
        cacheControl: options?.cacheControl,
        upsert: options?.upsert ?? false,
      }),
    })
    const body = await done.json().catch(() => null)
    if (!done.ok) throw new Error(body?.message || 'Falha ao concluir o envio')
    return { data: { id: body.Id, path, fullPath: `${bucket}/${path}` }, error: null }
  } catch (err) {
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) }
  }
}

const originalFrom = supabase.storage.from.bind(supabase.storage)
;(supabase.storage as any).from = (bucket: string) => {
  const api: any = originalFrom(bucket)
  const originalUpload = api.upload.bind(api)
  api.upload = (path: string, body: unknown, options?: any) =>
    body instanceof Blob && body.size > CHUNK_THRESHOLD
      ? uploadInChunks(bucket, path, body, options)
      : originalUpload(path, body, options)
  return api
}
