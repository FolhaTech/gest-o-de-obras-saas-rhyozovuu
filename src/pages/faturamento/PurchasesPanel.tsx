import { useCallback, useEffect, useMemo, useState } from 'react'
import { Edit2, PackagePlus, Plus, RefreshCw, Search, ShoppingCart, Trash2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency, formatDate, formatSupabaseError } from '@/lib/formatters'
import {
  FINANCE_STATUSES,
  STATUS_LABEL,
  URGENCY_LABEL,
  daysLate,
  isBought,
  isOpen,
  sortRequests,
  type PurchaseStatus,
  type Urgency,
} from '@/lib/purchases'
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

interface Request {
  id: string
  work_id: string | null
  item: string
  quantity: number
  unit: string | null
  notes: string | null
  urgency: Urgency
  needed_by: string | null
  status: PurchaseStatus
  requested_by: string | null
  supplier: string | null
  quoted_value?: number | null
  final_value?: number | null
  invoice_number: string | null
  purchased_at: string | null
  finance_notes: string | null
  handled_by: string | null
  created_at: string
  works?: { id: string; name: string } | null
  requester?: { full_name: string | null; email: string | null } | null
  handler?: { full_name: string | null; email: string | null } | null
}

const SELECT =
  '*, works:work_id(id, name), requester:requested_by(full_name, email), handler:handled_by(full_name, email)'
const NO_WORK = '__none__'
const UNITS = ['un', 'kg', 'saco', 'm', 'm²', 'm³', 'L', 'cx', 'pç', 'jogo']

const STATUS_CLASS: Record<PurchaseStatus, string> = {
  requested: 'border-blue-300 bg-blue-50 text-blue-700',
  quoting: 'border-violet-300 bg-violet-50 text-violet-700',
  approved: 'border-teal-300 bg-teal-50 text-teal-700',
  purchased: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  delivered: 'border-slate-300 bg-slate-50 text-slate-700',
  rejected: 'border-rose-300 bg-rose-50 text-rose-700',
  cancelled: 'border-muted bg-muted/40 text-muted-foreground',
}
const URGENCY_CLASS: Record<Urgency, string> = {
  low: 'text-muted-foreground',
  normal: '',
  high: 'text-amber-600 font-medium',
  urgent: 'text-rose-600 font-semibold',
}

const todayISO = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
const num = (v: string) => Number((v || '0').replace(',', '.'))
const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
const who = (p?: { full_name: string | null; email: string | null } | null) => p?.full_name?.trim() || p?.email || '-'

interface Line {
  key: number
  item: string
  quantity: string
  unit: string
  notes: string
}
let lineKey = 0
const newLine = (): Line => ({ key: ++lineKey, item: '', quantity: '1', unit: 'un', notes: '' })

/** Faturamento > Compras: qualquer usuário solicita o que precisa ser comprado; o Financeiro atende. */
export default function PurchasesPanel({ onNewCount }: { onNewCount?: (n: number) => void }) {
  const { toast } = useToast()
  const { user, role, canSeeBilling } = useAuth()
  const isFinance = role === 'admin' || role === 'financeiro' // atende as solicitações
  const seesAll = role !== 'prestador'

  const [items, setItems] = useState<Request[]>([])
  const [works, setWorks] = useState<{ id: string; name: string }[]>([])
  const [catalog, setCatalog] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [statusFilter, setStatusFilter] = useState('open')
  const [workFilter, setWorkFilter] = useState('all')
  const [search, setSearch] = useState('')

  // nova solicitação / edição
  const [reqOpen, setReqOpen] = useState(false)
  const [editing, setEditing] = useState<Request | null>(null)
  const [reqForm, setReqForm] = useState({ work_id: NO_WORK, urgency: 'normal' as Urgency, needed_by: '' })
  const [lines, setLines] = useState<Line[]>([newLine()])
  // atendimento (financeiro)
  const [handling, setHandling] = useState<Request | null>(null)
  const [hForm, setHForm] = useState({ status: 'quoting' as PurchaseStatus, supplier: '', quoted_value: '', final_value: '', invoice_number: '', purchased_at: '', finance_notes: '' })
  const [saving, setSaving] = useState(false)

  const today = todayISO()

  const fetchAll = useCallback(async () => {
    const [rRes, wRes, mRes] = await Promise.all([
      supabase.from('purchase_requests' as any).select(SELECT).order('created_at', { ascending: false }),
      supabase.from('works').select('id, name').order('name'),
      supabase.from('materials').select('name').order('name'),
    ])
    if (rRes.error) {
      setError(formatSupabaseError(rRes.error))
    } else {
      setError(null)
      setItems((rRes.data ?? []) as unknown as Request[])
    }
    setWorks((wRes.data ?? []) as { id: string; name: string }[])
    setCatalog(((mRes.data ?? []) as { name: string }[]).map((m) => m.name))
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const newCount = items.filter((r) => r.status === 'requested').length
  useEffect(() => {
    onNewCount?.(newCount)
  }, [newCount, onNewCount])

  const visible = useMemo(() => {
    const t = search.trim().toLowerCase()
    const list = items.filter((r) => {
      if (statusFilter === 'open' ? !isOpen(r.status) : statusFilter !== 'all' && r.status !== statusFilter) return false
      if (workFilter !== 'all' && (workFilter === NO_WORK ? r.work_id !== null : r.work_id !== workFilter)) return false
      if (!t) return true
      return r.item.toLowerCase().includes(t) || (r.works?.name ?? '').toLowerCase().includes(t) || who(r.requester).toLowerCase().includes(t) || (r.supplier ?? '').toLowerCase().includes(t)
    })
    return sortRequests(list)
  }, [items, statusFilter, workFilter, search])

  const monthPrefix = today.slice(0, 7)
  const count = (st: PurchaseStatus) => items.filter((r) => r.status === st).length
  const boughtMonth = items.filter((r) => isBought(r.status) && (r.purchased_at ?? '').startsWith(monthPrefix))
  const boughtMonthValue = boughtMonth.reduce((s, r) => s + (Number(r.final_value) || 0), 0)
  const late = items.filter((r) => daysLate(r, today) > 0).length

  const canEditOwn = (r: Request) => r.requested_by === user?.id && r.status === 'requested'

  // ---------------------------------------------------------------- solicitar
  const openCreate = () => {
    setEditing(null)
    setReqForm({ work_id: NO_WORK, urgency: 'normal', needed_by: '' })
    setLines([newLine()])
    setReqOpen(true)
  }
  const openEdit = (r: Request) => {
    setEditing(r)
    setReqForm({ work_id: r.work_id ?? NO_WORK, urgency: r.urgency, needed_by: r.needed_by ?? '' })
    setLines([{ key: ++lineKey, item: r.item, quantity: String(r.quantity), unit: r.unit || 'un', notes: r.notes ?? '' }])
    setReqOpen(true)
  }
  const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  const saveRequest = async (ev: React.FormEvent) => {
    ev.preventDefault()
    const filled = lines.filter((l) => l.item.trim())
    if (filled.length === 0) {
      toast({ title: 'Informe o que precisa comprar', description: 'Preencha pelo menos um item.', variant: 'destructive' })
      return
    }
    if (filled.some((l) => !(num(l.quantity) > 0))) {
      toast({ title: 'Quantidade inválida', description: 'A quantidade precisa ser maior que zero.', variant: 'destructive' })
      return
    }
    if (reqForm.needed_by && reqForm.needed_by < today) {
      toast({ title: 'Prazo inválido', description: 'O "precisa até" não pode ser uma data passada.', variant: 'destructive' })
      return
    }
    const common = {
      work_id: reqForm.work_id === NO_WORK ? null : reqForm.work_id,
      urgency: reqForm.urgency,
      needed_by: reqForm.needed_by || null,
    }
    setSaving(true)
    let err: unknown = null
    if (editing) {
      const l = filled[0]
      const res = await supabase
        .from('purchase_requests' as any)
        .update({ ...common, item: l.item.trim(), quantity: num(l.quantity), unit: l.unit, notes: l.notes.trim() || null })
        .eq('id', editing.id)
      err = res.error
    } else {
      const res = await supabase
        .from('purchase_requests' as any)
        .insert(filled.map((l) => ({ ...common, item: l.item.trim(), quantity: num(l.quantity), unit: l.unit, notes: l.notes.trim() || null })))
      err = res.error
    }
    setSaving(false)
    if (err) {
      toast({ title: 'Erro ao salvar', description: formatSupabaseError(err), variant: 'destructive' })
      return
    }
    toast({
      title: editing ? 'Solicitação atualizada' : filled.length > 1 ? `${filled.length} itens solicitados` : 'Compra solicitada',
      description: editing ? undefined : 'O financeiro recebeu o pedido.',
    })
    setReqOpen(false)
    fetchAll()
  }

  const cancelRequest = async (r: Request) => {
    if (!confirm(`Cancelar a solicitação de "${r.item}"?`)) return
    const { error: err } = await supabase.from('purchase_requests' as any).update({ status: 'cancelled' }).eq('id', r.id)
    if (err) {
      toast({ title: 'Erro ao cancelar', description: formatSupabaseError(err), variant: 'destructive' })
      return
    }
    toast({ title: 'Solicitação cancelada' })
    fetchAll()
  }

  const deleteRequest = async (r: Request) => {
    if (!confirm(`Excluir a solicitação de "${r.item}"?`)) return
    const { error: err } = await supabase.from('purchase_requests' as any).delete().eq('id', r.id)
    if (err) {
      toast({ title: 'Erro ao excluir', description: formatSupabaseError(err), variant: 'destructive' })
      return
    }
    toast({ title: 'Solicitação excluída' })
    fetchAll()
  }

  // ---------------------------------------------------------------- atender (financeiro)
  const openHandle = (r: Request) => {
    setHandling(r)
    setHForm({
      status: r.status === 'cancelled' ? 'requested' : r.status === 'requested' ? 'quoting' : r.status,
      supplier: r.supplier ?? '',
      quoted_value: r.quoted_value ? String(r.quoted_value) : '',
      final_value: r.final_value ? String(r.final_value) : '',
      invoice_number: r.invoice_number ?? '',
      purchased_at: r.purchased_at ?? '',
      finance_notes: r.finance_notes ?? '',
    })
  }

  const saveHandle = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!handling) return
    const quoted = hForm.quoted_value.trim() === '' ? null : num(hForm.quoted_value)
    const final = hForm.final_value.trim() === '' ? null : num(hForm.final_value)
    if ((quoted !== null && (Number.isNaN(quoted) || quoted < 0)) || (final !== null && (Number.isNaN(final) || final < 0))) {
      toast({ title: 'Valor inválido', description: 'Informe valores maiores ou iguais a zero.', variant: 'destructive' })
      return
    }
    if (hForm.status === 'rejected' && !hForm.finance_notes.trim()) {
      toast({ title: 'Explique a recusa', description: 'Informe o motivo nas observações do financeiro.', variant: 'destructive' })
      return
    }
    if (hForm.purchased_at && hForm.purchased_at > today) {
      toast({ title: 'Data inválida', description: 'A data da compra não pode estar no futuro.', variant: 'destructive' })
      return
    }
    setSaving(true)
    const { error: err } = await supabase
      .from('purchase_requests' as any)
      .update({
        status: hForm.status,
        supplier: hForm.supplier.trim() || null,
        quoted_value: quoted,
        final_value: final,
        invoice_number: hForm.invoice_number.trim() || null,
        purchased_at: hForm.purchased_at || null,
        finance_notes: hForm.finance_notes.trim() || null,
      })
      .eq('id', handling.id)
    setSaving(false)
    if (err) {
      toast({ title: 'Erro ao salvar', description: formatSupabaseError(err), variant: 'destructive' })
      return
    }
    toast({ title: 'Solicitação atualizada', description: `${handling.item}: ${STATUS_LABEL[hForm.status]}` })
    setHandling(null)
    fetchAll()
  }

  if (loading) return <Skeleton className="h-64 w-full" />

  if (error) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        Não foi possível carregar as solicitações: {error}
        <Button variant="outline" size="sm" className="ml-3 gap-2" onClick={fetchAll}>
          <RefreshCw className="h-4 w-4" /> Tentar novamente
        </Button>
      </div>
    )
  }

  const cards = [
    { label: 'Novas', value: String(count('requested')), cls: count('requested') ? 'text-blue-600' : '' },
    { label: 'Em cotação', value: String(count('quoting')), cls: '' },
    { label: 'Aprovadas (a comprar)', value: String(count('approved')), cls: count('approved') ? 'text-teal-600' : '' },
    { label: 'Compradas no mês', value: String(boughtMonth.length), cls: '' },
    ...(canSeeBilling ? [{ label: 'Valor comprado no mês', value: formatCurrency(boughtMonthValue), cls: '' }] : []),
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {isFinance
            ? 'Solicitações de compra enviadas pelos usuários. Atenda, cote, aprove e registre a compra.'
            : 'Peça aqui o que precisa ser comprado: o financeiro recebe a solicitação e atende.'}
        </p>
        <Button className="gap-2 shrink-0" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Solicitar compra
        </Button>
      </div>

      {!seesAll && (
        <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">Você vê somente as solicitações que fez.</div>
      )}

      <div className={`grid grid-cols-2 gap-3 ${canSeeBilling ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
        {cards.map((c) => (
          <Card key={c.label} className="shadow-none border">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground font-medium uppercase">{c.label}</p>
              <h3 className={`text-2xl font-bold mt-1 ${c.cls}`}>{c.value}</h3>
            </CardContent>
          </Card>
        ))}
      </div>
      {late > 0 && <p className="text-xs text-rose-600 font-medium">{late} solicitação(ões) com o prazo "precisa até" vencido.</p>}

      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por item, obra, solicitante ou fornecedor..." className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="md:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Em aberto</SelectItem>
            <SelectItem value="all">Todas</SelectItem>
            {(Object.keys(STATUS_LABEL) as PurchaseStatus[]).map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={workFilter} onValueChange={setWorkFilter}>
          <SelectTrigger className="md:w-52"><SelectValue placeholder="Obra" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as obras</SelectItem>
            <SelectItem value={NO_WORK}>Geral (sem obra)</SelectItem>
            {works.map((w) => <SelectItem key={w.id} value={w.id}>{w.name.trim()}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-card space-y-3">
          <ShoppingCart className="h-10 w-10 mx-auto text-muted-foreground opacity-60" />
          <p className="text-sm text-muted-foreground">Nenhuma solicitação de compra ainda.</p>
          <Button size="sm" onClick={openCreate} className="gap-2"><PackagePlus className="h-4 w-4" /> Solicitar compra</Button>
        </div>
      ) : (
        <div className="rounded-md border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Solicitada em</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Obra</TableHead>
                <TableHead>Urgência</TableHead>
                <TableHead>Precisa até</TableHead>
                {seesAll && <TableHead>Solicitante</TableHead>}
                <TableHead>Situação</TableHead>
                <TableHead>Financeiro</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-6 text-center text-muted-foreground">Nenhuma solicitação encontrada.</TableCell>
                </TableRow>
              )}
              {visible.map((r) => {
                const lateDays = daysLate(r, today)
                return (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-sm">{formatDate(r.created_at.slice(0, 10))}</TableCell>
                    <TableCell>
                      <div className="font-medium">{r.item}</div>
                      <div className="text-xs text-muted-foreground">{fmt(Number(r.quantity))} {r.unit ?? ''}</div>
                      {r.notes && <div className="text-xs mt-0.5 max-w-xs">{r.notes}</div>}
                    </TableCell>
                    <TableCell>{r.works?.name?.trim() ?? <span className="text-muted-foreground">Geral</span>}</TableCell>
                    <TableCell className={URGENCY_CLASS[r.urgency]}>{URGENCY_LABEL[r.urgency]}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {r.needed_by ? formatDate(r.needed_by) : '-'}
                      {lateDays > 0 && <div className="text-[10px] text-rose-600 font-medium">atrasada {lateDays} dia(s)</div>}
                    </TableCell>
                    {seesAll && <TableCell className="text-sm">{who(r.requester)}</TableCell>}
                    <TableCell>
                      <Badge variant="outline" className={`font-normal ${STATUS_CLASS[r.status]}`}>{STATUS_LABEL[r.status]}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.supplier && <div>{r.supplier}</div>}
                      {canSeeBilling && (Number(r.final_value) > 0 || Number(r.quoted_value) > 0) && (
                        <div className="text-xs font-medium text-primary">
                          {Number(r.final_value) > 0 ? formatCurrency(Number(r.final_value)) : `cotado ${formatCurrency(Number(r.quoted_value))}`}
                        </div>
                      )}
                      {r.invoice_number && <div className="text-xs text-muted-foreground">NF {r.invoice_number}</div>}
                      {r.finance_notes && <div className="text-xs max-w-xs">{r.finance_notes}</div>}
                      {r.handled_by && !isFinance && <div className="text-[10px] text-muted-foreground">por {who(r.handler)}</div>}
                      {!r.supplier && !r.finance_notes && !r.invoice_number && !(canSeeBilling && (Number(r.final_value) > 0 || Number(r.quoted_value) > 0)) && <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {isFinance && (
                        <Button variant="outline" size="sm" className="h-8 mr-1" onClick={() => openHandle(r)}>
                          Atender
                        </Button>
                      )}
                      {canEditOwn(r) && (
                        <>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar" onClick={() => openEdit(r)}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Cancelar solicitação" onClick={() => cancelRequest(r)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      {(isFinance || canEditOwn(r)) && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" title="Excluir" onClick={() => deleteRequest(r)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Solicitar compra */}
      <Dialog open={reqOpen} onOpenChange={setReqOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar solicitação' : 'Solicitar compra'}</DialogTitle>
            <DialogDescription>Informe o que precisa ser comprado. O financeiro recebe e atende.</DialogDescription>
          </DialogHeader>
          <form onSubmit={saveRequest} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Obra / casa</Label>
                <Select value={reqForm.work_id} onValueChange={(v) => setReqForm({ ...reqForm, work_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_WORK}>Geral (sem obra)</SelectItem>
                    {works.map((w) => <SelectItem key={w.id} value={w.id}>{w.name.trim()}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Urgência</Label>
                <Select value={reqForm.urgency} onValueChange={(v) => setReqForm({ ...reqForm, urgency: v as Urgency })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(URGENCY_LABEL) as Urgency[]).map((u) => <SelectItem key={u} value={u}>{URGENCY_LABEL[u]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pr-needed">Precisa até</Label>
                <Input id="pr-needed" type="date" min={today} value={reqForm.needed_by} onChange={(e) => setReqForm({ ...reqForm, needed_by: e.target.value })} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{editing ? 'Item' : 'O que precisa ser comprado'}</Label>
              <datalist id="pr-catalog">
                {catalog.map((n) => <option key={n} value={n} />)}
              </datalist>
              <div className="space-y-3">
                {lines.map((l) => (
                  <div key={l.key} className="rounded-md border p-3 space-y-2">
                    <div className="flex gap-2">
                      <Input list="pr-catalog" className="flex-1" placeholder="Item (ex.: Cimento CP-II 50 kg)" value={l.item} onChange={(e) => setLine(l.key, { item: e.target.value })} />
                      <Input className="w-24 text-right" inputMode="decimal" placeholder="Qtd." value={l.quantity} onChange={(e) => setLine(l.key, { quantity: e.target.value })} />
                      <Select value={l.unit} onValueChange={(v) => setLine(l.key, { unit: v })}>
                        <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                        <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                      </Select>
                      {!editing && (
                        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" title="Remover item" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [newLine()]))}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <Input placeholder="Observação (marca, medida, para que serve...)" value={l.notes} onChange={(e) => setLine(l.key, { notes: e.target.value })} />
                  </div>
                ))}
                {!editing && (
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setLines((ls) => [...ls, newLine()])}>
                    <Plus className="h-4 w-4" /> Adicionar outro item
                  </Button>
                )}
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" disabled={saving} onClick={() => setReqOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Enviando...' : editing ? 'Salvar alterações' : 'Enviar ao financeiro'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Atender (financeiro) */}
      <Dialog open={!!handling} onOpenChange={(o) => !o && setHandling(null)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Atender solicitação</DialogTitle>
            <DialogDescription>
              {handling && `${handling.item} · ${fmt(Number(handling.quantity))} ${handling.unit ?? ''} · ${handling.works?.name?.trim() ?? 'Geral'} · pedido por ${who(handling.requester)}`}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveHandle} className="space-y-4">
            <div className="space-y-2">
              <Label>Situação</Label>
              <Select value={hForm.status} onValueChange={(v) => setHForm({ ...hForm, status: v as PurchaseStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FINANCE_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="hf-sup">Fornecedor</Label>
                <Input id="hf-sup" value={hForm.supplier} onChange={(e) => setHForm({ ...hForm, supplier: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hf-nf">Nota fiscal</Label>
                <Input id="hf-nf" value={hForm.invoice_number} onChange={(e) => setHForm({ ...hForm, invoice_number: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="hf-q">Valor cotado (R$)</Label>
                <Input id="hf-q" inputMode="decimal" placeholder="0,00" value={hForm.quoted_value} onChange={(e) => setHForm({ ...hForm, quoted_value: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hf-f">Valor da compra (R$)</Label>
                <Input id="hf-f" inputMode="decimal" placeholder="0,00" value={hForm.final_value} onChange={(e) => setHForm({ ...hForm, final_value: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hf-d">Data da compra</Label>
                <Input id="hf-d" type="date" max={today} value={hForm.purchased_at} onChange={(e) => setHForm({ ...hForm, purchased_at: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="hf-n">Observações do financeiro {hForm.status === 'rejected' && '*'}</Label>
              <Textarea id="hf-n" rows={2} value={hForm.finance_notes} onChange={(e) => setHForm({ ...hForm, finance_notes: e.target.value })} placeholder={hForm.status === 'rejected' ? 'Motivo da recusa' : 'Prazo de entrega, condições, etc.'} />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" disabled={saving} onClick={() => setHandling(null)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
