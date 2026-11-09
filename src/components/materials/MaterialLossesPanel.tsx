import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Edit2, PackageX, Plus, RefreshCw, Trash2, Wallet } from 'lucide-react'
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

type Reason = 'quebra' | 'desperdicio' | 'furto' | 'clima' | 'erro_execucao' | 'vencimento' | 'outro'

const REASONS: Record<Reason, string> = {
  quebra: 'Quebra / avaria',
  desperdicio: 'Desperdício / sobra de corte',
  furto: 'Furto / extravio',
  clima: 'Chuva / clima',
  erro_execucao: 'Erro de execução',
  vencimento: 'Vencimento / validade',
  outro: 'Outro',
}

interface Loss {
  id: string
  work_id: string | null
  material_id: string | null
  material_name: string
  quantity: number
  unit: string
  unit_cost: number
  reason: Reason
  loss_date: string
  notes: string | null
  created_by: string | null
  works?: { id: string; name: string } | null
  reporter?: { full_name: string | null; email: string | null } | null
}

interface CatalogItem {
  id: string
  name: string
  unit_of_measure: string | null
  unidade_nativa: string | null
  unit_price: number | null
}

const UNITS = ['un', 'kg', 'saco', 'm', 'm²', 'm³', 'l', 'lata', 'barra', 'milheiro']

const emptyForm = () => ({
  work_id: 'none',
  material_id: 'other',
  material_name: '',
  quantity: '',
  unit: 'un',
  unit_cost: '',
  reason: 'quebra' as Reason,
  loss_date: localISODate(),
  notes: '',
})

const num = (v: string) => Number((v || '0').replace(',', '.'))
const total = (l: Pick<Loss, 'quantity' | 'unit_cost'>) => Number(l.quantity) * Number(l.unit_cost)

/**
 * Controle de perdas de materiais. Com obraId, mostra e registra só as perdas dessa obra;
 * sem obraId (página Materiais), mostra todas e permite escolher a obra.
 * O Prestador registra e vê as perdas, mas não vê valores em dinheiro.
 */
export default function MaterialLossesPanel({ obraId }: { obraId?: string }) {
  const { toast } = useToast()
  const { user, role } = useAuth()
  const showMoney = role !== 'prestador'

  const [losses, setLosses] = useState<Loss[]>([])
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [works, setWorks] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [reasonFilter, setReasonFilter] = useState('all')
  const [workFilter, setWorkFilter] = useState('all')

  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('material_losses' as any)
      .select('*, works:work_id(id, name), reporter:created_by(full_name, email)')
      .order('loss_date', { ascending: false })
      .order('created_at', { ascending: false })
    if (obraId) query = query.eq('work_id', obraId)
    const [lossRes, matRes, workRes] = await Promise.all([
      query,
      supabase
        .from('materials')
        .select('id, name, unit_of_measure, unidade_nativa, unit_price')
        .order('name'),
      obraId
        ? Promise.resolve({ data: [] as { id: string; name: string }[] })
        : supabase.from('works').select('id, name').order('name'),
    ])
    if (lossRes.error) {
      setError(formatSupabaseError(lossRes.error))
      setLosses([])
    } else {
      setError(null)
      setLosses((lossRes.data ?? []) as unknown as Loss[])
    }
    setCatalog((matRes.data ?? []) as unknown as CatalogItem[])
    setWorks((workRes.data ?? []) as { id: string; name: string }[])
    setLoading(false)
  }, [obraId])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const visible = useMemo(
    () =>
      losses.filter(
        (l) =>
          (reasonFilter === 'all' || l.reason === reasonFilter) &&
          (obraId ||
            workFilter === 'all' ||
            (workFilter === 'none' ? !l.work_id : l.work_id === workFilter)),
      ),
    [losses, reasonFilter, workFilter, obraId],
  )

  const summary = useMemo(() => {
    const byReason: Record<string, number> = {}
    let value = 0
    for (const l of visible) {
      value += total(l)
      byReason[l.reason] = (byReason[l.reason] ?? 0) + (showMoney ? total(l) : 1)
    }
    const top = Object.entries(byReason).sort((a, b) => b[1] - a[1])[0]
    return { count: visible.length, value, topReason: top ? REASONS[top[0] as Reason] : '-' }
  }, [visible, showMoney])

  const canManage = (l: Loss) => role !== 'prestador' || l.created_by === user?.id

  const openCreate = () => {
    setEditingId(null)
    setForm({ ...emptyForm(), work_id: obraId ?? 'none' })
    setOpen(true)
  }

  const openEdit = (l: Loss) => {
    setEditingId(l.id)
    setForm({
      work_id: l.work_id ?? 'none',
      material_id: l.material_id ?? 'other',
      material_name: l.material_name,
      quantity: String(l.quantity),
      unit: l.unit,
      unit_cost: String(l.unit_cost),
      reason: l.reason,
      loss_date: l.loss_date,
      notes: l.notes ?? '',
    })
    setOpen(true)
  }

  const pickMaterial = (id: string) => {
    if (id === 'other') return setForm({ ...form, material_id: 'other' })
    const m = catalog.find((x) => x.id === id)
    setForm({
      ...form,
      material_id: id,
      material_name: m?.name ?? form.material_name,
      unit: m?.unidade_nativa || m?.unit_of_measure || form.unit,
      unit_cost: m?.unit_price != null ? String(m.unit_price) : form.unit_cost,
    })
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    const quantity = num(form.quantity)
    const cost = num(form.unit_cost)
    if (!form.material_name.trim() || !(quantity > 0) || Number.isNaN(cost) || cost < 0) {
      toast({ title: 'Confira os dados', description: 'Informe o material e uma quantidade válida.', variant: 'destructive' })
      return
    }
    const payload = {
      work_id: form.work_id === 'none' ? null : form.work_id,
      material_id: form.material_id === 'other' ? null : form.material_id,
      material_name: form.material_name.trim(),
      quantity,
      unit: form.unit,
      unit_cost: cost,
      reason: form.reason,
      loss_date: form.loss_date,
      notes: form.notes.trim() || null,
    }
    setSaving(true)
    const { error: err } = editingId
      ? await supabase.from('material_losses' as any).update(payload).eq('id', editingId)
      : await supabase.from('material_losses' as any).insert(payload)
    setSaving(false)
    if (err) {
      toast({ title: 'Erro ao salvar', description: formatSupabaseError(err), variant: 'destructive' })
      return
    }
    toast({ title: editingId ? 'Perda atualizada' : 'Perda registrada' })
    setOpen(false)
    fetchAll()
  }

  const handleDelete = async (l: Loss) => {
    if (!confirm(`Excluir o registro de perda de "${l.material_name}"?`)) return
    const { error: err } = await supabase.from('material_losses' as any).delete().eq('id', l.id)
    if (err) {
      toast({ title: 'Erro ao excluir', description: formatSupabaseError(err), variant: 'destructive' })
      return
    }
    toast({ title: 'Registro excluído' })
    fetchAll()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <PackageX className="h-5 w-5 text-primary" /> Controle de Perdas de Materiais
          </h3>
          <p className="text-xs text-muted-foreground">
            Registre materiais quebrados, desperdiçados, extraviados ou perdidos por qualquer motivo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchAll} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Atualizar
          </Button>
          <Button size="sm" onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" /> Registrar perda
          </Button>
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-3 ${showMoney ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        <Card className="shadow-none border">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase">Registros de perda</p>
              <h3 className="text-2xl font-bold mt-1">{summary.count}</h3>
            </div>
            <div className="p-2.5 rounded-full bg-rose-500/10 text-rose-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
        {showMoney && (
          <Card className="shadow-none border">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase">Valor perdido</p>
                <h3 className="text-2xl font-bold mt-1 text-rose-600">{formatCurrency(summary.value)}</h3>
              </div>
              <div className="p-2.5 rounded-full bg-primary/10 text-primary">
                <Wallet className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        )}
        <Card className="shadow-none border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium uppercase">Principal motivo</p>
            <h3 className="text-base font-semibold mt-1">{summary.topReason}</h3>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Select value={reasonFilter} onValueChange={setReasonFilter}>
          <SelectTrigger className="sm:w-[220px] h-9">
            <SelectValue placeholder="Motivo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os motivos</SelectItem>
            {(Object.keys(REASONS) as Reason[]).map((r) => (
              <SelectItem key={r} value={r}>
                {REASONS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!obraId && (
          <Select value={workFilter} onValueChange={setWorkFilter}>
            <SelectTrigger className="sm:w-[220px] h-9">
              <SelectValue placeholder="Obra" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as obras</SelectItem>
              <SelectItem value="none">Estoque geral (sem obra)</SelectItem>
              {works.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name.trim()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : error ? (
        <p className="text-sm text-destructive p-4">Não foi possível carregar as perdas: {error}</p>
      ) : visible.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-card space-y-3">
          <PackageX className="h-10 w-10 mx-auto text-muted-foreground opacity-60" />
          <p className="text-sm text-muted-foreground">Nenhuma perda registrada.</p>
          <Button size="sm" onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" /> Registrar perda
          </Button>
        </div>
      ) : (
        <div className="rounded-md border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                {!obraId && <TableHead>Obra</TableHead>}
                <TableHead>Material</TableHead>
                <TableHead className="text-right">Qtd.</TableHead>
                {showMoney && <TableHead className="text-right">Valor perdido</TableHead>}
                <TableHead>Motivo</TableHead>
                <TableHead>Registrado por</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="whitespace-nowrap">{formatDate(l.loss_date)}</TableCell>
                  {!obraId && <TableCell>{l.works?.name?.trim() || 'Estoque geral'}</TableCell>}
                  <TableCell>
                    <div className="font-medium">{l.material_name}</div>
                    {l.notes && <div className="text-xs text-muted-foreground line-clamp-1">{l.notes}</div>}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {Number(l.quantity)} {l.unit}
                  </TableCell>
                  {showMoney && (
                    <TableCell className="text-right font-semibold whitespace-nowrap">
                      {formatCurrency(total(l))}
                    </TableCell>
                  )}
                  <TableCell>
                    <Badge variant="secondary" className="font-normal">
                      {REASONS[l.reason] ?? l.reason}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {l.reporter?.full_name || l.reporter?.email || '-'}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {canManage(l) && (
                      <>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" title="Editar" onClick={() => openEdit(l)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" title="Excluir" onClick={() => handleDelete(l)}>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar perda' : 'Registrar perda de material'}</DialogTitle>
            <DialogDescription>Informe o que foi perdido, quanto e por quê.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            {!obraId && (
              <div className="space-y-2">
                <Label>Obra</Label>
                <Select value={form.work_id} onValueChange={(v) => setForm({ ...form, work_id: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Estoque geral (sem obra)</SelectItem>
                    {works.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name.trim()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Material</Label>
              <Select value={form.material_id} onValueChange={pickMaterial}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="other">Outro (digitar o nome)</SelectItem>
                  {catalog.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ml-name">Nome do material *</Label>
              <Input
                id="ml-name"
                required
                value={form.material_name}
                onChange={(e) => setForm({ ...form, material_name: e.target.value })}
                placeholder="Ex.: Cimento CP II, piso cerâmico 60x60"
              />
            </div>
            <div className={`grid gap-4 ${showMoney ? 'grid-cols-3' : 'grid-cols-2'}`}>
              <div className="space-y-2">
                <Label htmlFor="ml-qty">Quantidade perdida *</Label>
                <Input
                  id="ml-qty"
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
                    {[...new Set([form.unit, ...UNITS])].map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {showMoney && (
                <div className="space-y-2">
                  <Label htmlFor="ml-cost">Custo unitário (R$)</Label>
                  <Input
                    id="ml-cost"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={form.unit_cost}
                    onChange={(e) => setForm({ ...form, unit_cost: e.target.value })}
                  />
                </div>
              )}
            </div>
            {showMoney && num(form.quantity) > 0 && num(form.unit_cost) > 0 && (
              <p className="text-sm text-muted-foreground">
                Valor perdido: <strong>{formatCurrency(num(form.quantity) * num(form.unit_cost))}</strong>
              </p>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Motivo</Label>
                <Select value={form.reason} onValueChange={(v: Reason) => setForm({ ...form, reason: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(REASONS) as Reason[]).map((r) => (
                      <SelectItem key={r} value={r}>
                        {REASONS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ml-date">Data da perda</Label>
                <Input
                  id="ml-date"
                  type="date"
                  required
                  value={form.loss_date}
                  onChange={(e) => setForm({ ...form, loss_date: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ml-notes">Observações</Label>
              <Textarea
                id="ml-notes"
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
                {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Registrar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
