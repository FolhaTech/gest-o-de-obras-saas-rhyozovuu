import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type Row = {
  id: string
  code: string | null
  name: string
  unit: string
  quantity: number
  unitPrice: number | null
  totalCost: number | null
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const qtyFmt = (n: number) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null))

/**
 * Itens alocados na obra por importação de planilha de compras (work_extra_materials com `source`),
 * com quantidade e valores (R$). Os valores ficam em outra tabela, fechada ao Prestador.
 */
export default function AllocatedItemsPanel({ obraId }: { obraId: string }) {
  const { role } = useAuth()
  const canSeeValues = role !== 'prestador'
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setError(null)
    const { data, error: err } = await supabase
      .from('work_extra_materials')
      .select(
        'id, code, name, unit, quantity, materials(name, unit_of_measure), work_extra_material_values(unit_price, total_cost)',
      )
      .eq('work_id', obraId)
      .not('source', 'is', null)
      .order('name', { ascending: true })
    if (err) {
      setError(err.message)
      setRows([])
      return
    }
    setRows(
      (data || []).map((r: any) => {
        const mat = one<any>(r.materials)
        const val = one<any>(r.work_extra_material_values)
        return {
          id: r.id,
          code: r.code,
          name: r.name || mat?.name || 'Item sem descrição',
          unit: r.unit || mat?.unit_of_measure || '',
          quantity: Number(r.quantity) || 0,
          unitPrice: val ? Number(val.unit_price) : null,
          totalCost: val ? Number(val.total_cost) : null,
        }
      }),
    )
  }, [obraId])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase()
    if (!rows) return []
    if (!t) return rows
    return rows.filter((r) => r.name.toLowerCase().includes(t) || (r.code || '').toLowerCase().includes(t))
  }, [rows, search])

  const total = useMemo(() => (rows || []).reduce((s, r) => s + (r.totalCost || 0), 0), [rows])
  const filteredTotal = useMemo(() => filtered.reduce((s, r) => s + (r.totalCost || 0), 0), [filtered])

  if (!rows) return <Skeleton className="h-48 w-full" />

  if (error) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        Não foi possível carregar os itens: {error}
        <Button variant="outline" size="sm" className="ml-3 gap-2" onClick={load}>
          <RefreshCw className="h-4 w-4" /> Tentar novamente
        </Button>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        Nenhum item importado de planilha nesta obra.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground">Itens alocados</div>
          <div className="text-2xl font-semibold">{rows.length.toLocaleString('pt-BR')}</div>
        </div>
        {canSeeValues && (
          <div className="rounded-lg border bg-card p-4">
            <div className="text-xs text-muted-foreground">Valor total dos materiais</div>
            <div className="text-2xl font-semibold">{brl(total)}</div>
          </div>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por código ou descrição..."
          className="pl-9"
        />
      </div>

      <div className="max-h-[600px] overflow-auto rounded-md border bg-card">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              <TableHead className="w-24">Código</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="w-16">Un.</TableHead>
              <TableHead className="text-right">Qtd.</TableHead>
              {canSeeValues && <TableHead className="text-right">Valor unit.</TableHead>}
              {canSeeValues && <TableHead className="text-right">Valor total</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={canSeeValues ? 6 : 4} className="py-6 text-center text-muted-foreground">
                  Nenhum item encontrado para "{search}".
                </TableCell>
              </TableRow>
            )}
            {filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs text-muted-foreground">{r.code}</TableCell>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>{r.unit}</TableCell>
                <TableCell className="text-right">{qtyFmt(r.quantity)}</TableCell>
                {canSeeValues && (
                  <TableCell className="text-right">{r.unitPrice === null ? '—' : brl(r.unitPrice)}</TableCell>
                )}
                {canSeeValues && (
                  <TableCell className="text-right font-medium">
                    {r.totalCost === null ? '—' : brl(r.totalCost)}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
          {canSeeValues && (
            <TableFooter className="sticky bottom-0 bg-card">
              <TableRow>
                <TableCell colSpan={5} className="text-right font-semibold">
                  {search.trim() ? `Total dos ${filtered.length} itens filtrados` : 'Total geral'}
                </TableCell>
                <TableCell className="text-right font-semibold">{brl(search.trim() ? filteredTotal : total)}</TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
    </div>
  )
}
