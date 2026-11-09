/**
 * Subconjunto da API de Storage do Supabase usado pelo storage-js:
 * upload (POST/PUT), download (público e autenticado), remove, list e upload em pedaços.
 * Os arquivos ficam em storage.objects.data (bytea); o RLS de storage.objects continua valendo.
 */
import {
  ApiError,
  decodeSeg,
  header,
  readJson,
  readRawBody,
  sendBuffer,
  sendEmpty,
  sendJson,
  type Req,
  type Res,
  type Route,
} from './http.js'
import { toApiError, withAdmin, withCaller, type Caller } from './db.js'

const MAX_OBJECT_BYTES = 100 * 1024 * 1024
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SAFE_INLINE = /^(image\/(png|jpe?g|gif|webp|avif|bmp|heic|heif)|video\/|audio\/|application\/pdf)/i

function storageError(res: Res, status: number, message: string) {
  const error = status === 404 ? 'not_found' : status === 409 ? 'Duplicate' : status === 403 ? 'Unauthorized' : 'Error'
  sendJson(res, status, { statusCode: String(status), error, message })
}

function mapDbError(res: Res, e: unknown, caller: Caller) {
  const code = (e as { code?: string }).code
  if (code === '23505') return storageError(res, 409, 'The resource already exists')
  if (code === '23503') return storageError(res, 404, 'Bucket not found')
  if (code === '42501') return storageError(res, caller.role === 'anon' ? 401 : 403, 'new row violates row-level security policy')
  const err = toApiError(e, caller)
  return storageError(res, err.status, err.message)
}

async function parseUpload(req: Req): Promise<{ data: Buffer; contentType: string; cacheControl: string }> {
  const ct = header(req, 'content-type')
  const raw = await readRawBody(req, MAX_OBJECT_BYTES)
  if (ct.startsWith('multipart/form-data')) {
    const form = await new Request('http://localhost/', {
      method: 'POST',
      headers: { 'content-type': ct },
      body: raw as unknown as BodyInit,
    }).formData()
    let file: File | null = null
    let cacheControl = '3600'
    for (const [k, v] of form.entries()) {
      if (typeof v === 'string') {
        if (k === 'cacheControl') cacheControl = v
      } else if (!file) {
        file = v
      }
    }
    if (!file) throw new ApiError(400, 'PGRST102', 'Nenhum arquivo enviado')
    return {
      data: Buffer.from(await file.arrayBuffer()),
      contentType: file.type || 'application/octet-stream',
      cacheControl: `max-age=${cacheControl}`,
    }
  }
  const cc = /max-age=\d+/.exec(header(req, 'cache-control'))?.[0] ?? 'max-age=3600'
  return { data: raw, contentType: ct || 'application/octet-stream', cacheControl: cc }
}

async function insertObject(
  caller: Caller,
  bucket: string,
  name: string,
  data: Buffer,
  contentType: string,
  cacheControl: string,
  upsert: boolean,
): Promise<string> {
  const metadata = { size: data.length, mimetype: contentType, cacheControl }
  return withCaller(caller, async (c) => {
    const r = await c.query(
      `insert into storage.objects (bucket_id, name, owner, metadata, data)
       values ($1, $2, $3, $4::jsonb, $5)
       ${upsert ? 'on conflict (bucket_id, name) do update set data = excluded.data, metadata = excluded.metadata, updated_at = now()' : ''}
       returning id`,
      [bucket, name, caller.sub, JSON.stringify(metadata), data],
    )
    return r.rows[0].id as string
  })
}

function parseRange(h: string, size: number): [number, number] | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(h.trim())
  if (!m || (m[1] === '' && m[2] === '')) return null
  let start: number
  let end: number
  if (m[1] === '') {
    const n = Number(m[2])
    start = Math.max(size - n, 0)
    end = size - 1
  } else {
    start = Number(m[1])
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1)
  }
  return start <= end && start < size ? [start, end] : null
}

async function download(req: Req, res: Res, caller: Caller, bucket: string, name: string, publicOnly: boolean) {
  const row = await withCaller(caller, async (c) => {
    const r = await c.query(
      `select o.data, o.metadata, o.updated_at, b.public as bucket_public
         from storage.objects o join storage.buckets b on b.id = o.bucket_id
        where o.bucket_id = $1 and o.name = $2`,
      [bucket, name],
    )
    return r.rows[0] as
      | { data: Buffer; metadata: Record<string, string> | null; updated_at: Date; bucket_public: boolean }
      | undefined
  })
  if (!row || (publicOnly && !row.bucket_public)) return storageError(res, 404, 'Object not found')

  const mime = String(row.metadata?.mimetype ?? 'application/octet-stream')
  const inline = SAFE_INLINE.test(mime)
  // Os arquivos saem da mesma origem do app: tipos executáveis (html, svg, js...) viram download.
  const headers: Record<string, string> = {
    'Content-Type': inline ? mime : 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': row.bucket_public ? `public, ${row.metadata?.cacheControl ?? 'max-age=3600'}` : 'private, no-cache',
    'Accept-Ranges': 'bytes',
    ETag: `"${row.updated_at.getTime().toString(36)}-${row.data.length}"`,
  }
  if (!inline) headers['Content-Disposition'] = `attachment; filename="${name.split('/').pop()?.replace(/[^\w.-]/g, '_')}"`

  if (header(req, 'if-none-match') === headers.ETag) return sendEmpty(res, 304, headers)
  const size = row.data.length
  const range = parseRange(header(req, 'range'), size)
  if (range) {
    const [s, e] = range
    return sendBuffer(res, 206, row.data.subarray(s, e + 1), {
      ...headers,
      'Content-Range': `bytes ${s}-${e}/${size}`,
    })
  }
  if ((req.method ?? 'GET') === 'HEAD') return sendEmpty(res, 200, { ...headers, 'Content-Length': String(size) })
  return sendBuffer(res, 200, row.data, headers)
}

export async function handleStorage(req: Req, res: Res, caller: Caller, route: Route) {
  const method = (req.method ?? 'GET').toUpperCase()
  const segs = route.rest.split('/').filter(Boolean).map(decodeSeg)
  if (method === 'OPTIONS') return sendEmpty(res, 204)

  try {
    // ---- upload em pedaços (corpo de cada requisição < 4,5 MB na Vercel) ----
    if (segs[0] === 'chunk') {
      if (caller.role !== 'authenticated') return storageError(res, 401, 'Autenticação necessária')
      const uploadId = segs[1]
      if (!uploadId || !UUID_RE.test(uploadId) || method !== 'POST') return storageError(res, 400, 'Requisição inválida')

      if (segs[2] === 'complete') {
        const body = (await readJson(req)) ?? {}
        const bucket = String(body.bucket ?? '')
        const name = String(body.path ?? '')
        if (!bucket || !name) return storageError(res, 400, 'bucket e path são obrigatórios')
        const data = await withAdmin(async (c) => {
          await c.query(`delete from storage.upload_chunks where created_at < now() - interval '1 day'`)
          const sum = await c.query(
            'select count(*)::int as n, coalesce(sum(length(data)), 0)::bigint as bytes, max(idx) as last from storage.upload_chunks where upload_id = $1',
            [uploadId],
          )
          const { n, bytes, last } = sum.rows[0]
          if (!n || last !== n - 1) throw new ApiError(400, 'PGRST102', 'Pedaços do upload incompletos')
          if (Number(bytes) > MAX_OBJECT_BYTES) throw new ApiError(413, 'PGRST413', 'Arquivo muito grande')
          const rows = await c.query('select data from storage.upload_chunks where upload_id = $1 order by idx', [uploadId])
          return Buffer.concat(rows.rows.map((r) => r.data as Buffer))
        })
        const id = await insertObject(
          caller,
          bucket,
          name,
          data,
          String(body.contentType || 'application/octet-stream'),
          `max-age=${Number(body.cacheControl) || 3600}`,
          Boolean(body.upsert),
        )
        await withAdmin((c) => c.query('delete from storage.upload_chunks where upload_id = $1', [uploadId]))
        return sendJson(res, 200, { Id: id, Key: `${bucket}/${name}` })
      }

      const idx = Number(segs[2])
      if (!Number.isInteger(idx) || idx < 0 || idx > 60) return storageError(res, 400, 'Índice de pedaço inválido')
      const data = await readRawBody(req, 4 * 1024 * 1024)
      await withAdmin((c) =>
        c.query(
          `insert into storage.upload_chunks (upload_id, idx, data) values ($1, $2, $3)
           on conflict (upload_id, idx) do update set data = excluded.data`,
          [uploadId, idx, data],
        ),
      )
      return sendJson(res, 200, { ok: true })
    }

    if (segs[0] === 'bucket' && method === 'GET') {
      const rows = await withCaller(caller, (c) => c.query('select id, name, public, created_at, updated_at from storage.buckets order by id'))
      return sendJson(res, 200, rows.rows)
    }

    if (segs[0] !== 'object') return storageError(res, 404, 'Rota de storage não encontrada')

    // ---- download público ----
    if (segs[1] === 'public' && (method === 'GET' || method === 'HEAD')) {
      const bucket = segs[2]
      const name = segs.slice(3).join('/')
      if (!bucket || !name) return storageError(res, 400, 'Caminho inválido')
      return await download(req, res, caller, bucket, name, true)
    }
    if (segs[1] === 'authenticated' && (method === 'GET' || method === 'HEAD')) {
      return await download(req, res, caller, segs[2], segs.slice(3).join('/'), false)
    }

    // ---- listagem ----
    if (segs[1] === 'list' && method === 'POST') {
      const bucket = segs[2]
      const body = (await readJson(req)) ?? {}
      const prefix = String(body.prefix ?? '').replace(/^\/+|\/+$/g, '')
      const limit = Math.min(Number(body.limit) || 100, 1000)
      const offset = Number(body.offset) || 0
      const like = (prefix ? `${prefix}/` : '').replace(/[\\%_]/g, '\\$&') + '%'
      const rows = await withCaller(caller, (c) =>
        c.query(
          `select id, name, created_at, updated_at, last_accessed_at, metadata
             from storage.objects where bucket_id = $1 and name like $2 order by name`,
          [bucket, like],
        ),
      )
      const seen = new Set<string>()
      const items: unknown[] = []
      for (const r of rows.rows) {
        const rel = prefix ? r.name.slice(prefix.length + 1) : r.name
        const slash = rel.indexOf('/')
        if (slash === -1) items.push({ ...r, name: rel })
        else if (!seen.has(rel.slice(0, slash))) {
          seen.add(rel.slice(0, slash))
          items.push({ id: null, name: rel.slice(0, slash), updated_at: null, created_at: null, last_accessed_at: null, metadata: null })
        }
      }
      return sendJson(res, 200, items.slice(offset, offset + limit))
    }

    // ---- /object/{bucket}[/{path}] ----
    const bucket = segs[1]
    const name = segs.slice(2).join('/')
    if (!bucket) return storageError(res, 400, 'Bucket é obrigatório')

    if ((method === 'POST' || method === 'PUT') && name) {
      const up = await parseUpload(req)
      const upsert = method === 'PUT' || header(req, 'x-upsert') === 'true'
      try {
        const id = await insertObject(caller, bucket, name, up.data, up.contentType, up.cacheControl, upsert)
        return sendJson(res, 200, { Id: id, Key: `${bucket}/${name}` })
      } catch (e) {
        return mapDbError(res, e, caller)
      }
    }

    if ((method === 'GET' || method === 'HEAD') && name) {
      return await download(req, res, caller, bucket, name, false)
    }

    if (method === 'DELETE') {
      const names: string[] = name ? [name] : ((await readJson(req))?.prefixes ?? [])
      if (!Array.isArray(names) || !names.every((n) => typeof n === 'string')) {
        return storageError(res, 400, 'prefixes inválido')
      }
      const rows = await withCaller(caller, (c) =>
        c.query('delete from storage.objects where bucket_id = $1 and name = any($2) returning id, name, bucket_id', [bucket, names]),
      )
      return name
        ? sendJson(res, 200, { message: 'Successfully deleted' })
        : sendJson(res, 200, rows.rows)
    }

    return storageError(res, 404, 'Rota de storage não encontrada')
  } catch (e) {
    if (res.headersSent) return res.end()
    return mapDbError(res, e, caller)
  }
}
