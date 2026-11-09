import type { IncomingMessage, ServerResponse } from 'node:http'

export type Req = IncomingMessage
export type Res = ServerResponse

/** Erro com o formato de resposta do PostgREST ({ code, message, details, hint }). */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: string | null = null,
    public hint: string | null = null,
  ) {
    super(message)
  }
  toJSON() {
    return { code: this.code, message: this.message, details: this.details, hint: this.hint }
  }
}

export async function readRawBody(req: Req, limit = 25 * 1024 * 1024): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buf.length
    if (size > limit) throw new ApiError(413, 'PGRST413', 'Corpo da requisição muito grande')
    chunks.push(buf)
  }
  return Buffer.concat(chunks)
}

export async function readJson<T = any>(req: Req): Promise<T> {
  const raw = await readRawBody(req)
  if (raw.length === 0) return undefined as T
  try {
    return JSON.parse(raw.toString('utf8')) as T
  } catch {
    throw new ApiError(400, 'PGRST102', 'Corpo da requisição não é um JSON válido')
  }
}

export function sendJson(
  res: Res,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  const payload = body === undefined ? '' : JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    ...headers,
  })
  res.end(payload)
}

export function sendEmpty(res: Res, status: number, headers: Record<string, string> = {}) {
  res.writeHead(status, { 'Cache-Control': 'no-store', ...headers })
  res.end()
}

/** Envia um Buffer grande em pedaços (a Vercel só libera respostas > 4,5 MB em streaming). */
export function sendBuffer(
  res: Res,
  status: number,
  body: Buffer,
  headers: Record<string, string>,
) {
  res.writeHead(status, { ...headers, 'Content-Length': String(body.length) })
  const CHUNK = 256 * 1024
  let offset = 0
  const writeNext = () => {
    while (offset < body.length) {
      const end = Math.min(offset + CHUNK, body.length)
      const ok = res.write(body.subarray(offset, end))
      offset = end
      if (!ok) {
        res.once('drain', writeNext)
        return
      }
    }
    res.end()
  }
  writeNext()
}

export type Service = 'rest' | 'auth' | 'storage' | 'functions'

export interface Route {
  service: Service | null
  /** Caminho após /<serviço>/v1/, sem barra inicial e ainda codificado. */
  rest: string
  searchParams: URLSearchParams
}

const PATH_RE = /^\/(?:api\/)?(rest|auth|storage|functions)(?:\/v1)?(?:\/(.*))?$/

/**
 * Descobre o serviço e o caminho. Na Vercel as rotas /rest/v1/*, /auth/v1/* etc. são
 * reescritas para /api/gateway?__svc=...&__p=...; no servidor local chegam direto.
 */
export function parseRoute(req: Req): Route {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const sp = new URLSearchParams(url.search)
  const svcParam = sp.get('__svc')
  const pathParam = sp.get('__p')
  sp.delete('__svc')
  sp.delete('__p')
  // A Vercel acrescenta ao destino o parâmetro nomeado do rewrite (:__vp*); ele não é filtro do PostgREST.
  sp.delete('__vp')
  if (svcParam) {
    return {
      service: svcParam as Service,
      rest: (pathParam ?? '').replace(/^\/+/, ''),
      searchParams: sp,
    }
  }
  const m = PATH_RE.exec(url.pathname)
  if (!m) return { service: null, rest: '', searchParams: sp }
  return { service: m[1] as Service, rest: m[2] ?? '', searchParams: sp }
}

export const decodeSeg = (s: string) => {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

export function header(req: Req, name: string): string {
  const v = req.headers[name.toLowerCase()]
  return Array.isArray(v) ? v.join(',') : (v ?? '')
}
