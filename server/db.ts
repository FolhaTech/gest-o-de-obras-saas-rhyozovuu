import pg from 'pg'
import { ApiError } from './http.js'

export type CallerRole = 'anon' | 'authenticated'

export interface Caller {
  role: CallerRole
  sub: string | null
  claims: Record<string, unknown>
}

export const ANON: Caller = { role: 'anon', sub: null, claims: { role: 'anon' } }

let pool: pg.Pool | null = null

export function getPool(): pg.Pool {
  if (pool) return pool
  const raw = process.env.DATABASE_URL
  if (!raw) throw new ApiError(500, 'CONFIG', 'DATABASE_URL não configurada')
  const u = new URL(raw)
  pool = new pg.Pool({
    host: u.hostname,
    port: Number(u.port || 5432),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.replace(/^\//, '')) || 'postgres',
    // Padrão: valida o certificado. Defina PGSSL_REJECT_UNAUTHORIZED=false se o servidor usar CA própria.
    ssl: { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== 'false' },
    max: Number(process.env.PG_POOL_MAX ?? 3),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 25_000,
  })
  pool.on('error', (e) => console.error('[pg pool]', e.message))
  return pool
}

/**
 * Executa fn numa transação com o papel do chamador (RLS aplicado) e as claims do JWT
 * disponíveis para auth.uid() — mesmo modelo do PostgREST.
 */
export async function withCaller<T>(
  caller: Caller,
  fn: (c: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `SET LOCAL ROLE ${caller.role === 'authenticated' ? 'obras_authenticated' : 'obras_anon'}`,
    )
    await client.query(
      `select set_config('request.jwt.claims', $1, true),
              set_config('request.jwt.claim.sub', $2, true),
              set_config('request.jwt.claim.role', $3, true),
              set_config('request.jwt.claim.email', $4, true)`,
      [JSON.stringify(caller.claims), caller.sub ?? '', caller.role, String(caller.claims.email ?? '')],
    )
    const out = await fn(client)
    await client.query('COMMIT')
    return out
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      /* conexão já inválida */
    }
    throw e
  } finally {
    client.release()
  }
}

/** Conexão do dono do banco (sem RLS). Só para rotinas internas de auth. */
export async function withAdmin<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect()
  try {
    return await fn(client)
  } finally {
    client.release()
  }
}

export const ident = (s: string) => '"' + s.replace(/"/g, '""') + '"'

/** Converte erros do Postgres para o formato/status do PostgREST. */
export function toApiError(e: unknown, caller: Caller): ApiError {
  if (e instanceof ApiError) return e
  const err = e as { code?: string; message?: string; detail?: string; hint?: string }
  const code = err.code ?? 'XX000'
  let status = 500
  if (code === '23505' || code === '23503') status = 409
  else if (code === '42501') status = caller.role === 'anon' ? 401 : 403
  else if (code === '42P01') status = 404
  else if (/^(22|23|42|P0)/.test(code)) status = 400
  const message = status === 500 ? 'Erro interno do servidor' : (err.message ?? 'Erro')
  if (status === 500) console.error('[db]', code, err.message)
  return new ApiError(status, code, message, err.detail ?? null, err.hint ?? null)
}
