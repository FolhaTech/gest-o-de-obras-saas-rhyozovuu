import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarClock, Car, Edit2, Plus, RefreshCw, Search, Trash2, Wrench } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency, formatDate, formatSupabaseError } from '@/lib/formatters'
import {
  describeExpiry,
  expiryState,
  fuelStats,
  normalizePlate,
  serviceDue,
  todayISO,
  type DueState,
} from '@/lib/vehicles'
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
import VehicleDetail, { FUEL_TYPES } from './VehicleDetail'

interface Vehicle {
  id: string
  plate: string
  brand: string | null
  model: string
  year: number | null
  color: string | null
  vehicle_type: string | null
  fuel_type: string | null
  chassis: string | null
  renavam: string | null
  odometer_km: number
  driver_id: string | null
  work_id: string | null
  status: string
  purchase_date: string | null
  purchase_value?: number | null
  insurance_expiry: string | null
  licensing_expiry: string | null
  notes: string | null
  driver?: { id: string; name: string } | null
  works?: { id: string; name: string } | null
  vehicle_maintenances: { id: string; maintenance_date: string; next_due_date: string | null; next_due_km: number | null }[]
  vehicle_fuel_receipts: { id: string; receipt_date: string; liters: number; total_value?: number | null; odometer_km: number | null }[]
}

const TYPES = ['Carro', 'Caminhonete', 'Caminhão', 'Utilitário / van', 'Moto', 'Máquina / trator', 'Reboque']
const STATUS_LABEL: Record<string, string> = { active: 'Em uso', maintenance: 'Em manutenção', inactive: 'Inativo' }
const NONE = '__none__'

const SELECT =
  '*, driver:driver_id(id, name), works:work_id(id, name), vehicle_maintenances(id, maintenance_date, next_due_date, next_due_km), vehicle_fuel_receipts(id, receipt_date, liters, total_value, odometer_km)'

const emptyForm = () => ({
  plate: '',
  brand: '',
  model: '',
  year: '',
  color: '',
  vehicle_type: TYPES[0],
  fuel_type: FUEL_TYPES[0],
  chassis: '',
  renavam: '',
  odometer_km: '0',
  driver_id: NONE,
  work_id: NONE,
  status: 'active',
  purchase_date: '',
  purchase_value: '',
  insurance_expiry: '',
  licensing_expiry: '',
  notes: '',
})

const num = (v: string) => Number((v || '0').replace(',', '.'))
const tone = (s: DueState) => (s === 'overdue' ? 'text-rose-600 font-medium' : s === 'soon' ? 'text-amber-600 font-medium' : 'text-muted-foreground')

/** Veículos da empresa: cadastro, manutenções, notas fiscais de combustível e vencimentos. */
export default function VeiculosList() {
  const { toast } = useToast()
  const { canSeeValues } = useAuth()

  const [items, setItems] = useState<Vehicle[]>([])
  const [members, setMembers] = useState<{ id: string; name: string; provider_id?: string | null }[]>([])
  const [works, setWorks] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    const [vRes, mRes, wRes] = await Promise.all([
      supabase.from('vehicles' as any).select(SELECT).order('plate', { ascending: true }),
      supabase.from('team_members').select('id, name, provider_id').eq('status', 'active').order('name'),
      supabase.from('works').select('id, name').order('name'),
    ])
    if (vRes.error) {
      setError(formatSupabaseError(vRes.error))
    } else {
      setError(null)
      setItems(
        ((vRes.data ?? []) as unknown as Vehicle[]).map((v) => ({
          ...v,
          vehicle_maintenances: v.vehicle_maintenances ?? [],
          vehicle_fuel_receipts: v.vehicle_fuel_receipts ?? [],
        })),
      )
    }
    setMembers((mRes.data ?? []) as unknown as { id: string; name: string; provider_id?: string | null }[])
    setWorks((wRes.data ?? []) as { id: string; name: string }[])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const today = todayISO()
  const rows = useMemo(
    () =>
      items.map((v) => {
        const active = v.status !== 'inactive'
        return {
          v,
          lic: active ? expiryState(v.licensing_expiry, today) : { state: 'none' as DueState, days: null },
          ins: active ? expiryState(v.insurance_expiry, today) : { state: 'none' as DueState, days: null },
          svc: active ? serviceDue(v.vehicle_maintenances, v.odometer_km, today) : serviceDue([], 0, today),
        }
      }),
    [items, today],
  )

  const visible = useMemo(() => {
    const t = search.trim().toLowerCase()
    if (!t) return rows
    return rows.filter(({ v }) =>
      [v.plate, v.brand, v.model, v.color, v.vehicle_type, v.driver?.name].some((x) => (x ?? '').toLowerCase().includes(t)),
    )
  }, [rows, search])

  const docsOverdue = rows.filter((r) => r.lic.state === 'overdue' || r.ins.state === 'overdue')
  const docsSoon = rows.filter((r) => r.lic.state === 'soon' || r.ins.state === 'soon')
  const svcOverdue = rows.filter((r) => r.svc.state === 'overdue')
  const svcSoon = rows.filter((r) => r.svc.state === 'soon')
  const activeCount = items.filter((v) => v.status !== 'inactive').length

  const monthPrefix = today.slice(0, 7)
  const monthSpent = items.reduce(
    (sum, v) => sum + fuelStats(v.vehicle_fuel_receipts.filter((r) => r.receipt_date.startsWith(monthPrefix))).spent,
    0,
  )

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm())
    setOpen(true)
  }
  const openEdit = (v: Vehicle) => {
    setEditingId(v.id)
    setForm({
      plate: v.plate,
      brand: v.brand ?? '',
      model: v.model,
      year: v.year ? String(v.year) : '',
      color: v.color ?? '',
      vehicle_type: v.vehicle_type ?? TYPES[0],
      fuel_type: v.fuel_type ?? FUEL_TYPES[0],
      chassis: v.chassis ?? '',
      renavam: v.renavam ?? '',
      odometer_km: String(v.odometer_km ?? 0),
      driver_id: v.driver_id ?? NONE,
      work_id: v.work_id ?? NONE,
      status: v.status,
      purchase_date: v.purchase_date ?? '',
      purchase_value: v.purchase_value ? String(v.purchase_value) : '',
      insurance_expiry: v.insurance_expiry ?? '',
      licensing_expiry: v.licensing_expiry ?? '',
      notes: v.notes ?? '',
    })
    setOpen(true)
  }

  const handleSave = async (ev: React.FormEvent) => {
    ev.preventDefault()
    const plate = normalizePlate(form.plate)
    const year = form.year.trim() === '' ? null : Math.round(num(form.year))
    const km = Math.round(num(form.odometer_km))
    const value = num(form.purchase_value)
    if (!plate || !form.model.trim() || !(km >= 0) || Number.isNaN(value) || value < 0 || (year !== null && (year < 1950 || year > new Date().getFullYear() + 1))) {
      toast({ title: 'Confira os dados', description: 'Informe placa, modelo, um ano válido e valores válidos.', variant: 'destructive' })
      return
    }
    if (form.purchase_date && form.purchase_date > today) {
      toast({ title: 'Data da compra inválida', description: 'A compra não pode estar no futuro.', variant: 'destructive' })
      return
    }
    const payload: Record<string, unknown> = {
      plate,
      brand: form.brand.trim() || null,
      model: form.model.trim(),
      year,
      color: form.color.trim() || null,
      vehicle_type: form.vehicle_type || null,
      fuel_type: form.fuel_type || null,
      chassis: form.chassis.trim() || null,
      renavam: form.renavam.trim() || null,
      odometer_km: km,
      driver_id: form.driver_id === NONE ? null : form.driver_id,
      work_id: form.work_id === NONE ? null : form.work_id,
      status: form.status,
      purchase_date: form.purchase_date || null,
      insurance_expiry: form.insurance_expiry || null,
      licensing_expiry: form.licensing_expiry || null,
      notes: form.notes.trim() || null,
    }
    if (canSeeValues) payload.purchase_value = value
    setSaving(true)
    const { error: err } = editingId
      ? await supabase.from('vehicles' as any).update(payload).eq('id', editingId)
      : await supabase.from('vehicles' as any).insert(payload)
    setSaving(false)
    if (err) {
      const dup = (err as { code?: string }).code === '23505'
      toast({
        title: dup ? 'Placa já cadastrada' : 'Erro ao salvar',
        description: dup ? `Já existe um veículo com a placa ${plate}.` : formatSupabaseError(err),
        variant: 'destructive',
      })
      return
    }
    toast({ title: editingId ? 'Veículo atualizado' : 'Veículo cadastrado' })
    setOpen(false)
    fetchAll()
  }

  const handleDelete = async (v: Vehicle) => {
    if (!confirm(`Excluir o veículo ${v.plate} e todo o histórico de manutenções e combustível dele?`)) return
    const { error: err } = await supabase.from('vehicles' as any).delete().eq('id', v.id)
    if (err) {
      toast({ title: 'Erro ao excluir', description: formatSupabaseError(err), variant: 'destructive' })
      return
    }
    toast({ title: 'Veículo excluído' })
    fetchAll()
  }

  const plates = (list: typeof rows) => list.map((r) => r.v.plate).join(', ')

  if (loading) return <Skeleton className="h-64 w-full" />

  if (error) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        Não foi possível carregar os veículos: {error}
        <Button variant="outline" size="sm" className="ml-3 gap-2" onClick={fetchAll}>
          <RefreshCw className="h-4 w-4" /> Tentar novamente
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Veículos</h1>
          <p className="text-muted-foreground">Frota da empresa: manutenções, notas de combustível e vencimentos.</p>
        </div>
        <Button className="gap-2 shrink-0" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Novo veículo
        </Button>
      </div>

      {(docsOverdue.length > 0 || svcOverdue.length > 0) && (
        <Alert variant="destructive">
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle>Atenção: vencidos</AlertTitle>
          <AlertDescription>
            {docsOverdue.length > 0 && <div>Documento (licenciamento ou seguro) vencido: {plates(docsOverdue)}</div>}
            {svcOverdue.length > 0 && <div>Revisão vencida: {plates(svcOverdue)}</div>}
          </AlertDescription>
        </Alert>
      )}
      {(docsSoon.length > 0 || svcSoon.length > 0) && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-900">
          <CalendarClock className="h-5 w-5 text-amber-600" />
          <AlertTitle>A vencer em breve</AlertTitle>
          <AlertDescription>
            {docsSoon.length > 0 && <div>Licenciamento ou seguro (30 dias): {plates(docsSoon)}</div>}
            {svcSoon.length > 0 && <div>Revisão próxima (30 dias ou 500 km): {plates(svcSoon)}</div>}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Veículos ativos', value: String(activeCount), cls: '' },
          { label: 'Documentos vencendo', value: String(docsOverdue.length + docsSoon.length), cls: docsOverdue.length ? 'text-rose-600' : docsSoon.length ? 'text-amber-600' : '' },
          { label: 'Revisões vencendo', value: String(svcOverdue.length + svcSoon.length), cls: svcOverdue.length ? 'text-rose-600' : svcSoon.length ? 'text-amber-600' : '' },
          ...(canSeeValues ? [{ label: 'Combustível no mês', value: formatCurrency(monthSpent), cls: '' }] : []),
        ].map((c) => (
          <Card key={c.label} className="shadow-none border">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground font-medium uppercase">{c.label}</p>
              <h3 className={`text-2xl font-bold mt-1 ${c.cls}`}>{c.value}</h3>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por placa, marca, modelo ou responsável..." className="pl-9" />
      </div>

      {items.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-card space-y-3">
          <Car className="h-10 w-10 mx-auto text-muted-foreground opacity-60" />
          <p className="text-sm text-muted-foreground">Nenhum veículo cadastrado ainda.</p>
          <Button size="sm" onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" /> Novo veículo
          </Button>
        </div>
      ) : (
        <div className="rounded-md border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Placa</TableHead>
                <TableHead>Veículo</TableHead>
                <TableHead>Responsável / obra</TableHead>
                <TableHead className="text-right">Km</TableHead>
                <TableHead>Licenciamento</TableHead>
                <TableHead>Seguro</TableHead>
                <TableHead>Revisão</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-6 text-center text-muted-foreground">
                    Nenhum veículo encontrado.
                  </TableCell>
                </TableRow>
              )}
              {visible.map(({ v, lic, ins, svc }) => (
                <TableRow key={v.id} className={v.status === 'inactive' ? 'opacity-60' : ''}>
                  <TableCell className="font-mono font-semibold whitespace-nowrap">{v.plate}</TableCell>
                  <TableCell>
                    <div className="font-medium">{[v.brand, v.model].filter(Boolean).join(' ')}</div>
                    <div className="text-xs text-muted-foreground">
                      {[v.year, v.color, v.vehicle_type, v.fuel_type].filter(Boolean).join(' · ')}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>{v.driver?.name?.trim() ?? '-'}</div>
                    <div className="text-xs text-muted-foreground">{v.works?.name?.trim() ?? 'Sem obra'}</div>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">{v.odometer_km.toLocaleString('pt-BR')}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {v.licensing_expiry ? formatDate(v.licensing_expiry) : '-'}
                    {lic.state !== 'none' && <div className={`text-[10px] ${tone(lic.state)}`}>{describeExpiry(lic.days)}</div>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {v.insurance_expiry ? formatDate(v.insurance_expiry) : '-'}
                    {ins.state !== 'none' && <div className={`text-[10px] ${tone(ins.state)}`}>{describeExpiry(ins.days)}</div>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {svc.state === 'none' ? (
                      <span className="text-muted-foreground">-</span>
                    ) : (
                      <>
                        {[svc.nextDate ? formatDate(svc.nextDate) : null, svc.nextKm !== null ? `${svc.nextKm.toLocaleString('pt-BR')} km` : null].filter(Boolean).join(' / ')}
                        <div className={`text-[10px] ${tone(svc.state)}`}>
                          {svc.state === 'overdue' ? 'vencida' : svc.state === 'soon' ? 'próxima' : 'em dia'}
                        </div>
                      </>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-normal">{STATUS_LABEL[v.status] ?? v.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Manutenções e combustível" onClick={() => setDetailId(v.id)}>
                      <Wrench className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar" onClick={() => openEdit(v)}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" title="Excluir" onClick={() => handleDelete(v)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <VehicleDetail vehicleId={detailId} onClose={() => setDetailId(null)} onChanged={fetchAll} />

      {/* Novo / editar veículo */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar veículo' : 'Novo veículo'}</DialogTitle>
            <DialogDescription>Dados do veículo, documentos e responsável.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="vh-plate">Placa *</Label>
                <Input id="vh-plate" required value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value.toUpperCase() })} placeholder="ABC1D23" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vh-brand">Marca</Label>
                <Input id="vh-brand" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="Ex.: Fiat" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vh-model">Modelo *</Label>
                <Input id="vh-model" required value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="Ex.: Strada" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vh-year">Ano</Label>
                <Input id="vh-year" type="number" min="1950" step="1" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} placeholder="2022" />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={form.vehicle_type} onValueChange={(v) => setForm({ ...form, vehicle_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Combustível</Label>
                <Select value={form.fuel_type} onValueChange={(v) => setForm({ ...form, fuel_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{FUEL_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="vh-color">Cor</Label>
                <Input id="vh-color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vh-km">Km atual</Label>
                <Input id="vh-km" type="number" min="0" step="1" value={form.odometer_km} onChange={(e) => setForm({ ...form, odometer_km: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="vh-chassis">Chassi</Label>
                <Input id="vh-chassis" value={form.chassis} onChange={(e) => setForm({ ...form, chassis: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vh-renavam">Renavam</Label>
                <Input id="vh-renavam" value={form.renavam} onChange={(e) => setForm({ ...form, renavam: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Responsável (motorista)</Label>
                <Select value={form.driver_id} onValueChange={(v) => setForm({ ...form, driver_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sem responsável</SelectItem>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name.trim()}
                        {m.provider_id ? ' · Prestador' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Obra atual</Label>
                <Select value={form.work_id} onValueChange={(v) => setForm({ ...form, work_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sem obra</SelectItem>
                    {works.map((w) => <SelectItem key={w.id} value={w.id}>{w.name.trim()}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Situação</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Em uso</SelectItem>
                    <SelectItem value="maintenance">Em manutenção</SelectItem>
                    <SelectItem value="inactive">Inativo (vendido/baixado)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className={`grid gap-4 ${canSeeValues ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-1 sm:grid-cols-3'}`}>
              <div className="space-y-2">
                <Label htmlFor="vh-lic">Vencimento do licenciamento</Label>
                <Input id="vh-lic" type="date" value={form.licensing_expiry} onChange={(e) => setForm({ ...form, licensing_expiry: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vh-ins">Vencimento do seguro</Label>
                <Input id="vh-ins" type="date" value={form.insurance_expiry} onChange={(e) => setForm({ ...form, insurance_expiry: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vh-pd">Comprado em</Label>
                <Input id="vh-pd" type="date" max={today} value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} />
              </div>
              {canSeeValues && (
                <div className="space-y-2">
                  <Label htmlFor="vh-pv">Valor da compra (R$)</Label>
                  <Input id="vh-pv" inputMode="decimal" placeholder="0,00" value={form.purchase_value} onChange={(e) => setForm({ ...form, purchase_value: e.target.value })} />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="vh-notes">Observações</Label>
              <Textarea id="vh-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Cadastrar'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
