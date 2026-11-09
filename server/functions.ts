/**
 * Portes das Edge Functions do Supabase que o app chama (supabase.functions.invoke):
 * generate-composition, parse-receipt e set-user-password (só admin). Exigem usuário autenticado.
 * Usam a API da OpenAI se OPENAI_API_KEY estiver definida; caso contrário, devolvem o mesmo
 * conteúdo de demonstração das funções originais.
 */
import bcrypt from 'bcryptjs'
import { decodeSeg, readJson, sendEmpty, sendJson, type Req, type Res, type Route } from './http.js'
import { withAdmin, type Caller } from './db.js'

async function openaiJson(model: string, messages: unknown[]): Promise<any> {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model, messages, response_format: { type: 'json_object' } }),
    signal: AbortSignal.timeout(50_000),
  })
  if (!r.ok) throw new Error(`OpenAI respondeu ${r.status}`)
  const j = await r.json()
  return JSON.parse(j.choices?.[0]?.message?.content || '{}')
}

async function generateComposition(body: { serviceName?: string; unit?: string }) {
  if (!process.env.OPENAI_API_KEY) {
    return {
      materials: [
        { name: 'Cimento Portland CP II', unit: 'kg', coefficient: 5.5, waste_percentage: 5 },
        { name: 'Areia Média Lavada', unit: 'm3', coefficient: 0.02, waste_percentage: 10 },
        { name: 'Água', unit: 'l', coefficient: 2.0, waste_percentage: 5 },
      ],
    }
  }
  const result = await openaiJson('gpt-4o-mini', [
    {
      role: 'system',
      content:
        'You are a civil engineering assistant. The user will provide a custom construction service name and its unit. You must estimate a realistic generic material composition for it. Output pure JSON with a "materials" array. Each object in the array must have: "name" (string), "unit" (string, e.g. kg, l, m3, un), "coefficient" (number, quantity per 1 unit of service), "waste_percentage" (number, typical waste like 5, 10).',
    },
    {
      role: 'user',
      content: `Service: "${body.serviceName}". Unit: "${body.unit}". Provide the materials.`,
    },
  ])
  return { materials: result.materials ?? [] }
}

async function parseReceipt(body: { image?: string }) {
  if (!body.image) throw new Error('Imagem é obrigatória')
  if (!process.env.OPENAI_API_KEY) {
    return {
      merchantName: 'BOMPRECO SUP. DO NORDESTE LTDA',
      merchantCnpj: '13.004.510/0233-91',
      date: '2018-01-02',
      totalValue: 10.84,
      items: ['FOLHADO DE BACALHAU', 'COXINHA CHARQUE CATU', 'SKINKA F.CITRICAS'],
    }
  }
  return openaiJson('gpt-4o', [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Extract the following from this receipt: Merchant Name, CNPJ, Date (YYYY-MM-DD), Total Value (number), and a list of item names. Return ONLY a JSON object with keys: merchantName, merchantCnpj, date, totalValue, items (array of strings). Return empty or null for fields you cannot find.',
        },
        { type: 'image_url', image_url: { url: body.image } },
      ],
    },
  ])
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Admin define a senha de outro usuário (a API de e-mail não está ativa, então não há "esqueci a senha"). */
async function setUserPassword(
  caller: Caller,
  body: { userId?: string; password?: string },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { userId, password } = body
  if (typeof userId !== 'string' || !UUID_RE.test(userId)) {
    return { status: 400, body: { error: 'userId inválido' } }
  }
  if (typeof password !== 'string' || password.length < 6 || password.length > 72) {
    return { status: 400, body: { error: 'A senha deve ter de 6 a 72 caracteres' } }
  }
  const hash = await bcrypt.hash(password, 10)
  return withAdmin(async (c) => {
    const admin = await c.query(
      "select 1 from public.profiles where id = $1 and lower(role) = 'admin'",
      [caller.sub],
    )
    if (!admin.rowCount) {
      return { status: 403, body: { error: 'Apenas administradores podem alterar senhas.' } }
    }
    const r = await c.query(
      `update auth.users
          set encrypted_password = $2,
              email_confirmed_at = coalesce(email_confirmed_at, now()),
              updated_at = now()
        where id = $1 returning email`,
      [userId, hash],
    )
    if (!r.rowCount) return { status: 404, body: { error: 'Usuário não encontrado' } }
    return { status: 200, body: { success: true, email: r.rows[0].email } }
  })
}

const ROLES = new Set(['admin', 'gestor', 'prestador'])

/** Admin cria um usuário (o cadastro aberto fica fechado). Entra já confirmado e com o papel escolhido. */
async function createUser(
  caller: Caller,
  body: { email?: string; password?: string; fullName?: string; role?: string },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const { password } = body
  const role = typeof body.role === 'string' ? body.role : 'prestador'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { status: 400, body: { error: 'E-mail inválido' } }
  if (typeof password !== 'string' || password.length < 6 || password.length > 72) {
    return { status: 400, body: { error: 'A senha deve ter de 6 a 72 caracteres' } }
  }
  if (!ROLES.has(role)) return { status: 400, body: { error: 'Papel inválido' } }
  const fullName = typeof body.fullName === 'string' ? body.fullName.trim().slice(0, 120) : ''
  const hash = await bcrypt.hash(password, 10)
  return withAdmin(async (c) => {
    const admin = await c.query("select 1 from public.profiles where id = $1 and lower(role) = 'admin'", [caller.sub])
    if (!admin.rowCount) return { status: 403, body: { error: 'Apenas administradores podem criar usuários.' } }
    try {
      const r = await c.query(
        `insert into auth.users (email, encrypted_password, email_confirmed_at, raw_user_meta_data)
         values ($1, $2, now(), $3::jsonb) returning id, email`,
        [email, hash, JSON.stringify({ role, ...(fullName ? { full_name: fullName } : {}) })],
      )
      return { status: 200, body: { success: true, id: r.rows[0].id, email: r.rows[0].email } }
    } catch (e) {
      if ((e as { code?: string }).code === '23505') return { status: 409, body: { error: 'Já existe um usuário com esse e-mail.' } }
      throw e
    }
  })
}

export async function handleFunctions(req: Req, res: Res, caller: Caller, route: Route) {
  if ((req.method ?? 'GET').toUpperCase() === 'OPTIONS') return sendEmpty(res, 204)
  if (caller.role !== 'authenticated') return sendJson(res, 401, { error: 'Unauthorized' })

  const name = decodeSeg(route.rest.split('/').filter(Boolean)[0] ?? '')
  try {
    const body = (await readJson(req)) ?? {}
    if (name === 'generate-composition') return sendJson(res, 200, await generateComposition(body))
    if (name === 'parse-receipt') return sendJson(res, 200, await parseReceipt(body))
    if (name === 'set-user-password') {
      const out = await setUserPassword(caller, body)
      return sendJson(res, out.status, out.body)
    }
    if (name === 'create-user') {
      const out = await createUser(caller, body)
      return sendJson(res, out.status, out.body)
    }
    return sendJson(res, 404, { error: `Função "${name}" não encontrada` })
  } catch (e) {
    return sendJson(res, 400, { error: (e as Error).message })
  }
}
