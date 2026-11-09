import type { IncomingMessage, ServerResponse } from 'node:http'
import { handle } from '../server/router.js'

// Função serverless única. As rotas /rest/v1/*, /auth/v1/*, /storage/v1/* e /functions/v1/*
// são reescritas para cá pelo vercel.json (compatíveis com o supabase-js).
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await handle(req, res)
}
