// Gera a chave "anon" (JWT público, role=anon) assinada com o JWT_SECRET do .env.local.
// Uso: node server/gen-anon-key.mjs   -> imprime a chave para VITE_SUPABASE_ANON_KEY.
// A API trata qualquer Bearer inválido como anon, então a chave só precisa existir e parecer um JWT.
import { readFileSync } from 'node:fs'
import { SignJWT } from 'jose'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)
const now = Math.floor(Date.now() / 1000)
const jwt = await new SignJWT({ role: 'anon' })
  .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
  .setIssuedAt(now)
  .setExpirationTime(now + 10 * 365 * 86400)
  .sign(new TextEncoder().encode(env.JWT_SECRET))
console.log(jwt)
