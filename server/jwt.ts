import { randomUUID, createHash } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'
import { ANON, type Caller } from './db.js'

const ACCESS_TTL = 60 * 60 // 1 h
const REFRESH_TTL = 60 * 60 * 24 * 30 // 30 dias

function secret(): Uint8Array {
  const s = process.env.JWT_SECRET
  if (!s || s.length < 32) throw new Error('JWT_SECRET ausente ou com menos de 32 caracteres')
  return new TextEncoder().encode(s)
}

export interface DbUser {
  id: string
  email: string | null
  phone: string | null
  encrypted_password: string | null
  email_confirmed_at: string | null
  last_sign_in_at: string | null
  raw_app_meta_data: Record<string, unknown> | null
  raw_user_meta_data: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

/** Fragmento do hash da senha: trocar a senha invalida os refresh tokens antigos. */
export const passwordVersion = (u: Pick<DbUser, 'encrypted_password'>) =>
  createHash('sha256')
    .update(u.encrypted_password ?? '')
    .digest('hex')
    .slice(0, 16)

export async function signAccessToken(u: DbUser, sessionId: string = randomUUID()) {
  const now = Math.floor(Date.now() / 1000)
  const exp = now + ACCESS_TTL
  const token = await new SignJWT({
    email: u.email,
    phone: u.phone ?? '',
    app_metadata: u.raw_app_meta_data ?? {},
    user_metadata: u.raw_user_meta_data ?? {},
    role: 'authenticated',
    aal: 'aal1',
    session_id: sessionId,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setAudience('authenticated')
    .setSubject(u.id)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(secret())
  return { token, expiresAt: exp, expiresIn: ACCESS_TTL }
}

export async function signRefreshToken(u: DbUser) {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ typ: 'refresh', pv: passwordVersion(u) })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(u.id)
    .setIssuedAt(now)
    .setExpirationTime(now + REFRESH_TTL)
    .sign(secret())
}

export async function verifyJwt(token: string) {
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] })
    return payload
  } catch {
    return null
  }
}

/** Bearer válido e de usuário -> authenticated. Qualquer outra coisa (chave anon, ausente, inválida) -> anon. */
export async function callerFromAuthHeader(authorization: string | undefined): Promise<Caller> {
  const m = /^Bearer\s+(.+)$/i.exec(authorization ?? '')
  if (!m) return ANON
  const payload = await verifyJwt(m[1].trim())
  if (
    !payload ||
    payload.role !== 'authenticated' ||
    typeof payload.sub !== 'string' ||
    payload.typ === 'refresh'
  ) {
    return ANON
  }
  return { role: 'authenticated', sub: payload.sub, claims: payload as Record<string, unknown> }
}
