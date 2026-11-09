import { ApiError, header, parseRoute, sendJson, type Req, type Res } from './http.js'
import { callerFromAuthHeader } from './jwt.js'
import { handleRest } from './rest.js'
import { handleAuth } from './auth.js'
import { handleStorage } from './storage.js'
import { handleFunctions } from './functions.js'

export async function handle(req: Req, res: Res): Promise<unknown> {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  try {
    const route = parseRoute(req)
    const caller = await callerFromAuthHeader(header(req, 'authorization'))
    switch (route.service) {
      case 'rest':
        return await handleRest(req, res, caller, route)
      case 'auth':
        return await handleAuth(req, res, caller, route)
      case 'storage':
        return await handleStorage(req, res, caller, route)
      case 'functions':
        return await handleFunctions(req, res, caller, route)
      default:
        return sendJson(res, 404, { code: 'NOT_FOUND', message: 'Rota não encontrada', details: null, hint: null })
    }
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError(500, 'XX000', 'Erro interno do servidor')
    if (!(e instanceof ApiError)) console.error('[gateway]', (e as Error)?.message)
    if (res.headersSent) return void res.end()
    sendJson(res, err.status, err.toJSON())
  }
}
