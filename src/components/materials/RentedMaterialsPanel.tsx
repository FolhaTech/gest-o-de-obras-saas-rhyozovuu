import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Edit2,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Truck,
  Wallet,
} from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency, formatDate, formatSupabaseError } from '@/lib/formatters'
import { localISODate } from '@/lib/planner-progress'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'

type CostPeriod = 'dia' | 'semana' | 'mes' | 'unico'

interface RentedMaterial {
  id: string
  work_id: string
  name: string
  supplier: string | null
  quantity: number
  unit: string
  rental_cost: number
  cost_period: CostPeriod
  start_date: string
  expected_return_date: string | null
  returned_date: string | null
  notes: string | null
  works?: { id: string; name: string } | null
}

const PERIOD_LABEL: Record<CostPeriod, string> = {
  dia: 'por dia',
  semana: 'por semana',
  mes: 'por mês',
  unico: 'valor único',
}
const UNITS = ['un', 'm', 'm²', 'm³', 'kg', 'jogo', 'diária']

const dayMs = 86_400_000
const utc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))

/** Dias de locação, contando início e fim (hoje, se ainda não devolvido). */
function rentalDays(item: RentedMaterial, today: string): number {
  const end = item.returned_date ?? today
  return Math.max(1, Math.round((utc(end) - utc(item.start_date)) / dayMs) + 1)
}

/** Custo acumulado: quantidade × valor × períodos cobrados até a devolução (ou hoje). */
function rentalTotal(item: RentedMaterial, today: string): number {
  const days = rentalDays(item, today)
  const periods =
    item.cost_period === 'dia'
      ? days
      : item.cost_period === 'semana'
        ? Math.ceil(days / 7)
        : item.cost_period === 'mes'
          ? Math.ceil(days / 30)
          : 1
  return Number(item.quantity) * Number(item.rental_cost) * periods
}

type StatusKey = 'locado' | 'atrasado' | 'devolvido'
function rentalStatus(item: RentedMaterial, today: string): StatusKey {
  if (item.returned_date) return 'devolvido'
  if (item.expected_return_date && item.expected_return_date < today) return 'atrasado'
  return 'locado'
}

const EMPTY_FORM = {
  work_id: '',
  name: '',
  supplier: '',
  quantity: '1',
  unit: 'un',
  rental_cost: '',
  cost_period: 'dia' as CostPeriod,
  start_date: '',
  expected_return_date: '',
  returned_date: '',
  notes: '',
}

const lateReturn = (i: Pick<RentedMaterial, 'returned_date' | 'expected_return_date'>, today: string) =>
  !i.returned_date && !!i.expected_return_date && i.expected_return_date < today

/** Quantos materiais locados estão com a devolução atrasada (para o contador da aba em Materiais). */
export function useRentedLateCount() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    let alive = true
    supabase
      .from('work_rented_materials' as any)
      .select('returned_date, expected_return_date')
      .is('returned_date', null)
      .then(({ data }) => {
        if (!alive) return
        const today = localISODate()
        setCount(((data ?? []) as unknown as RentedMaterial[]).filter((i) => lateReturn(i, today)).length)
      })
    return () => {
      alive = false
    }
  }, [])
  return count
}

/**
 * Materiais locados (equipamentos e materiais alugados) com o custo acumulado da locação.
 * Em Materiais lista as locações de TODAS as obras (com a coluna Obra e o filtro por obra); com `obraId`
 * mostra só as de uma obra. Admin e Gestor lançam; o Prestador só consulta. Valores (R$) só para o Admin.
 */
export default function RentedMaterialsPanel({ obraId }: { obraId?: string }) {
  const { toast } = useToast()
  const { canSeeValues, role } = useAuth() // valores (R$) só para o administrador
  const canManage = role !== 'prestador' // o Prestador só consulta
  const [items, setItems] = useState<RentedMaterial[]>([])
  const [works, setWorks] = useState<{ id: string; name: string }[]>([])
  const [workFilter, setWorkFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const today = localISODate()

  const fetchItems = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('work_rented_materials' as any)
      .select('*, works:work_id(id, name)')
      .order('start_date', { ascending: false })
    if (obraId) query = query.eq('work_id', obraId)
    const [{ data, error: err }, workRes] = await Promise.all([
      query,
      obraId ? Promise.resolve({ data: [] as { id: string; name: string }[] }) : supabase.from('works').select('id, name').order('name'),
    ])
    setWorks((workRes.data ?? []) as { id: string; name: string }[])
    if (err) {
      setError(formatSupabaseError(err))
      setItems([])
    } else {
      setError(null)
      setItems((data ?? []) as unknown as RentedMaterial[])
    }
    setLoading(false)
  }, [obraId])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  const visible = useMemo(() => {
    const t = search.trim().toLowerCase()
    return items.filter((i) => {
      if (workFilter !== 'all' && i.work_id !== workFilter) return false
      if (!t) return true
      return i.name.toLowerCase().includes(t) || (i.supplier ?? '').toLowerCase().includes(t) || (i.works?.name ?? '').toLowerCase().includes(t)
    })
  }, [items, workFilter, search])

  const summary = useMemo(() => {
    const active = visible.filter((i) => !i.returned_date)
    return {
      active: active.length,
      late: active.filter((i) => rentalStatus(i, today) === 'atrasado').length,
      total: visible.reduce((acc, i) => acc + rentalTotal(i, today), 0),
    }
  }, [visible, today])

  const openCreate = () => {
    setEditingId(null)
    setForm({ ...EMPTY_FORM, work_id: obraId ?? '', start_date: today })
    setOpen(true)
  }

  const openEdit = (item: RentedMaterial) => {
    setEditingId(item.id)
    setForm({
      work_id: item.work_id,
      name: item.name,
      supplier: item.supplier ?? '',
      quantity: String(item.quantity),
      unit: item.unit,
      rental_cost: String(item.rental_cost),
      cost_period: item.cost_period,
      start_date: item.start_date,
      expected_return_date: item.expected_return_date ?? '',
      returned_date: item.returned_date ?? '',
      notes: item.notes ?? '',
    })
    setOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    const quantity = Number(form.quantity.replace(',', '.'))
    const rentalCost = Number((form.rental_cost || '0').replace(',', '.'))
    const targetWork = obraId ?? form.work_id
    if (!targetWork) {
      toast({ title: 'Escolha a obra', description: 'Informe em qual obra o material está locado.', variant: 'destructive' })
      return
    }
    if (!form.name.trim() || !(quantity > 0) || rentalCost < 0 || Number.isNaN(rentalCost)) {
      toast({ title: 'Confira os dados', description: 'Informe nome, quantidade e valor válidos.', variant: 'destructive' })
      return
    }
    if (form.expected_return_date && form.expected_return_date < form.start_date) {
      toast({ title: 'Datas inválidas', description: 'A devolução prevista não pode ser anterior ao início.', variant: 'destructive' })
      return
    }
    if (form.returned_date && form.returned_date < form.start_date) {
      toast({ title: 'Datas inválidas', description: 'A devolução não pode ser anterior ao início.', variant: 'destructive' })
      return
    }
    const payload = {
      work_id: targetWork,
      name: form.name.trim(),
      supplier: form.supplier.trim() || null,
      quantity,
      unit: form.unit,
      rental_cost: rentalCost,
      cost_period: form.cost_period,
      start_date: form.start_date,
      expected_return_date: form.expected_return_date || null,
      returned_date: form.returned_date || null,
      notes: form.notes.trim() || null,
    }
    setSaving(true)
    const { error: err } = editingId
      ? await supabase.from('work_rented_materials' as any).update(payload).eq('id', editingId)
      : await supabase.from('work_rented_materials' as any).insert(payload)
    setSaving(false)
    if (err) {
      toast({ title: 'Erro ao salvar', description: formatSupabaseError(err), variant: 'destructive' })
      return
    }
    toast({ title: editingId ? 'Material locado atualizado' : 'Material locado adicionado' })
    setOpen(false)
    fetchItems()
  }

  const markReturned = async (item: RentedMaterial) => {
    const returned = today < item.start_date ? item.start_date : today
    const { error: err } = await supabase
      .from('work_rented_materials' as any)
      .update({ returned_date: returned })
      .eq('id', item.id)
    if (err) {
      toast({ title: 'Erro ao registrar devolução', description: formatSupabaseError(err), variant: 'destructive' })
      return
    }
    toast({ title: 'Devolução registrada', description: item.name })
    fetchItems()
  }

  const handleDelete = async (item: RentedMaterial) => {
    if (!confirm(`Excluir "${item.name}" dos materiais locados?`)) return
    const { error: err } = await supabase.from('work_rented_materials' as any).delete().eq('id', item.id)
    if (err) {
      toast({ title: 'Erro ao excluir', description: formatSupabaseError(err), variant: 'destructive' })
      return
    }
    toast({ title: 'Material locado excluído' })
    fetchItems()
  }

  const statusBadge = (item: RentedMaterial) => {
    const st = rentalStatus(item, today)
    if (st === 'devolvido')
      return (
        <Badge variant="secondary" className="gap-1 font-normal">
          <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Devolvido
        </Badge>
      )
    if (st === 'atrasado')
      return (
        <Badge variant="outline" className="gap-1 font-normal border-rose-300 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertTriangle className="h-3 w-3" /> Devolução atrasada
        </Badge>
      )
    return (
      <Badge variant="outline" className="gap-1 font-normal border-blue-300 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
        <Truck className="h-3 w-3" /> Locado
      </Badge>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" /> Materiais Locados
          </h3>
          <p className="text-xs text-muted-foreground">
            {obraId
              ? 'Equipamentos e materiais alugados para esta obra, com o custo acumulado da locação.'
              : 'Equipamentos e materiais alugados para as obras, com o custo acumulado da locação.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchItems} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Atualizar
          </Button>
          {canManage && (
            <Button size="sm" onClick={openCreate} className="gap-2">
              <Plus className="h-4 w-4" /> Adicionar material locado
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="shadow-none border">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase">Locados agora</p>
              <h3 className="text-2xl font-bold mt-1">{summary.active}</h3>
            </div>
            <div className="p-2.5 rounded-full bg-blue-500/10 text-blue-600">
              <PackageCheck className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
        {canSeeValues && (
        <Card className="shadow-none border">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase">Custo acumulado</p>
              <h3 className="text-2xl font-bold mt-1">{formatCurrency(summary.total)}</h3>
            </div>
            <div className="p-2.5 rounded-full bg-primary/10 text-primary">
              <Wallet className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
        )}
        <Card className={`shadow-none border ${summary.late > 0 ? 'border-rose-300' : ''}`}>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase">Devolução atrasada</p>
              <h3 className="text-2xl font-bold mt-1 text-rose-600">{summary.late}</h3>
            </div>
            <div className="p-2.5 rounded-full bg-rose-500/10 text-rose-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {!obraId && items.length > 0 && (
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por material, locadora ou obra..." className="pl-9" />
          </div>
          <Select value={workFilter} onValueChange={setWorkFilter}>
            <SelectTrigger className="md:w-56"><SelectValue placeholder="Obra" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as obras</SelectItem>
              {works.map((w) => <SelectItem key={w.id} value={w.id}>{w.name.trim()}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : error ? (
        <p className="text-sm text-destructive p-4">Não foi possível carregar os materiais locados: {error}</p>
      ) : items.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-card space-y-3">
          <Truck className="h-10 w-10 mx-auto text-muted-foreground opacity-60" />
          <p className="text-sm text-muted-foreground">
            {obraId ? 'Nenhum material locado nesta obra ainda.' : 'Nenhum material locado ainda.'}
          </p>
          {canManage && (
            <Button size="sm" onClick={openCreate} className="gap-2">
              <Plus className="h-4 w-4" /> Adicionar material locado
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-md border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Material</TableHead>
                {!obraId && <TableHead>Obra</TableHead>}
                <TableHead>Locadora</TableHead>
                <TableHead className="text-right">Qtd.</TableHead>
                {canSeeValues && <TableHead className="text-right">Valor</TableHead>}
                <TableHead>Período</TableHead>
                <TableHead>Devolução</TableHead>
                <TableHead>Status</TableHead>
                {canSeeValues && <TableHead className="text-right">Custo acumulado</TableHead>}
                {canManage && <TableHead className="text-right">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="py-6 text-center text-muted-foreground">Nenhum material locado encontrado.</TableCell>
                </TableRow>
              )}
              {visible.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="font-medium">{item.name}</div>
                    {item.notes && (
                      <div className="text-xs text-muted-foreground line-clamp-1">{item.notes}</div>
                    )}
                  </TableCell>
                  {!obraId && <TableCell>{item.works?.name?.trim() ?? '-'}</TableCell>}
                  <TableCell>{item.supplier || '-'}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {Number(item.quantity)} {item.unit}
                  </TableCell>
                  {canSeeValues && (
                  <TableCell className="text-right whitespace-nowrap">
                    {formatCurrency(Number(item.rental_cost))}
                    <div className="text-[10px] text-muted-foreground">{PERIOD_LABEL[item.cost_period]}</div>
                  </TableCell>
                  )}
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatDate(item.start_date)}
                    <div className="text-[10px] text-muted-foreground">{rentalDays(item, today)} dia(s)</div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {item.returned_date
                      ? formatDate(item.returned_date)
                      : item.expected_return_date
                        ? `Prev. ${formatDate(item.expected_return_date)}`
                        : '-'}
                  </TableCell>
                  <TableCell>{statusBadge(item)}</TableCell>
                  {canSeeValues && (
                  <TableCell className="text-right font-semibold whitespace-nowrap">
                    {formatCurrency(rentalTotal(item, today))}
                  </TableCell>
                  )}
                  {canManage && (
                  <TableCell className="text-right whitespace-nowrap">
                    {!item.returned_date && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-emerald-600"
                        title="Marcar como devolvido hoje"
                        onClick={() => markReturned(item)}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-primary"
                      title="Editar"
                      onClick={() => openEdit(item)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      title="Excluir"
                      onClick={() => handleDelete(item)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar material locado' : 'Adicionar material locado'}</DialogTitle>
            <DialogDescription>
              Informe o que foi alugado, o valor da locação e as datas. O custo é calculado até a
              devolução (ou até hoje).
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            {!obraId && (
              <div className="space-y-2">
                <Label>Obra *</Label>
                <Select value={form.work_id} onValueChange={(v) => setForm({ ...form, work_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Em qual obra está locado" /></SelectTrigger>
                  <SelectContent>
                    {works.map((w) => <SelectItem key={w.id} value={w.id}>{w.name.trim()}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="rm-name">Material / equipamento *</Label>
              <Input
                id="rm-name"
                required
                placeholder="Ex.: Andaime tubular, Betoneira 400 L"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rm-supplier">Locadora / fornecedor</Label>
              <Input
                id="rm-supplier"
                value={form.supplier}
                onChange={(e) => setForm({ ...form, supplier: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rm-qty">Quantidade *</Label>
                <Input
                  id="rm-qty"
                  required
                  inputMode="decimal"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Unidade</Label>
                <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {canSeeValues && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rm-cost">Valor da locação (R$)</Label>
                <Input
                  id="rm-cost"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={form.rental_cost}
                  onChange={(e) => setForm({ ...form, rental_cost: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Cobrança</Label>
                <Select
                  value={form.cost_period}
                  onValueChange={(v: CostPeriod) => setForm({ ...form, cost_period: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dia">Por dia</SelectItem>
                    <SelectItem value="semana">Por semana</SelectItem>
                    <SelectItem value="mes">Por mês</SelectItem>
                    <SelectItem value="unico">Valor único</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            )}
            <div className={`grid gap-4 ${editingId ? 'grid-cols-3' : 'grid-cols-2'}`}>
              <div className="space-y-2">
                <Label htmlFor="rm-start">Início *</Label>
                <Input
                  id="rm-start"
                  type="date"
                  required
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rm-exp">Devolução prevista</Label>
                <Input
                  id="rm-exp"
                  type="date"
                  min={form.start_date || undefined}
                  value={form.expected_return_date}
                  onChange={(e) => setForm({ ...form, expected_return_date: e.target.value })}
                />
              </div>
              {editingId && (
                <div className="space-y-2">
                  <Label htmlFor="rm-ret">Devolvido em</Label>
                  <Input
                    id="rm-ret"
                    type="date"
                    min={form.start_date || undefined}
                    value={form.returned_date}
                    onChange={(e) => setForm({ ...form, returned_date: e.target.value })}
                  />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="rm-notes">Observações</Label>
              <Textarea
                id="rm-notes"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Adicionar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
