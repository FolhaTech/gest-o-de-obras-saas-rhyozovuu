import { withAdmin } from './db.js'

export interface TableInfo {
  name: string
  columns: Set<string>
  pk: string[]
}

export interface ForeignKey {
  name: string
  child: string
  childCols: string[]
  parent: string
  parentSchema: string
  parentCols: string[]
}

export interface Catalog {
  tables: Map<string, TableInfo>
  fks: ForeignKey[]
  loadedAt: number
}

let cache: Catalog | null = null
const TTL_MS = 60_000

/** Lê tabelas, colunas, PKs e FKs do schema public (cache de 60 s por instância). */
export async function getCatalog(force = false): Promise<Catalog> {
  if (!force && cache && Date.now() - cache.loadedAt < TTL_MS) return cache
  const cat = await withAdmin(async (c) => {
    const cols = await c.query(
      `select table_name, column_name from information_schema.columns
       where table_schema = 'public' order by table_name, ordinal_position`,
    )
    const tables = new Map<string, TableInfo>()
    for (const r of cols.rows) {
      let t = tables.get(r.table_name)
      if (!t) tables.set(r.table_name, (t = { name: r.table_name, columns: new Set(), pk: [] }))
      t.columns.add(r.column_name)
    }
    const pks = await c.query(
      `select cl.relname as tbl, array_agg(a.attname::text order by k.ord) as cols
       from pg_constraint c
       join pg_class cl on cl.oid = c.conrelid
       join pg_namespace n on n.oid = cl.relnamespace
       cross join lateral unnest(c.conkey) with ordinality as k(attnum, ord)
       join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
       where c.contype = 'p' and n.nspname = 'public'
       group by cl.relname`,
    )
    for (const r of pks.rows) {
      const t = tables.get(r.tbl)
      if (t) t.pk = r.cols
    }
    const fkRes = await c.query(
      `select c.conname as name, cl.relname as child, pn.nspname as parent_schema, pcl.relname as parent,
              array_agg(a.attname::text order by k.ord) as child_cols,
              array_agg(pa.attname::text order by k.ord) as parent_cols
       from pg_constraint c
       join pg_class cl on cl.oid = c.conrelid
       join pg_namespace n on n.oid = cl.relnamespace
       join pg_class pcl on pcl.oid = c.confrelid
       join pg_namespace pn on pn.oid = pcl.relnamespace
       cross join lateral unnest(c.conkey, c.confkey) with ordinality as k(ck, pk, ord)
       join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.ck
       join pg_attribute pa on pa.attrelid = c.confrelid and pa.attnum = k.pk
       where c.contype = 'f' and n.nspname = 'public'
       group by c.conname, cl.relname, pn.nspname, pcl.relname`,
    )
    const fks: ForeignKey[] = fkRes.rows.map((r) => ({
      name: r.name,
      child: r.child,
      childCols: r.child_cols,
      parent: r.parent,
      parentSchema: r.parent_schema,
      parentCols: r.parent_cols,
    }))
    return { tables, fks, loadedAt: Date.now() } satisfies Catalog
  })
  cache = cat
  return cat
}
