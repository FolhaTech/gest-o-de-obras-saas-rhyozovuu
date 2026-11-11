import { useCallback, useEffect, useMemo, useState } from 'react'
import { Clock, Edit2, Hammer, LogIn, LogOut, Package, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import { formatDate, formatSupabaseError } from '@/lib/formatters'
import { clockTime, formatDuration, stayMs, toIsoFromLocal, toTimeInput, totalStayMs } from '@/lib/work-clock'
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

const SERVICE_TYPES = [
  'Diarista',
  'Piscineiro',
  'Jardineiro',
  'Eletricista',
  'Encanador',
  'Pintor',
  'Pedreiro',
  'Limpeza',
  'Dedetização',
  'Outro',
]
const OTHER = 'Outro'

interface UsedMaterial {
  id: string
  material_id: string | null
  material_name: string
  unit: string
  quantity: number
}
interface Maintenance {
  id: string
  work_id: string
  maintenance_date: string
  service_type: string
  performed_by: string | null
  notes: string | null
  status: 'in_progress' | 'done'
  check_in_at: string | null
  check_out_at: string | null
  created_by: string | null
  works?: { id: string; name: string } | null
  creator?: { full_name: string | null; email: string | null } | null
  house_maintenance_materials: UsedMaterial[]
}
interface Stock {
  id: string
  name: string
  unit: string
  stock: number
}
interface Line {
  key: number
  material_id: string
  quantity: string
}

const SELECT =
  '*, works:work_id(id, name), creator:created_by(full_name, email), house_maintenance_materials(id, material_id, material_name, unit, quantity)'

const todayISO = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
const num = (v: string) => Number((v || '0').replace(',', '.'))
const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 })

let lineKey = 0
const newLine = (): Line => ({ key: ++lineKey, material_id: '', quantity: '' })

/**
 * Manutenção das casas (diarista, piscineiro, jardineiro...): o colaborador registra a data, a casa e os materiais
 * usados; cada material dá baixa no estoque (o banco recusa se faltar e devolve ao estoque se o registro for excluído).
 */
export default function ManutencaoList() {
  const { toast } = useToast()
  const { user, profile, role } = useAuth()
  const isStaff = role !== 'prestador'

  const [items, setItems] = useState<Maintenance[]>([])
  const [works, setWorks] = useState<{ id: string; name: string }[]>([])
  const [stock, setStock] = useState<Stock[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [workFilter, setWorkFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [search, setSearch] = useState('')

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Maintenance | null>(null)
  const emptyForm = () => ({ date: todayISO(), work_id: '', type: SERVICE_TYPES[0], custom: '', performed_by: '', notes: '', time_in: '', time_out: '' })
  const [form, setForm] = useState(emptyForm())
  const [checkInOpen, setCheckInOpen] = useState(false)
  // relógio: atualiza a cada 30 s para o tempo dos check-ins em andamento
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  const [lines, setLines] = useState<Line[]>([newLine()])
  const [saving, setSaving] = useState(false)

  const fetchAll = useCallback(async () => {
    const [mRes, wRes, sRes] = await Promise.all([
      supabase.from('house_maintenances' as any).select(SELECT).order('maintenance_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('works').select('id, name').order('name'),
      supabase.from('materials').select('id, name, unit_of_measure, unidade_nativa, stock_quantity').order('name'),
    ])
    if (mRes.error) {
      setError(formatSupabaseError(mRes.error))
    } else {
      setError(null)
      setItems(
        ((mRes.data ?? []) as unknown as Maintenance[]).map((m) => ({
          ...m,
          house_maintenance_materials: m.house_maintenance_materials ?? [],
        })),
      )
    }
    setWorks((wRes.data ?? []) as { id: string; name: string }[])
    setStock(
      ((sRes.data ?? []) as any[]).map((m) => ({
        id: m.id,
        name: m.name,
        unit: (m.unit_of_measure || m.unidade_nativa || 'un').trim(),
        stock: Number(m.stock_quantity) || 0,
      })),
    )
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const stockOf = (id: string) => stock.find((s) => s.id === id)

  const visible = useMemo(() => {
    const t = search.trim().toLowerCase()
    return items.filter((m) => {
      if (workFilter !== 'all' && m.work_id !== workFilter) return false
      if (typeFilter !== 'all' && m.service_type !== typeFilter) return false
      if (!t) return true
      return (
        m.service_type.toLowerCase().includes(t) ||
        (m.performed_by ?? '').toLowerCase().includes(t) ||
        (m.works?.name ?? '').toLowerCase().includes(t) ||
        m.house_maintenance_materials.some((x) => x.material_name.toLowerCase().includes(t))
      )
    })
  }, [items, workFilter, typeFilter, search])

  const monthPrefix = todayISO().slice(0, 7)
  const thisMonth = items.filter((m) => m.maintenance_date.startsWith(monthPrefix))
  const housesServed = new Set(thisMonth.map((m) => m.work_id)).size
  const openNow = items.filter((m) => m.status === 'in_progress')
  const monthStay = totalStayMs(thisMonth)
  const typeOptions = useMemo(() => Array.from(new Set(items.map((m) => m.service_type))).sort(), [items])
  const canChange = (m: Maintenance) => isStaff || m.created_by === user?.id

  // quanto já está pedido de cada material neste formulário (para conferir o estoque antes de salvar)
  const requested = useMemo(() => {
    const map = new Map<string, number>()
    lines.forEach((l) => {
      if (l.material_id) map.set(l.material_id, (map.get(l.material_id) ?? 0) + num(l.quantity))
    })
    return map
  }, [lines])

  const openCreate = () => {
    setEditing(null)
    setForm({ ...emptyForm(), performed_by: profile?.full_name?.trim() ?? '' })
    setLines([newLine()])
    setOpen(true)
  }
  const openCheckIn = () => {
    setForm({ ...emptyForm(), performed_by: profile?.full_name?.trim() ?? '' })
    setCheckInOpen(true)
  }
  const openEdit = (m: Maintenance) => {
    setEditing(m)
    const preset = SERVICE_TYPES.includes(m.service_type)
    setForm({
      date: m.maintenance_date,
      work_id: m.work_id,
      type: preset ? m.service_type : OTHER,
      custom: preset ? '' : m.service_type,
      performed_by: m.performed_by ?? '',
      notes: m.notes ?? '',
      time_in: toTimeInput(m.check_in_at),
      time_out: toTimeInput(m.check_out_at),
    })
    setLines([newLine()])
    setOpen(true)
  }

  const setLine = (key: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  const handleSave = async (ev: React.FormEvent) => {
    ev.preventDefault()
    const serviceType = form.type === OTHER ? form.custom.trim() : form.type
    const filled = lines.filter((l) => l.material_id || l.quantity.trim())
    if (!form.work_id || !serviceType || !form.date) {
      toast({ title: 'Confira os dados', description: 'Informe a data, a casa e o tipo de manutenção.', variant: 'destructive' })
      return
    }
    if (form.date > todayISO()) {
      toast({ title: 'Data inválida', description: 'A manutenção não pode estar no futuro.', variant: 'destructive' })
      return
    }
    // horários à mão (registro retroativo ou correção)
    const inChanged = form.time_in !== (editing ? toTimeInput(editing.check_in_at) : '')
    const outChanged = form.time_out !== (editing ? toTimeInput(editing.check_out_at) : '')
    if (form.time_out && !form.time_in) {
      toast({ title: 'Horário incompleto', description: 'Informe também a hora de entrada.', variant: 'destructive' })
      return
    }
    const inIso = form.time_in ? toIsoFromLocal(form.date, form.time_in) : null
    const outIso = form.time_out ? toIsoFromLocal(form.date, form.time_out) : null
    if (inIso && outIso && Date.parse(outIso) < Date.parse(inIso)) {
      toast({ title: 'Horário inválido', description: 'A saída não pode ser antes da entrada.', variant: 'destructive' })
      return
    }
    if ((inIso && Date.parse(inIso) > Date.now() + 5 * 60_000) || (outIso && Date.parse(outIso) > Date.now() + 5 * 60_000)) {
      toast({ title: 'Horário inválido', description: 'O horário não pode estar no futuro.', variant: 'destructive' })
      return
    }
    for (const l of filled) {
      if (!l.material_id || !(num(l.quantity) > 0)) {
        toast({ title: 'Material incompleto', description: 'Escolha o material e informe uma quantidade maior que zero (ou remova a linha).', variant: 'destructive' })
        return
      }
    }
    for (const [id, qty] of requested) {
      const s = stockOf(id)
      if (s && qty > s.stock) {
        toast({ title: 'Estoque insuficiente', description: `"${s.name}": disponível ${fmt(s.stock)} ${s.unit}, você informou ${fmt(qty)} ${s.unit}.`, variant: 'destructive' })
        return
      }
    }

    setSaving(true)
    let maintenanceId = editing?.id ?? ''
    if (editing) {
      const { error: err } = await supabase
        .from('house_maintenances' as any)
        .update({
          work_id: form.work_id,
          maintenance_date: form.date,
          service_type: serviceType,
          performed_by: form.performed_by.trim() || null,
          notes: form.notes.trim() || null,
          ...(inChanged ? { check_in_at: inIso } : {}),
          ...(outChanged ? { check_out_at: outIso } : {}),
          ...(outChanged && outIso ? { status: 'done' } : {}),
        })
        .eq('id', editing.id)
      if (err) {
        setSaving(false)
        toast({ title: 'Erro ao salvar', description: formatSupabaseError(err), variant: 'destructive' })
        return
      }
    } else {
      const { data, error: err } = await supabase
        .from('house_maintenances' as any)
        .insert({
          work_id: form.work_id,
          maintenance_date: form.date,
          service_type: serviceType,
          performed_by: form.performed_by.trim() || null,
          notes: form.notes.trim() || null,
          // só entrada: fica em andamento (faz o check-out depois); entrada e saída: concluída
          status: inIso && !outIso ? 'in_progress' : 'done',
          check_in_at: inIso,
          check_out_at: outIso,
        })
        .select('id')
        .single()
      if (err) {
        setSaving(false)
        toast({ title: 'Erro ao salvar', description: formatSupabaseError(err), variant: 'destructive' })
        return
      }
      maintenanceId = (data as unknown as { id: string }).id
    }

    if (filled.length > 0) {
      // um único comando: ou entram todos os materiais (e baixam do estoque) ou nenhum
      const { error: matErr } = await supabase.from('house_maintenance_materials' as any).insert(
        filled.map((l) => ({ maintenance_id: maintenanceId, material_id: l.material_id, quantity: num(l.quantity) })),
      )
      if (matErr) {
        // desfaz a manutenção recém-criada para não ficar registro sem os materiais
        if (!editing) await supabase.from('house_maintenances' as any).delete().eq('id', maintenanceId)
        setSaving(false)
        toast({ title: 'Não foi possível lançar os materiais', description: formatSupabaseError(matErr), variant: 'destructive' })
        await fetchAll()
        return
      }
    }
    setSaving(false)
    toast({
      title: editing ? 'Manutenção atualizada' : 'Manutenção registrada',
      description: filled.length ? `${filled.length} material(is) deram baixa no estoque.` : undefined,
    })
    setOpen(false)
    fetchAll()
  }

  /** Check-in agora: a hora de entrada é a do servidor. */
  const handleCheckIn = async (ev: React.FormEvent) => {
    ev.preventDefault()
    const serviceType = form.type === OTHER ? form.custom.trim() : form.type
    if (!form.work_id || !serviceType) {
      toast({ title: 'Confira os dados', description: 'Escolha a casa e o tipo de manutenção.', variant: 'destructive' })
      return
    }
    const mine = items.find((m) => m.status === 'in_progress' && m.created_by === user?.id)
    if (mine && !confirm(`Você já tem um check-in em andamento em ${mine.works?.name?.trim() ?? 'outra casa'}. Fazer outro mesmo assim?`)) return
    setSaving(true)
    const { data, error: err } = await supabase
      .from('house_maintenances' as any)
      .insert({
        work_id: form.work_id,
        maintenance_date: todayISO(),
        service_type: serviceType,
        performed_by: form.performed_by.trim() || null,
        status: 'in_progress',
      })
      .select('check_in_at')
      .single()
    setSaving(false)
    if (err) {
      toast({ title: 'Não foi possível fazer o check-in', description: formatSupabaseError(err), variant: 'destructive' })
      return
    }
    toast({
      title: `Check-in feito às ${clockTime((data as unknown as { check_in_at: string }).check_in_at)}`,
      description: 'Quando terminar, faça o check-out. Os materiais usados podem ser lançados em Editar.',
    })
    setCheckInOpen(false)
    fetchAll()
  }

  /** Check-out agora: a hora de saída é a do servidor. */
  const handleCheckOut = async (m: Maintenance) => {
    const { data, error: err } = await supabase
      .from('house_maintenances' as any)
      .update({ status: 'done' })
      .eq('id', m.id)
      .select('check_in_at, check_out_at, status')
      .single()
    if (err) {
      toast({ title: 'Não foi possível fazer o check-out', description: formatSupabaseError(err), variant: 'destructive' })
      return
    }
    const row = data as unknown as { check_in_at: string | null; check_out_at: string | null; status: string }
    const ms = stayMs(row)
    toast({
      title: `Check-out feito às ${clockTime(row.check_out_at)}`,
      description: ms !== null ? `Ficou ${formatDuration(ms)} em ${m.works?.name?.trim() ?? 'casa'} (entrada às ${clockTime(row.check_in_at)}).` : undefined,
    })
    fetchAll()
  }

  const removeLine = async (line: UsedMaterial) => {
    if (!confirm(`Remover "${line.material_name}" (${fmt(Number(line.quantity))} ${line.unit}) desta manutenção? A quantidade volta ao estoque.`)) return
    const { error: err } = await supabase.from('house_maintenance_materials' as any).delete().eq('id', line.id)
    if (err) {
      toast({ title: 'Erro ao remover', description: formatSupabaseError(err), variant: 'destructive' })
      return
    }
    toast({ title: 'Material removido e devolvido ao estoque' })
    // atualiza a manutenção aberta na edição e as listas
    setEditing((cur) =>
      cur ? { ...cur, house_maintenance_materials: cur.house_maintenance_materials.filter((x) => x.id !== line.id) } : cur,
    )
    fetchAll()
  }

  const handleDelete = async (m: Maintenance) => {
    const used = m.house_maintenance_materials.length
    const msg = `Excluir a manutenção de ${m.service_type} em ${m.works?.name?.trim() ?? 'casa'} (${formatDate(m.maintenance_date)})?${used ? `\n\nOs ${used} material(is) usado(s) voltam ao estoque.` : ''}`
    if (!confirm(msg)) return
    const { error: err } = await supabase.from('house_maintenances' as any).delete().eq('id', m.id)
    if (err) {
      toast({ title: 'Erro ao excluir', description: formatSupabaseError(err), variant: 'destructive' })
      return
    }
    toast({ title: 'Manutenção excluída', description: used ? 'Os materiais voltaram ao estoque.' : undefined })
    fetchAll()
  }

  if (loading) return <Skeleton className="h-64 w-full" />

  if (error) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        Não foi possível carregar as manutenções: {error}
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
          <h1 className="text-3xl font-bold tracking-tight">Manutenção</h1>
          <p className="text-muted-foreground">
            Manutenção das casas (diarista, piscineiro, jardineiro...) e materiais usados, com baixa no estoque.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button className="gap-2" onClick={openCheckIn}>
            <LogIn className="h-4 w-4" /> Fazer check-in
          </Button>
          <Button variant="outline" className="gap-2" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Registrar manutenção
          </Button>
        </div>
      </div>

      {!isStaff && (
        <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
          Você vê e altera somente as manutenções que registrou.
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Em andamento agora', value: String(openNow.length), cls: openNow.length ? 'text-amber-600' : '' },
          { label: 'Manutenções no mês', value: String(thisMonth.length), cls: '' },
          { label: 'Horas trabalhadas no mês', value: monthStay > 0 ? formatDuration(monthStay) : '-', cls: '' },
          { label: 'Casas atendidas no mês', value: String(housesServed), cls: '' },
        ].map((c) => (
          <Card key={c.label} className="shadow-none border">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground font-medium uppercase">{c.label}</p>
              <h3 className={`text-2xl font-bold mt-1 ${c.cls}`}>{c.value}</h3>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por casa, tipo, quem fez ou material..." className="pl-9" />
        </div>
        <Select value={workFilter} onValueChange={setWorkFilter}>
          <SelectTrigger className="md:w-52"><SelectValue placeholder="Casa" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as casas</SelectItem>
            {works.map((w) => <SelectItem key={w.id} value={w.id}>{w.name.trim()}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="md:w-52"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {typeOptions.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-card space-y-3">
          <Hammer className="h-10 w-10 mx-auto text-muted-foreground opacity-60" />
          <p className="text-sm text-muted-foreground">Nenhuma manutenção registrada ainda.</p>
          <Button size="sm" onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" /> Registrar manutenção
          </Button>
        </div>
      ) : (
        <div className="rounded-md border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Casa</TableHead>
                <TableHead>Manutenção</TableHead>
                <TableHead>Entrada / saída</TableHead>
                <TableHead>Materiais utilizados</TableHead>
                <TableHead>Registrado por</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">Nenhuma manutenção encontrada.</TableCell>
                </TableRow>
              )}
              {visible.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap font-medium">{formatDate(m.maintenance_date)}</TableCell>
                  <TableCell>{m.works?.name?.trim() ?? '-'}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-normal">{m.service_type}</Badge>
                    {m.performed_by && <div className="text-xs text-muted-foreground mt-0.5">{m.performed_by}</div>}
                    {m.notes && <div className="text-xs mt-0.5 max-w-xs">{m.notes}</div>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {m.status === 'in_progress' ? (
                      <div className="space-y-0.5">
                        <Badge className="gap-1 bg-amber-100 text-amber-800 hover:bg-amber-100 font-normal">
                          <Clock className="h-3 w-3" /> Em andamento
                        </Badge>
                        <div className="text-xs">Entrada {clockTime(m.check_in_at)}</div>
                        <div className="text-xs font-medium text-amber-700">há {formatDuration(stayMs(m, now) ?? 0)}</div>
                      </div>
                    ) : m.check_in_at ? (
                      <div className="space-y-0.5">
                        <div className="text-xs">Entrada {clockTime(m.check_in_at)}</div>
                        <div className="text-xs">Saída {m.check_out_at ? clockTime(m.check_out_at) : '-'}</div>
                        {stayMs(m) !== null && <div className="text-xs font-medium text-emerald-700">Ficou {formatDuration(stayMs(m) as number)}</div>}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Sem horário</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {m.house_maintenance_materials.length === 0 ? (
                      <span className="text-muted-foreground">-</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {m.house_maintenance_materials.map((x) => (
                          <Badge key={x.id} variant="outline" className="font-normal gap-1">
                            <Package className="h-3 w-3" /> {x.material_name} · {fmt(Number(x.quantity))} {x.unit}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{m.creator?.full_name?.trim() || m.creator?.email || '-'}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {canChange(m) && (
                      <>
                        {m.status === 'in_progress' && (
                          <Button variant="outline" size="sm" className="h-8 gap-1 mr-1" title="Fazer check-out agora" onClick={() => handleCheckOut(m)}>
                            <LogOut className="h-4 w-4" /> Check-out
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar" onClick={() => openEdit(m)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" title="Excluir" onClick={() => handleDelete(m)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={checkInOpen} onOpenChange={setCheckInOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fazer check-in</DialogTitle>
            <DialogDescription>A hora de entrada é registrada agora, pelo sistema.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCheckIn} className="space-y-4">
            <div className="space-y-2">
              <Label>Casa *</Label>
              <Select value={form.work_id} onValueChange={(v) => setForm({ ...form, work_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione a casa" /></SelectTrigger>
                <SelectContent>
                  {works.map((w) => <SelectItem key={w.id} value={w.id}>{w.name.trim()}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo de manutenção *</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SERVICE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              {form.type === OTHER && (
                <Input required value={form.custom} onChange={(e) => setForm({ ...form, custom: e.target.value })} placeholder="Qual manutenção?" />
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="ci-by">Quem vai fazer</Label>
              <Input id="ci-by" value={form.performed_by} onChange={(e) => setForm({ ...form, performed_by: e.target.value })} placeholder="Nome da diarista, piscineiro..." />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" disabled={saving} onClick={() => setCheckInOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving} className="gap-2">
                <LogIn className="h-4 w-4" /> {saving ? 'Registrando...' : 'Fazer check-in agora'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar manutenção' : 'Registrar manutenção'}</DialogTitle>
            <DialogDescription>
              Informe a data, a casa e os materiais usados. Cada material dá baixa no estoque.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="mn-date">Data da manutenção *</Label>
                <Input id="mn-date" type="date" required max={todayISO()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Casa *</Label>
                <Select value={form.work_id} onValueChange={(v) => setForm({ ...form, work_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione a casa" /></SelectTrigger>
                  <SelectContent>
                    {works.map((w) => <SelectItem key={w.id} value={w.id}>{w.name.trim()}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo de manutenção *</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SERVICE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
                {form.type === OTHER && (
                  <Input required value={form.custom} onChange={(e) => setForm({ ...form, custom: e.target.value })} placeholder="Qual manutenção?" />
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="mn-by">Quem fez</Label>
                <Input id="mn-by" value={form.performed_by} onChange={(e) => setForm({ ...form, performed_by: e.target.value })} placeholder="Nome de quem executou" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="mn-in">Hora de entrada</Label>
                <Input id="mn-in" type="time" value={form.time_in} onChange={(e) => setForm({ ...form, time_in: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mn-out">Hora de saída</Label>
                <Input id="mn-out" type="time" value={form.time_out} onChange={(e) => setForm({ ...form, time_out: e.target.value })} />
              </div>
              <p className="col-span-2 text-xs text-muted-foreground -mt-2">
                Opcional. Para registrar na hora, use o botão &quot;Fazer check-in&quot;: a hora vem do sistema. Só a entrada deixa a manutenção em andamento.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mn-notes">Observações</Label>
              <Textarea id="mn-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="O que foi feito" />
            </div>

            {editing && editing.house_maintenance_materials.length > 0 && (
              <div className="space-y-2">
                <Label>Materiais já lançados</Label>
                <div className="divide-y rounded-md border text-sm">
                  {editing.house_maintenance_materials.map((x) => (
                    <div key={x.id} className="flex items-center justify-between gap-2 p-2.5">
                      <span>{x.material_name} · {fmt(Number(x.quantity))} {x.unit}</span>
                      <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 hover:text-destructive" onClick={() => removeLine(x)}>
                        <Trash2 className="h-3.5 w-3.5" /> Remover
                      </Button>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Para corrigir a quantidade, remova o material (ele volta ao estoque) e lance de novo.</p>
              </div>
            )}

            <div className="space-y-2">
              <Label>{editing ? 'Adicionar materiais utilizados' : 'Materiais utilizados'}</Label>
              {stock.length === 0 ? (
                <p className="text-xs text-muted-foreground rounded-md border border-dashed p-3">
                  Nenhum material cadastrado no estoque ainda. Cadastre em Materiais para controlar o uso.
                </p>
              ) : (
                <div className="space-y-2">
                  {lines.map((l) => {
                    const s = l.material_id ? stockOf(l.material_id) : undefined
                    const asked = l.material_id ? requested.get(l.material_id) ?? 0 : 0
                    const over = !!s && asked > s.stock
                    return (
                      <div key={l.key} className="space-y-1">
                        <div className="flex gap-2">
                          <Select value={l.material_id} onValueChange={(v) => setLine(l.key, { material_id: v })}>
                            <SelectTrigger className="flex-1"><SelectValue placeholder="Material do estoque" /></SelectTrigger>
                            <SelectContent>
                              {stock.map((m) => (
                                <SelectItem key={m.id} value={m.id} disabled={m.stock <= 0}>
                                  {m.name} — {fmt(m.stock)} {m.unit}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            className="w-28 text-right"
                            inputMode="decimal"
                            placeholder="Qtd."
                            value={l.quantity}
                            onChange={(e) => setLine(l.key, { quantity: e.target.value })}
                          />
                          {s && <span className="self-center text-xs text-muted-foreground w-10">{s.unit}</span>}
                          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" title="Remover linha" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [newLine()]))}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                        {s && (
                          <p className={`text-xs ${over ? 'text-rose-600 font-medium' : 'text-muted-foreground'}`}>
                            {over
                              ? `Estoque insuficiente: disponível ${fmt(s.stock)} ${s.unit}, você informou ${fmt(asked)} ${s.unit}.`
                              : `Disponível: ${fmt(s.stock)} ${s.unit}${num(l.quantity) > 0 ? ` → sobram ${fmt(s.stock - asked)} ${s.unit}` : ''}`}
                          </p>
                        )}
                      </div>
                    )
                  })}
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setLines((ls) => [...ls, newLine()])}>
                    <Plus className="h-4 w-4" /> Adicionar outro material
                  </Button>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Registrar'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
