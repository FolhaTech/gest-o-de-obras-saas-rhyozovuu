/**
 * Servidor local da API (pnpm dev:api). Lê .env.local (DATABASE_URL, JWT_SECRET, ...).
 * O vite dev faz proxy de /rest, /auth, /storage e /functions para cá.
 */
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { handle } from './router.js'

if (existsSync('.env.local')) process.loadEnvFile('.env.local')

const port = Number(process.env.API_PORT ?? 3001)
createServer((req, res) => {
  handle(req, res).catch((e) => {
    console.error(e)
    if (!res.headersSent) res.writeHead(500)
    res.end()
  })
}).listen(port, () => console.log(`API local em http://localhost:${port}`))
