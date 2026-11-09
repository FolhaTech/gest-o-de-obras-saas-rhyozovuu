/**
 * Subconjunto do GoTrue (Supabase Auth) usado pelo supabase-js:
 * token (password / refresh_token), signup, user (GET/PUT), logout, health.
 * Usuários ficam em auth.users; senhas em bcrypt (compatível com os hashes do Supabase).
 */
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { ApiError, readJson, sendEmpty, sendJson, type Req, type Res, type Route } from './http.js'
import { withAdmin, type Caller } from './db.js'
import {
  callerFromAuthHeader,
  passwordVersion,
  signAccessToken,
  signRefreshToken,
  verifyJwt,
  type DbUser,
} from './jwt.js'
import { header } from './http.js'

const MIN_PASSWORD = 6

/** Cadastro aberto só com ALLOW_SIGNUP=true. Por padrão fica FECHADO: quem cria usuários é o administrador. */
const signupOpen = () => process.env.ALLOW_SIGNUP === 'true'
// Hash de mentira para igualar o tempo de resposta quando o e-mail não existe.
const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8ZpFq6A6vN1b8nVQ0p0cT4mB1m1m1G'

function authError(res: Res, status: number, errorCode: string, msg: string) {
  sendJson(res, status, { code: status, error_code: errorCode, msg })
}

function userJson(u: DbUser) {
  return {
    id: u.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: u.email,
    email_confirmed_at: u.email_confirmed_at,
    phone: u.phone ?? '',
    confirmed_at: u.email_confirmed_at,
    last_sign_in_at: u.last_sign_in_at,
    app_metadata: u.raw_app_meta_data ?? {},
    user_metadata: u.raw_user_meta_data ?? {},
    identities: [],
    created_at: u.created_at,
    updated_at: u.updated_at,
    is_anonymous: false,
  }
}

async function sessionJson(u: DbUser) {
  const access = await signAccessToken(u, randomUUID())
  return {
    access_token: access.token,
    token_type: 'bearer',
    expires_in: access.expiresIn,
    expires_at: access.expiresAt,
    refresh_token: await signRefreshToken(u),
    user: userJson(u),
  }
}

const normEmail = (e: unknown) => (typeof e === 'string' ? e.trim().toLowerCase() : '')

async function findByEmail(email: string): Promise<DbUser | null> {
  return withAdmin(async (c) => {
    const r = await c.query('select * from auth.users where lower(email) = $1 limit 1', [email])
    return (r.rows[0] as DbUser | undefined) ?? null
  })
}

async function findById(id: string): Promise<DbUser | null> {
  return withAdmin(async (c) => {
    const r = await c.query('select * from auth.users where id = $1 limit 1', [id])
    return (r.rows[0] as DbUser | undefined) ?? null
  })
}

async function requireUser(req: Req): Promise<{ caller: Caller; user: DbUser } | null> {
  const caller = await callerFromAuthHeader(header(req, 'authorization'))
  if (caller.role !== 'authenticated' || !caller.sub) return null
  const user = await findById(caller.sub)
  return user ? { caller, user } : null
}

export async function handleAuth(req: Req, res: Res, _caller: Caller, route: Route) {
  const method = (req.method ?? 'GET').toUpperCase()
  const action = route.rest.split('/').filter(Boolean)[0] ?? ''
  if (method === 'OPTIONS') return sendEmpty(res, 204)

  try {
    switch (action) {
      case 'health': {
        await withAdmin((c) => c.query('select 1'))
        return sendJson(res, 200, { status: 'ok' })
      }

      case 'settings':
        return sendJson(res, 200, {
          external: { email: true },
          disable_signup: !signupOpen(),
          mailer_autoconfirm: true,
        })

      case 'token': {
        if (method !== 'POST') break
        const grant = route.searchParams.get('grant_type')
        const body = (await readJson(req)) ?? {}

        if (grant === 'password') {
          const email = normEmail(body.email)
          const password = typeof body.password === 'string' ? body.password : ''
          if (!email || !password) {
            return authError(res, 400, 'validation_failed', 'Informe e-mail e senha')
          }
          const user = await findByEmail(email)
          const ok = await bcrypt.compare(password, user?.encrypted_password || DUMMY_HASH)
          if (!user || !user.encrypted_password || !ok) {
            return authError(res, 400, 'invalid_credentials', 'Invalid login credentials')
          }
          if (!user.email_confirmed_at) {
            return authError(res, 400, 'email_not_confirmed', 'Email not confirmed')
          }
          await withAdmin((c) =>
            c.query('update auth.users set last_sign_in_at = now() where id = $1', [user.id]),
          )
          user.last_sign_in_at = new Date().toISOString()
          return sendJson(res, 200, await sessionJson(user))
        }

        if (grant === 'refresh_token') {
          const token = typeof body.refresh_token === 'string' ? body.refresh_token : ''
          const payload = token ? await verifyJwt(token) : null
          const user =
            payload && payload.typ === 'refresh' && typeof payload.sub === 'string'
              ? await findById(payload.sub)
              : null
          if (!user || payload?.pv !== passwordVersion(user)) {
            return authError(res, 400, 'refresh_token_not_found', 'Invalid Refresh Token: Refresh Token Not Found')
          }
          return sendJson(res, 200, await sessionJson(user))
        }
        return authError(res, 400, 'unsupported_grant_type', 'grant_type não suportado')
      }

      case 'signup': {
        if (method !== 'POST') break
        if (!signupOpen()) {
          return authError(res, 403, 'signup_disabled', 'Cadastro desabilitado. Peça a um administrador.')
        }
        const body = (await readJson(req)) ?? {}
        const email = normEmail(body.email)
        const password = typeof body.password === 'string' ? body.password : ''
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return authError(res, 422, 'validation_failed', 'Unable to validate email address: invalid format')
        }
        if (password.length < MIN_PASSWORD) {
          return authError(res, 422, 'weak_password', `Password should be at least ${MIN_PASSWORD} characters.`)
        }
        // O papel NUNCA vem do cliente: cadastro aberto entra com o menor privilégio.
        const { role: _ignored, ...meta } =
          body.data && typeof body.data === 'object' ? (body.data as Record<string, unknown>) : {}
        const hash = await bcrypt.hash(password, 10)
        try {
          const user = await withAdmin(async (c) => {
            const r = await c.query(
              `insert into auth.users (email, encrypted_password, email_confirmed_at, raw_user_meta_data)
               values ($1, $2, now(), $3::jsonb) returning *`,
              [email, hash, JSON.stringify({ ...meta, role: 'prestador' })],
            )
            return r.rows[0] as DbUser
          })
          return sendJson(res, 200, await sessionJson(user))
        } catch (e) {
          if ((e as { code?: string }).code === '23505') {
            return authError(res, 422, 'user_already_exists', 'User already registered')
          }
          throw e
        }
      }

      case 'user': {
        const ctx = await requireUser(req)
        if (!ctx) return authError(res, 401, 'bad_jwt', 'invalid JWT: unable to parse or verify signature')
        if (method === 'GET') return sendJson(res, 200, userJson(ctx.user))
        if (method === 'PUT') {
          const body = (await readJson(req)) ?? {}
          if (body.email && normEmail(body.email) !== (ctx.user.email ?? '').toLowerCase()) {
            return authError(res, 400, 'email_change_not_supported', 'Alterar o e-mail não é suportado neste ambiente.')
          }
          let hash: string | null = null
          if (typeof body.password === 'string') {
            if (body.password.length < MIN_PASSWORD) {
              return authError(res, 422, 'weak_password', `Password should be at least ${MIN_PASSWORD} characters.`)
            }
            hash = await bcrypt.hash(body.password, 10)
          }
          const { role: _ignored, ...meta } =
            body.data && typeof body.data === 'object' ? (body.data as Record<string, unknown>) : {}
          const updated = await withAdmin(async (c) => {
            const r = await c.query(
              `update auth.users
                 set encrypted_password = coalesce($2, encrypted_password),
                     raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || $3::jsonb,
                     updated_at = now()
               where id = $1 returning *`,
              [ctx.user.id, hash, JSON.stringify(meta)],
            )
            return r.rows[0] as DbUser
          })
          return sendJson(res, 200, userJson(updated))
        }
        break
      }

      case 'logout':
        return sendEmpty(res, 204)

      case 'recover':
      case 'resend':
      case 'otp':
      case 'verify':
        return authError(
          res,
          501,
          'email_not_configured',
          'O envio de e-mails não está configurado neste ambiente. Peça a um administrador para redefinir a senha.',
        )
    }
    return authError(res, 404, 'not_found', `Rota de autenticação não encontrada: ${action || '/'}`)
  } catch (e) {
    if (e instanceof ApiError) return authError(res, e.status, e.code, e.message)
    console.error('[auth]', (e as Error).message)
    return authError(res, 500, 'unexpected_failure', 'Erro interno do servidor')
  }
}
