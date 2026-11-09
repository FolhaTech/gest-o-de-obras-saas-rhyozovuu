/**
 * Subconjunto do protocolo PostgREST suficiente para o supabase-js (postgrest-js):
 * select (com embeds, alias, !inner), filtros (eq, neq, gt, gte, lt, lte, like, ilike, is, in,
 * cs, cd, ov, not.*, and/or), order, limit, offset, count=exact, insert/upsert/update/delete,
 * Prefer: return=representation e Accept: application/vnd.pgrst.object+json (single).
 * O acesso é sempre feito com o papel do chamador, então o RLS do schema continua valendo.
 */
import {
  ApiError,
  decodeSeg,
  header,
  readRawBody,
  sendEmpty,
  sendJson,
  type Req,
  type Res,
  type Route,
} from './http.js'
import { ident, toApiError, withCaller, type Caller } from './db.js'
import { getCatalog, type Catalog, type ForeignKey, type TableInfo } from './catalog.js'

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns', 'apikey'])

class Params {
  values: unknown[] = []
  add(v: unknown): string {
    this.values.push(v)
    return `$${this.values.length}`
  }
}

/** Divide por vírgulas no nível raiz, respeitando (), {} e aspas. */
function splitTop(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  let inQ = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === '\\' && inQ) {
      cur += ch + (s[++i] ?? '')
      continue
    }
    if (ch === '"') inQ = !inQ
    else if (!inQ) {
      if (ch === '(' || ch === '{') depth++
      else if (ch === ')' || ch === '}') depth--
      else if (ch === ',' && depth === 0) {
        out.push(cur)
        cur = ''
        continue
      }
    }
    cur += ch
  }
  if (cur !== '') out.push(cur)
  return out
}

// ---------- select ----------

interface SelNode {
  name: string
  alias?: string
  hints: string[]
  inner: boolean
  children?: SelNode[]
  cast?: string
}

function parseSelect(s: string): SelNode[] {
  return splitTop(s)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      let head = part
      let children: SelNode[] | undefined
      const p = part.indexOf('(')
      if (p !== -1 && part.endsWith(')')) {
        head = part.slice(0, p)
        children = parseSelect(part.slice(p + 1, -1))
      }
      let cast: string | undefined
      const ci = head.indexOf('::')
      if (ci !== -1) {
        cast = head.slice(ci + 2).trim()
        head = head.slice(0, ci)
        if (!/^[a-z_][a-z0-9_ ]*(\(\d+(,\d+)?\))?$/i.test(cast)) {
          throw new ApiError(400, 'PGRST100', `tipo inválido em cast: ${cast}`)
        }
      }
      let alias: string | undefined
      const ai = head.indexOf(':')
      if (ai !== -1) {
        alias = head.slice(0, ai).trim()
        head = head.slice(ai + 1)
      }
      const [name, ...hints] = head.split('!').map((h) => h.trim())
      return {
        name,
        alias,
        hints: hints.filter((h) => h !== 'inner' && h !== 'left'),
        inner: hints.includes('inner'),
        children,
        cast,
      }
    })
}

interface Rel {
  kind: 'm2o' | 'o2m'
  fk: ForeignKey
  other: string
}

function findRel(cat: Catalog, from: string, name: string, hints: string[]): Rel {
  const cands: Rel[] = []
  for (const fk of cat.fks) {
    if (fk.child === from && fk.parentSchema === 'public' && fk.childCols.length === 1 && fk.childCols[0] === name) {
      cands.push({ kind: 'm2o', fk, other: fk.parent })
    }
  }
  if (cands.length === 0 && cat.tables.has(name)) {
    for (const fk of cat.fks) {
      if (fk.parentSchema !== 'public') continue
      if (fk.child === from && fk.parent === name) cands.push({ kind: 'm2o', fk, other: name })
      if (fk.child === name && fk.parent === from) cands.push({ kind: 'o2m', fk, other: name })
    }
  }
  let list = cands
  if (hints.length) {
    const f = cands.filter((c) => hints.some((h) => c.fk.name === h || c.fk.childCols.includes(h)))
    if (f.length) list = f
  }
  if (list.length === 0) {
    throw new ApiError(
      400,
      'PGRST200',
      `Could not find a relationship between '${from}' and '${name}' in the schema cache`,
    )
  }
  return list[0]
}

function buildSelect(
  cat: Catalog,
  table: TableInfo,
  tAlias: string,
  nodes: SelNode[],
  gen: { n: number },
  topConds: string[] | null,
): string {
  const list = nodes.length ? nodes : [{ name: '*', hints: [], inner: false } as SelNode]
  const items: string[] = []
  for (const n of list) {
    if (!n.children) {
      if (n.name === '*') {
        items.push(`${tAlias}.*`)
        continue
      }
      if (!table.columns.has(n.name)) {
        throw new ApiError(400, '42703', `column ${table.name}.${n.name} does not exist`)
      }
      const expr = `${tAlias}.${ident(n.name)}${n.cast ? `::${n.cast}` : ''}`
      items.push(`${expr} AS ${ident(n.alias ?? n.name)}`)
      continue
    }
    const rel = findRel(cat, table.name, n.name, n.hints)
    const target = cat.tables.get(rel.other)
    if (!target) throw new ApiError(400, 'PGRST200', `Tabela relacionada '${rel.other}' não encontrada`)
    const e = `e${++gen.n}`
    const childList = buildSelect(cat, target, e, n.children, gen, null)
    const key = ident(n.alias ?? n.name)
    const tbl = `public.${ident(rel.other)}`
    if (rel.kind === 'm2o') {
      const cond = rel.fk.childCols
        .map((c, i) => `${e}.${ident(rel.fk.parentCols[i])} = ${tAlias}.${ident(c)}`)
        .join(' AND ')
      items.push(
        `(SELECT row_to_json(x${e}) FROM (SELECT ${childList} FROM ${tbl} ${e} WHERE ${cond} LIMIT 1) x${e}) AS ${key}`,
      )
      if (n.inner && topConds) {
        topConds.push(
          `EXISTS (SELECT 1 FROM ${tbl} ${e}i WHERE ${rel.fk.childCols
            .map((c, i) => `${e}i.${ident(rel.fk.parentCols[i])} = ${tAlias}.${ident(c)}`)
            .join(' AND ')})`,
        )
      }
    } else {
      const cond = rel.fk.childCols
        .map((c, i) => `${e}.${ident(c)} = ${tAlias}.${ident(rel.fk.parentCols[i])}`)
        .join(' AND ')
      items.push(
        `COALESCE((SELECT json_agg(x${e}) FROM (SELECT ${childList} FROM ${tbl} ${e} WHERE ${cond}) x${e}), '[]'::json) AS ${key}`,
      )
      if (n.inner && topConds) {
        topConds.push(
          `EXISTS (SELECT 1 FROM ${tbl} ${e}i WHERE ${rel.fk.childCols
            .map((c, i) => `${e}i.${ident(c)} = ${tAlias}.${ident(rel.fk.parentCols[i])}`)
            .join(' AND ')})`,
        )
      }
    }
  }
  return items.join(', ')
}

// ---------- filtros ----------

function colExpr(table: TableInfo, alias: string, col: string): string {
  if (!table.columns.has(col)) {
    throw new ApiError(400, '42703', `column ${table.name}.${col} does not exist`)
  }
  return `${alias}.${ident(col)}`
}

function parseList(val: string): string[] {
  const inner = val.trim().replace(/^\((.*)\)$/s, '$1')
  return splitTop(inner).map((s) => {
    const t = s.trim()
    return t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1).replace(/\\(.)/g, '$1') : t
  })
}

function buildCond(p: Params, col: string, expr: string): string {
  let neg = false
  let rest = expr
  if (rest.startsWith('not.')) {
    neg = true
    rest = rest.slice(4)
  }
  const i = rest.indexOf('.')
  if (i === -1) throw new ApiError(400, 'PGRST100', `failed to parse filter (${expr})`)
  const op = rest.slice(0, i)
  const val = rest.slice(i + 1)
  let sql: string
  switch (op) {
    case 'eq':
      sql = `${col} = ${p.add(val)}`
      break
    case 'neq':
      sql = `${col} <> ${p.add(val)}`
      break
    case 'gt':
      sql = `${col} > ${p.add(val)}`
      break
    case 'gte':
      sql = `${col} >= ${p.add(val)}`
      break
    case 'lt':
      sql = `${col} < ${p.add(val)}`
      break
    case 'lte':
      sql = `${col} <= ${p.add(val)}`
      break
    case 'like':
      sql = `${col} LIKE ${p.add(val.replace(/\*/g, '%'))}`
      break
    case 'ilike':
      sql = `${col} ILIKE ${p.add(val.replace(/\*/g, '%'))}`
      break
    case 'is': {
      const v = val.toLowerCase()
      if (!['null', 'true', 'false', 'unknown'].includes(v)) {
        throw new ApiError(400, 'PGRST100', `valor inválido para is.: ${val}`)
      }
      sql = `${col} IS ${v === 'null' ? 'NULL' : v.toUpperCase()}`
      break
    }
    case 'in':
      sql = `${col} = ANY(${p.add(parseList(val))})`
      break
    case 'cs':
      sql = `${col} @> ${p.add(val)}`
      break
    case 'cd':
      sql = `${col} <@ ${p.add(val)}`
      break
    case 'ov':
      sql = `${col} && ${p.add(val)}`
      break
    default:
      throw new ApiError(400, 'PGRST100', `operador desconhecido: ${op}`)
  }
  return neg ? `NOT (${sql})` : sql
}

function parseLogic(
  p: Params,
  table: TableInfo,
  alias: string,
  expr: string,
  joiner: 'AND' | 'OR',
): string {
  const inner = expr.trim().replace(/^\((.*)\)$/s, '$1')
  const parts = splitTop(inner).map((raw) => {
    let item = raw.trim()
    let neg = false
    if (/^not\.(and|or)\(/.test(item)) {
      neg = true
      item = item.slice(4)
    }
    const m = /^(and|or)\((.*)\)$/s.exec(item)
    let sql: string
    if (m) {
      sql = parseLogic(p, table, alias, `(${m[2]})`, m[1] === 'and' ? 'AND' : 'OR')
    } else {
      const di = item.indexOf('.')
      if (di === -1) throw new ApiError(400, 'PGRST100', `failed to parse logic tree (${raw})`)
      sql = buildCond(p, colExpr(table, alias, item.slice(0, di)), item.slice(di + 1))
    }
    return neg ? `NOT (${sql})` : sql
  })
  return `(${parts.join(` ${joiner} `)})`
}

function buildWhere(p: Params, table: TableInfo, alias: string, sp: URLSearchParams): string[] {
  const conds: string[] = []
  for (const [key, value] of sp.entries()) {
    if (RESERVED.has(key)) continue
    if (key === 'or' || key === 'and') {
      conds.push(parseLogic(p, table, alias, value, key === 'and' ? 'AND' : 'OR'))
    } else if (key === 'not.or' || key === 'not.and') {
      conds.push(`NOT ${parseLogic(p, table, alias, value, key === 'not.and' ? 'AND' : 'OR')}`)
    } else {
      conds.push(buildCond(p, colExpr(table, alias, key), value))
    }
  }
  return conds
}

function buildOrder(table: TableInfo, alias: string, s: string): string {
  return s
    .split(',')
    .filter(Boolean)
    .map((part) => {
      const [col, ...mods] = part.trim().split('.')
      const expr = colExpr(table, alias, col)
      const dir = mods.includes('desc') ? 'DESC' : 'ASC'
      const nulls = mods.includes('nullsfirst')
        ? ' NULLS FIRST'
        : mods.includes('nullslast')
          ? ' NULLS LAST'
          : ''
      return `${expr} ${dir}${nulls}`
    })
    .join(', ')
}

function intParam(sp: URLSearchParams, name: string): number | null {
  const v = sp.get(name)
  if (v === null || v === '') return null
  const n = Number(v)
  if (!Number.isInteger(n) || n < 0) throw new ApiError(400, 'PGRST103', `${name} inválido`)
  return n
}

function parsePrefer(h: string) {
  const out: Record<string, string> = {}
  for (const tok of h.split(',')) {
    const [k, v] = tok.trim().split('=')
    if (k) out[k] = v ?? ''
  }
  return out
}

function checkColumns(table: TableInfo, cols: string[]) {
  for (const c of cols) {
    if (!table.columns.has(c)) {
      throw new ApiError(
        400,
        'PGRST204',
        `Could not find the '${c}' column of '${table.name}' in the schema cache`,
      )
    }
  }
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

// ---------- handler ----------

const RETRY = Symbol('retry')

/**
 * Executa a requisição; se falhar por coluna/tabela/relação desconhecida (o cache do catálogo pode estar
 * defasado após uma migração), recarrega o catálogo e tenta uma vez de novo.
 */
export async function handleRest(req: Req, res: Res, caller: Caller, route: Route) {
  const method = (req.method ?? 'GET').toUpperCase()
  if (method === 'OPTIONS') return sendEmpty(res, 204)
  let raw: Buffer | null = null
  const readBody = async () => {
    raw ??= await readRawBody(req)
    if (raw.length === 0) return undefined
    try {
      return JSON.parse(raw.toString('utf8'))
    } catch {
      throw new ApiError(400, 'PGRST102', 'Corpo da requisição não é um JSON válido')
    }
  }
  const first = await handleRestOnce(req, res, caller, route, method, readBody, false)
  if (first === RETRY) await handleRestOnce(req, res, caller, route, method, readBody, true)
}

async function handleRestOnce(
  req: Req,
  res: Res,
  caller: Caller,
  route: Route,
  method: string,
  readBody: () => Promise<any>,
  retried: boolean,
): Promise<unknown> {
  try {
    let cat = await getCatalog(retried)
    const segs = route.rest.split('/').filter(Boolean).map(decodeSeg)
    if (segs.length === 0) return sendJson(res, 200, {})
    if (segs[0] === 'rpc') {
      throw new ApiError(404, 'PGRST202', `Could not find the function public.${segs[1] ?? ''} in the schema cache`)
    }
    let table = cat.tables.get(segs[0])
    if (!table) {
      cat = await getCatalog(true)
      table = cat.tables.get(segs[0])
    }
    if (!table) {
      throw new ApiError(404, 'PGRST205', `Could not find the table 'public.${segs[0]}' in the schema cache`)
    }

    const sp = route.searchParams
    const prefs = parsePrefer(header(req, 'prefer'))
    const wantObject = header(req, 'accept').includes('application/vnd.pgrst.object+json')
    const returnRep = prefs.return === 'representation'
    const T = `public.${ident(table.name)}`
    const gen = { n: 0 }
    const p = new Params()

    if (method === 'GET' || method === 'HEAD') {
      const conds = buildWhere(p, table, 't', sp)
      const innerConds: string[] = []
      const list = buildSelect(cat, table, 't', parseSelect(sp.get('select') ?? '*'), gen, innerConds)
      const all = [...conds, ...innerConds]
      const where = all.length ? ` WHERE ${all.join(' AND ')}` : ''
      const orderParam = sp.get('order')
      const order = orderParam ? ` ORDER BY ${buildOrder(table, 't', orderParam)}` : ''
      const limit = intParam(sp, 'limit')
      const offset = intParam(sp, 'offset')
      const lim = (limit !== null ? ` LIMIT ${limit}` : '') + (offset !== null ? ` OFFSET ${offset}` : '')
      const dataSql = `SELECT COALESCE(json_agg(r), '[]'::json) AS body FROM (SELECT ${list} FROM ${T} t${where}${order}${lim}) r`
      const wantCount = !!prefs.count
      const { rows, total } = await withCaller(caller, async (c) => {
        const r = await c.query(dataSql, p.values)
        let total: number | null = null
        if (wantCount) {
          const cr = await c.query(`SELECT count(*)::bigint AS n FROM ${T} t${where}`, p.values)
          total = Number(cr.rows[0].n)
        }
        return { rows: r.rows[0].body as unknown[], total }
      })
      const start = offset ?? 0
      const range = rows.length ? `${start}-${start + rows.length - 1}` : '*'
      const headers: Record<string, string> = {}
      if (total !== null) headers['Content-Range'] = `${range}/${total}`
      if (method === 'HEAD') return sendEmpty(res, 200, headers)
      if (wantObject) {
        if (rows.length !== 1) throw singleError(rows.length)
        return sendJson(res, 200, rows[0], headers)
      }
      return sendJson(res, 200, rows, headers)
    }

    if (method === 'POST') {
      const body = await readBody()
      const rows = Array.isArray(body) ? body : [body]
      if (!rows.every(isPlainObject)) {
        throw new ApiError(400, 'PGRST102', 'Corpo inválido: esperado objeto ou lista de objetos')
      }
      if (rows.length === 0) return returnRep ? sendJson(res, 201, []) : sendEmpty(res, 201)
      const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))]
      checkColumns(table, cols)
      const colList = cols.map(ident).join(', ')
      let sql = cols.length
        ? `INSERT INTO ${T} (${colList}) SELECT ${colList} FROM json_populate_recordset(null::${T}, ${p.add(JSON.stringify(rows))}::json)`
        : `INSERT INTO ${T} DEFAULT VALUES`
      if (prefs.resolution && cols.length) {
        const onc = sp.get('on_conflict')
        const target = (onc ? onc.split(',').map((s) => s.trim()) : table.pk).filter(Boolean)
        checkColumns(table, target)
        if (prefs.resolution === 'merge-duplicates') {
          if (!target.length) throw new ApiError(400, 'PGRST100', 'upsert sem chave primária ou on_conflict')
          sql += ` ON CONFLICT (${target.map(ident).join(', ')}) DO UPDATE SET ${cols
            .map((c) => `${ident(c)} = EXCLUDED.${ident(c)}`)
            .join(', ')}`
        } else if (prefs.resolution === 'ignore-duplicates') {
          sql += ` ON CONFLICT ${target.length ? `(${target.map(ident).join(', ')}) ` : ''}DO NOTHING`
        }
      }
      return await runMutation(res, caller, cat, table, sql, p, returnRep, wantObject, sp, gen, 201, 'RETURNING *')
    }

    if (method === 'PATCH') {
      const body = await readBody()
      if (!isPlainObject(body)) throw new ApiError(400, 'PGRST102', 'Corpo inválido: esperado objeto')
      const cols = Object.keys(body)
      checkColumns(table, cols)
      if (!cols.length) return sendEmpty(res, 204)
      const conds = buildWhere(p, table, 't', sp)
      if (!conds.length) {
        throw new ApiError(400, '21000', 'UPDATE requires a WHERE clause', null, 'Informe ao menos um filtro (ex.: id=eq.<uuid>).')
      }
      const sets = cols.map((c) => `${ident(c)} = r.${ident(c)}`).join(', ')
      const sql = `UPDATE ${T} t SET ${sets} FROM json_populate_record(null::${T}, ${p.add(JSON.stringify(body))}::json) r${
        conds.length ? ` WHERE ${conds.join(' AND ')}` : ''
      }`
      return await runMutation(res, caller, cat, table, sql, p, returnRep, wantObject, sp, gen, 200, 'RETURNING t.*')
    }

    if (method === 'DELETE') {
      const conds = buildWhere(p, table, 't', sp)
      if (!conds.length) {
        throw new ApiError(400, '21000', 'DELETE requires a WHERE clause', null, 'Informe ao menos um filtro (ex.: id=eq.<uuid>).')
      }
      const sql = `DELETE FROM ${T} t${conds.length ? ` WHERE ${conds.join(' AND ')}` : ''}`
      return await runMutation(res, caller, cat, table, sql, p, returnRep, wantObject, sp, gen, 200, 'RETURNING t.*')
    }

    throw new ApiError(405, 'PGRST117', `Método ${method} não suportado`)
  } catch (e) {
    const err = toApiError(e, caller)
    if (!retried && ['42703', 'PGRST204', 'PGRST205', 'PGRST200'].includes(err.code)) return RETRY
    return sendJson(res, err.status, err.toJSON())
  }
}

function singleError(n: number) {
  return new ApiError(
    406,
    'PGRST116',
    'JSON object requested, multiple (or no) rows returned',
    `The result contains ${n} rows`,
  )
}

async function runMutation(
  res: Res,
  caller: Caller,
  cat: Catalog,
  table: TableInfo,
  mutSql: string,
  p: Params,
  returnRep: boolean,
  wantObject: boolean,
  sp: URLSearchParams,
  gen: { n: number },
  okStatus: number,
  returning: string,
) {
  const okEmpty = okStatus === 201 ? 201 : 204
  if (!returnRep && !wantObject) {
    await withCaller(caller, (c) => c.query(mutSql, p.values))
    return sendEmpty(res, okEmpty)
  }
  const list = buildSelect(cat, table, 't', parseSelect(sp.get('select') ?? '*'), gen, null)
  const sql = `WITH mut AS (${mutSql} ${returning}) SELECT COALESCE(json_agg(r), '[]'::json) AS body FROM (SELECT ${list} FROM mut t) r`
  const rows = await withCaller(caller, async (c) => {
    const r = await c.query(sql, p.values)
    const out = r.rows[0].body as unknown[]
    if (wantObject && out.length !== 1) throw singleError(out.length) // desfaz a transação
    return out
  })
  return sendJson(res, okStatus, wantObject ? rows[0] : rows)
}
