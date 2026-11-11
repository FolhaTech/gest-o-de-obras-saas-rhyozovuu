import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRightLeft,
  CalendarClock,
  Edit2,
  History,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Wrench,
} from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency, formatDate, formatSupabaseError } from '@/lib/formatters'
import {
  DEFAULT_INTERVAL_MONTHS,
  DUE_SOON_DAYS,
  REPLACE_THRESHOLD,
  describeDue,
  equipmentStatus,
  todayISO,
  type EquipmentLike,
} from '@/lib/equipment'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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

interface Maintenance {
  id: string
  maintenance_date: string
  description: string | null
  performed_by: string | null
  maintenance_cost?: number | null
}
interface Equipment extends EquipmentLike {
  id: string
  name: string
  code: string | null
  category: string | null
  purchase_value?: number | null
  quantity: number
  work_id: string | null
  status: string
  notes: string | null
  works?: { id: string; name: string } | null
  equipment_maintenances: Maintenance[]
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Em uso',
  maintenance: 'Em manutenção',
  retired: 'Baixado',
}
const NO_WORK = '__none__'

const SELECT =
  '*, works:work_id(id, name), equipment_maintenances(id, maintenance_date, description, performed_by, maintenance_cost)'

async function loadEquipment(): Promise<{ data: Equipment[]; error: string | null }> {
  const { data, error } = await supabase
    .from('equipment' as any)
    .select(SELECT)
    .order('name', { ascending: true })
  if (error) return { data: [], error: formatSupabaseError(error) }
  return {
    data: ((data ?? []) as unknown as Equipment[]).map((e) => ({
      ...e,
      equipment_maintenances: e.equipment_maintenances ?? [],
    })),
    error: null,
  }
}

/** Quantos equipamentos pedem atenção (manutenção vencida/próxima ou limite de manutenções). */
export function useEquipmentAlertCount() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    let alive = true
    loadEquipment().then(({ data }) => {
      if (!alive) return
      const today = todayISO()
      setCount(
        data.filter((e) => {
          const s = equipmentStatus(e, today)
          return s.maintenanceAlert === 'overdue' || s.maintenanceAlert === 'soon' || s.replaceAlert
        }).length,
      )
    })
    return () => {
      alive = false
    }
  }, [])
  return count
}

const emptyForm = () => ({
  name: '',
  quantity: '1',
  code: '',
  category: '',
  purchase_date: '',
  purchase_value: '',
  work_id: NO_WORK,
  status: 'active',
  maintenance_interval_months: String(DEFAULT_INTERVAL_MONTHS),
  initial_maintenance_count: '0',
  last_maintenance_date: '',
  notes: '',
})
const emptyMaintenance = () => ({ maintenance_date: todayISO(), description: '', performed_by: '', maintenance_cost: '' })

const num = (v: string) => Number((v || '0').replace(',', '.'))

/**
 * Equipamentos: data da compra, manutenções feitas e alertas.
 *  - manutenção a cada 6 meses (configurável por equipamento);
 *  - a partir de 5 manutenções, avisa para movimentar o equipamento ou comprar outro.
 * Admin e Gestor cadastram e registram manutenções; o Prestador só consulta. Valores (R$) só para o Admin.
 */
export default function EquipmentPanel() {
  const { toast } = useToast()
  const { role, canSeeValues } = useAuth()
  const canManage = role !== 'prestador'

  const [items, setItems] = useState<Equipment[]>([])
  const [works, setWorks] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)

  const [maintTarget, setMaintTarget] = useState<Equipment | null>(null)
  const [maintForm, setMaintForm] = useState(emptyMaintenance())
  const [historyTarget, setHistoryTarget] = useState<string | null>(null)
  const [moveTarget, setMoveTarget] = useState<Equipment | null>(null)
  const [moveWork, setMoveWork] = useState(NO_WORK)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [eq, workRes] = await Promise.all([
      loadEquipment(),
      supabase.from('works').select('id, name').order('name'),
    ])
    setItems(eq.data)
    setError(eq.error)
    setWorks((workRes.data ?? []) as { id: string; name: string }[])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const today = todayISO()
  const rows = useMemo(
    () => items.map((e) => ({ eq: e, st: equipmentStatus(e, today) })),
    [items, today],
  )

  const visible = useMemo(() => {
    const t = search.trim().toLowerCase()
    if (!t) return rows
    return rows.filter(
      ({ eq }) =>
        eq.name.toLowerCase().includes(t) ||
        (eq.code ?? '').toLowerCase().includes(t) ||
        (eq.category ?? '').toLowerCase().includes(t),
    )
  }, [rows, search])

  const overdue = rows.filter((r) => r.st.maintenanceAlert === 'overdue')
  const soon = rows.filter((r) => r.st.maintenanceAlert === 'soon')
  const replace = rows.filter((r) => r.st.replaceAlert)
  const inUse = rows.filter((r) => r.eq.status !== 'retired').length
  const units = rows.filter((r) => r.eq.status !== 'retired').reduce((sum, r) => sum + (r.eq.quantity ?? 1), 0)

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm())
    setOpen(true)
  }
  const openEdit = (e: Equipment) => {
    setEditingId(e.id)
    setForm({
      name: e.name,
      code: e.code ?? '',
      category: e.category ?? '',
      purchase_date: e.purchase_date ?? '',
      quantity: String(e.quantity ?? 1),
      purchase_value: e.purchase_value ? String(e.purchase_value) : '',
      work_id: e.work_id ?? NO_WORK,
      status: e.status,
      maintenance_interval_months: String(e.maintenance_interval_months ?? DEFAULT_INTERVAL_MONTHS),
      initial_maintenance_count: String(e.initial_maintenance_count ?? 0),
      last_maintenance_date: e.last_maintenance_date ?? '',
      notes: e.notes ?? '',
    })
    setOpen(true)
  }

  const handleSave = async (ev: React.FormEvent) => {
    ev.preventDefault()
    const interval = Math.round(num(form.maintenance_interval_months))
    const initial = Math.round(num(form.initial_maintenance_count))
    const cost = num(form.purchase_value)
    const qty = Math.round(num(form.quantity))
    if (!form.name.trim() || !(qty >= 1) || !(interval >= 1) || !(initial >= 0) || Number.isNaN(cost) || cost < 0) {
      toast({ title: 'Confira os dados', description: 'Informe o nome, a quantidade (mínimo 1), o intervalo (meses) e valores válidos.', variant: 'destructive' })
      return
    }
    if (form.purchase_date && form.purchase_date > today) {
      toast({ title: 'Data da compra inválida', description: 'A compra não pode estar no futuro.', variant: 'destructive' })
      return
    }
    if (form.last_maintenance_date && form.purchase_date && form.last_maintenance_date < form.purchase_date) {
      toast({ title: 'Datas inválidas', description: 'A última manutenção não pode ser anterior à compra.', variant: 'destructive' })
      return
    }
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      quantity: qty,
      code: form.code.trim() || null,
      category: form.category.trim() || null,
      purchase_date: form.purchase_date || null,
      work_id: form.work_id === NO_WORK ? null : form.work_id,
      status: form.status,
      maintenance_interval_months: interval,
      initial_maintenance_count: initial,
      last_maintenance_date: initial > 0 ? form.last_maintenance_date || null : null,
      notes: form.notes.trim() || null,
    }
    if (canSeeValues) payload.purchase_value = cost
    setSaving(true)
    const { error: err } = editingId
      ? await supabase.from('equipment' as any).update(payload).eq('id', editingId)
      : await supabase.from('equipment' as any).insert(payload)
    setSaving(false)
    if (err) {
      toast({ title: 'Erro ao salvar', description: formatSupabaseError(err), variant: 'destructive' })
      return
    }
    toast({ title: editingId ? 'Equipamento atualizado' : 'Equipamento cadastrado' })
    setOpen(false)
    fetchAll()
  }

  const handleDelete = async (e: Equipment) => {
    if (!confirm(`Excluir o equipamento "${e.name}" e o histórico de manutenções dele?`)) return
    const { error: err } = await supabase.from('equipment' as any).delete().eq('id', e.id)
    if (err) {
      toast({ title: 'Erro ao excluir', description: formatSupabaseError(err), variant: 'destructive' })
      return
    }
    toast({ title: 'Equipamento excluído' })
    fetchAll()
  }

  const handleMaintenance = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!maintTarget) return
    const cost = num(maintForm.maintenance_cost)
    if (!maintForm.maintenance_date || Number.isNaN(cost) || cost < 0) {
      toast({ title: 'Confira os dados', description: 'Informe a data e um custo válido.', variant: 'destructive' })
      return
    }
    if (maintForm.maintenance_date > today) {
      toast({ title: 'Data inválida', description: 'A manutenção não pode estar no futuro.', variant: 'destructive' })
      return
    }
    if (maintTarget.purchase_date && maintForm.maintenance_date < maintTarget.purchase_date) {
      toast({ title: 'Data inválida', description: 'A manutenção não pode ser anterior à compra.', variant: 'destructive' })
      return
    }
    const payload: Record<string, unknown> = {
      equipment_id: maintTarget.id,
      maintenance_date: maintForm.maintenance_date,
      description: maintForm.description.trim() || null,
      performed_by: maintForm.performed_by.trim() || null,
    }
    if (canSeeValues) payload.maintenance_cost = cost
    setSaving(true)
    const { error: err } = await supabase.from('equipment_maintenances' as any).insert(payload)
    // equipamento que estava na oficina volta a ser usado
    if (!err && maintTarget.status === 'maintenance') {
      await supabase.from('equipment' as any).update({ status: 'active' }).eq('id', maintTarget.id)
    }
    setSaving(false)
    if (err) {
      toast({ title: 'Erro ao registrar', description: formatSupabaseError(err), variant: 'destructive' })
      return
    }
    toast({ title: 'Manutenção registrada' })
    setMaintTarget(null)
    fetchAll()
  }

  const handleDeleteMaintenance = async (id: string) => {
    if (!confirm('Excluir este registro de manutenção?')) return
    const { error: err } = await supabase.from('equipment_maintenances' as any).delete().eq('id', id)
    if (err) {
      toast({ title: 'Erro ao excluir', description: formatSupabaseError(err), variant: 'destructive' })
      return
    }
    fetchAll()
  }

  const handleMove = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!moveTarget) return
    const { error: err } = await supabase
      .from('equipment' as any)
      .update({ work_id: moveWork === NO_WORK ? null : moveWork })
      .eq('id', moveTarget.id)
    if (err) {
      toast({ title: 'Erro ao movimentar', description: formatSupabaseError(err), variant: 'destructive' })
      return
    }
    toast({ title: 'Equipamento movimentado' })
    setMoveTarget(null)
    fetchAll()
  }

  const historyEq = items.find((e) => e.id === historyTarget) ?? null

  if (loading && items.length === 0) return <Skeleton className="h-64 w-full" />

  if (error) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        Não foi possível carregar os equipamentos: {error}
        <Button variant="outline" size="sm" className="ml-3 gap-2" onClick={fetchAll}>
          <RefreshCw className="h-4 w-4" /> Tentar novamente
        </Button>
      </div>
    )
  }

  const names = (list: typeof rows) => list.map((r) => r.eq.name).join(', ')

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Registre a compra e as manutenções. Manutenção a cada {DEFAULT_INTERVAL_MONTHS} meses; a partir de{' '}
          {REPLACE_THRESHOLD} manutenções o sistema avisa para movimentar ou comprar outro equipamento.
        </p>
        {canManage && (
          <Button className="gap-2 shrink-0" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Novo equipamento
          </Button>
        )}
      </div>

      {overdue.length > 0 && (
        <Alert variant="destructive">
          <Wrench className="h-5 w-5" />
          <AlertTitle>Manutenção vencida</AlertTitle>
          <AlertDescription>{names(overdue)}</AlertDescription>
        </Alert>
      )}
      {soon.length > 0 && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-900">
          <CalendarClock className="h-5 w-5 text-amber-600" />
          <AlertTitle>Manutenção nos próximos {DUE_SOON_DAYS} dias</AlertTitle>
          <AlertDescription>{names(soon)}</AlertDescription>
        </Alert>
      )}
      {replace.length > 0 && (
        <Alert className="border-orange-300 bg-orange-50 text-orange-900">
          <AlertTriangle className="h-5 w-5 text-orange-600" />
          <AlertTitle>{REPLACE_THRESHOLD}+ manutenções: movimentar ou comprar outro equipamento</AlertTitle>
          <AlertDescription>
            {names(replace)}. Avalie mover o equipamento para um uso mais leve ou comprar um novo.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Equipamentos', value: inUse, tone: '', sub: `${units} unidade(s) no total` },
          { label: 'Manutenção vencida', value: overdue.length, tone: overdue.length ? 'text-rose-600' : '', sub: '' },
          { label: `Vence em ${DUE_SOON_DAYS} dias`, value: soon.length, tone: soon.length ? 'text-amber-600' : '', sub: '' },
          { label: `${REPLACE_THRESHOLD}+ manutenções`, value: replace.length, tone: replace.length ? 'text-orange-600' : '', sub: '' },
        ].map((c) => (
          <Card key={c.label} className="shadow-none border">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground font-medium uppercase">{c.label}</p>
              <h3 className={`text-2xl font-bold mt-1 ${c.tone}`}>{c.value}</h3>
              {c.sub && <p className="text-xs text-muted-foreground mt-0.5">{c.sub}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, código ou categoria..."
          className="pl-9"
        />
      </div>

      {items.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-card space-y-3">
          <Wrench className="h-10 w-10 mx-auto text-muted-foreground opacity-60" />
          <p className="text-sm text-muted-foreground">Nenhum equipamento cadastrado ainda.</p>
          {canManage && (
            <Button size="sm" onClick={openCreate} className="gap-2">
              <Plus className="h-4 w-4" /> Novo equipamento
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-md border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Equipamento</TableHead>
                <TableHead className="text-center">Qtd.</TableHead>
                <TableHead>Obra / local</TableHead>
                <TableHead>Comprado em</TableHead>
                <TableHead className="text-center">Manutenções</TableHead>
                <TableHead>Última</TableHead>
                <TableHead>Próxima</TableHead>
                <TableHead>Situação</TableHead>
                {canSeeValues && <TableHead className="text-right">Valor da compra</TableHead>}
                {canManage && <TableHead className="text-right">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="py-6 text-center text-muted-foreground">
                    Nenhum equipamento encontrado.
                  </TableCell>
                </TableRow>
              )}
              {visible.map(({ eq, st }) => (
                <TableRow key={eq.id} className={st.maintenanceAlert === 'overdue' ? 'bg-rose-50/60' : ''}>
                  <TableCell>
                    <div className="font-medium">{eq.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {[eq.code, eq.category].filter(Boolean).join(' · ') || '-'}
                    </div>
                  </TableCell>
                  <TableCell className="text-center font-medium">{eq.quantity ?? 1}</TableCell>
                  <TableCell>{eq.works?.name ?? 'Depósito'}</TableCell>
                  <TableCell className="whitespace-nowrap">{eq.purchase_date ? formatDate(eq.purchase_date) : '-'}</TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant="outline"
                      className={st.replaceAlert ? 'border-orange-300 bg-orange-50 text-orange-700' : ''}
                    >
                      {st.count}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{st.lastDate ? formatDate(st.lastDate) : '-'}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {st.nextDate ? formatDate(st.nextDate) : '-'}
                    {st.maintenanceAlert !== 'none' && (
                      <div
                        className={`text-[10px] ${
                          st.maintenanceAlert === 'overdue'
                            ? 'text-rose-600 font-medium'
                            : st.maintenanceAlert === 'soon'
                              ? 'text-amber-600 font-medium'
                              : 'text-muted-foreground'
                        }`}
                      >
                        {describeDue(st.daysToNext)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 items-start">
                      <Badge variant="secondary" className="font-normal">
                        {STATUS_LABEL[eq.status] ?? eq.status}
                      </Badge>
                      {st.replaceAlert && (
                        <span className="text-[10px] text-orange-700 font-medium flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> Movimentar ou comprar outro
                        </span>
                      )}
                    </div>
                  </TableCell>
                  {canSeeValues && (
                    <TableCell className="text-right">{eq.purchase_value ? formatCurrency(Number(eq.purchase_value)) : '-'}</TableCell>
                  )}
                  {canManage && (
                    <TableCell className="text-right whitespace-nowrap">
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Registrar manutenção" onClick={() => { setMaintTarget(eq); setMaintForm(emptyMaintenance()) }}>
                        <Wrench className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Histórico de manutenções" onClick={() => setHistoryTarget(eq.id)}>
                        <History className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Movimentar (trocar de obra/local)" onClick={() => { setMoveTarget(eq); setMoveWork(eq.work_id ?? NO_WORK) }}>
                        <ArrowRightLeft className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar" onClick={() => openEdit(eq)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" title="Excluir" onClick={() => handleDelete(eq)}>
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

      {/* Novo / editar equipamento */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar equipamento' : 'Novo equipamento'}</DialogTitle>
            <DialogDescription>Dados da compra e do controle de manutenção.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-[1fr_7rem] gap-4">
              <div className="space-y-2">
                <Label htmlFor="eq-name">Nome *</Label>
                <Input id="eq-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Betoneira 400 L" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="eq-qty">Quantidade *</Label>
                <Input id="eq-qty" type="number" required min="1" step="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="eq-code">Código / nº de série</Label>
                <Input id="eq-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="eq-cat">Categoria</Label>
                <Input id="eq-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Ex.: Ferramenta elétrica" />
              </div>
            </div>
            <div className={`grid gap-4 ${canSeeValues ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <div className="space-y-2">
                <Label htmlFor="eq-date">Comprado em</Label>
                <Input id="eq-date" type="date" max={today} value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} />
              </div>
              {canSeeValues && (
                <div className="space-y-2">
                  <Label htmlFor="eq-value">Valor total da compra (R$)</Label>
                  <Input id="eq-value" inputMode="decimal" placeholder="0,00" value={form.purchase_value} onChange={(e) => setForm({ ...form, purchase_value: e.target.value })} />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Obra / local atual</Label>
                <Select value={form.work_id} onValueChange={(v) => setForm({ ...form, work_id: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_WORK}>Depósito (sem obra)</SelectItem>
                    {works.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name.trim()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Situação</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Em uso</SelectItem>
                    <SelectItem value="maintenance">Em manutenção</SelectItem>
                    <SelectItem value="retired">Baixado (sem alertas)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="eq-int">Manutenção a cada (meses)</Label>
                <Input id="eq-int" type="number" min="1" step="1" value={form.maintenance_interval_months} onChange={(e) => setForm({ ...form, maintenance_interval_months: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="eq-init">Manutenções já feitas</Label>
                <Input id="eq-init" type="number" min="0" step="1" value={form.initial_maintenance_count} onChange={(e) => setForm({ ...form, initial_maintenance_count: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="eq-last">Última manutenção</Label>
                <Input id="eq-last" type="date" max={today} disabled={num(form.initial_maintenance_count) < 1} value={form.last_maintenance_date} onChange={(e) => setForm({ ...form, last_maintenance_date: e.target.value })} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              "Manutenções já feitas" conta as anteriores a este cadastro; as novas entram em "Registrar manutenção".
            </p>
            <div className="space-y-2">
              <Label htmlFor="eq-notes">Observações</Label>
              <Textarea id="eq-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Cadastrar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Registrar manutenção */}
      <Dialog open={!!maintTarget} onOpenChange={(o) => !o && setMaintTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar manutenção</DialogTitle>
            <DialogDescription>{maintTarget?.name}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleMaintenance} className="space-y-4">
            <div className={`grid gap-4 ${canSeeValues ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <div className="space-y-2">
                <Label htmlFor="mt-date">Data *</Label>
                <Input id="mt-date" type="date" required max={today} value={maintForm.maintenance_date} onChange={(e) => setMaintForm({ ...maintForm, maintenance_date: e.target.value })} />
              </div>
              {canSeeValues && (
                <div className="space-y-2">
                  <Label htmlFor="mt-cost">Custo (R$)</Label>
                  <Input id="mt-cost" inputMode="decimal" placeholder="0,00" value={maintForm.maintenance_cost} onChange={(e) => setMaintForm({ ...maintForm, maintenance_cost: e.target.value })} />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="mt-by">Feita por (oficina / técnico)</Label>
              <Input id="mt-by" value={maintForm.performed_by} onChange={(e) => setMaintForm({ ...maintForm, performed_by: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mt-desc">O que foi feito</Label>
              <Textarea id="mt-desc" rows={3} value={maintForm.description} onChange={(e) => setMaintForm({ ...maintForm, description: e.target.value })} />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" disabled={saving} onClick={() => setMaintTarget(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Salvando...' : 'Registrar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Histórico */}
      <Dialog open={!!historyEq} onOpenChange={(o) => !o && setHistoryTarget(null)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Histórico de manutenções</DialogTitle>
            <DialogDescription>
              {historyEq?.name}
              {historyEq && (historyEq.initial_maintenance_count ?? 0) > 0
                ? ` · ${historyEq.initial_maintenance_count} anterior(es) ao cadastro${historyEq.last_maintenance_date ? ` (última em ${formatDate(historyEq.last_maintenance_date)})` : ''}`
                : ''}
            </DialogDescription>
          </DialogHeader>
          {historyEq && historyEq.equipment_maintenances.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Nenhuma manutenção registrada por aqui.</p>
          ) : (
            <div className="divide-y rounded-md border">
              {[...(historyEq?.equipment_maintenances ?? [])]
                .sort((a, b) => b.maintenance_date.localeCompare(a.maintenance_date))
                .map((m) => (
                  <div key={m.id} className="flex items-start justify-between gap-3 p-3 text-sm">
                    <div className="space-y-0.5">
                      <div className="font-medium">{formatDate(m.maintenance_date)}</div>
                      {m.description && <div>{m.description}</div>}
                      <div className="text-xs text-muted-foreground">
                        {[m.performed_by, canSeeValues && m.maintenance_cost ? formatCurrency(Number(m.maintenance_cost)) : null]
                          .filter(Boolean)
                          .join(' · ') || ' '}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive shrink-0" title="Excluir" onClick={() => handleDeleteMaintenance(m.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Movimentar */}
      <Dialog open={!!moveTarget} onOpenChange={(o) => !o && setMoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Movimentar equipamento</DialogTitle>
            <DialogDescription>{moveTarget?.name}: escolha a obra ou o local de destino.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleMove} className="space-y-4">
            <Select value={moveWork} onValueChange={setMoveWork}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_WORK}>Depósito (sem obra)</SelectItem>
                {works.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name.trim()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setMoveTarget(null)}>
                Cancelar
              </Button>
              <Button type="submit">Movimentar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
