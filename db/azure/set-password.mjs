// Define (ou gera) a senha de um usuário em auth.users.
// Uso:  node db/azure/set-password.mjs email@dominio.com [nova-senha]
// Sem a nova senha, gera uma aleatória e a imprime. Lê DATABASE_URL do ambiente ou do .env.local.
import { existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import pg from 'pg'

if (existsSync('.env.local')) process.loadEnvFile('.env.local')
const [email, given] = process.argv.slice(2)
if (!email || !process.env.DATABASE_URL) {
  console.error('Uso: node db/azure/set-password.mjs email@dominio.com [nova-senha]  (com DATABASE_URL definida)')
  process.exit(1)
}
const password = given ?? randomBytes(9).toString('base64url')
if (password.length < 6) {
  console.error('A senha precisa ter pelo menos 6 caracteres.')
  process.exit(1)
}

const u = new URL(process.env.DATABASE_URL)
const client = new pg.Client({
  host: u.hostname,
  port: Number(u.port || 5432),
  user: decodeURIComponent(u.username),
  password: decodeURIComponent(u.password),
  database: u.pathname.slice(1),
  ssl: { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== 'false' },
})
await client.connect()
try {
  const hash = await bcrypt.hash(password, 10)
  const r = await client.query(
    `update auth.users set encrypted_password = $2, email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now()
      where lower(email) = lower($1) returning email`,
    [email, hash],
  )
  if (!r.rowCount) {
    console.error(`Usuário não encontrado: ${email}`)
    process.exitCode = 1
  } else {
    console.log(`Senha de ${r.rows[0].email} definida${given ? '.' : `: ${password}`}`)
  }
} finally {
  await client.end()
}
