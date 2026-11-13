import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Edit2, Plus, RefreshCw, Search, Trash2, Wallet } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency, formatDate, formatSupabaseError } from '@/lib/formatters'
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
import { useAuth } from '@/hooks/use-auth'
import { isWeekPayable } from '@/lib/team-week'
import WeeklyPayments, { type WeeklyRow } from './WeeklyPayments'

interface Payment {
  id: string
  member_id: string | null
  member_name: string
  reference: string
  period_start: string | null
  period_end: string | null
  work_id: string | null
  payment_amount: number
  payment_method: string | null
  status: 'pending' | 'paid'
  paid_at: string | null
  notes: string | null
  source?: 'manual' | 'attendance'
  week_start?: string | null
  week_days?: number | null
  week_rate?: number | null
  week_extra?: number | null
  works?: { id: string; name: string } | null
}
interface Member {
  id: string
  name: string
  pix_key?: string | null
  provider_id?: string | null
}

const METHODS = ['PIX', 'Transferência', 'Dinheiro', 'Cheque', 'Outro']
const NONE = '__none__'

const todayISO = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
const num = (v: string) => Number((v || '0').replace(',', '.'))

const emptyForm = () => ({
  member_id: '',
  reference: '',
  period_start: '',
  period_end: '',
  work_id: NONE,
  payment_amount: '',
  payment_method: 'PIX',
  status: 'pending' as 'pending' | 'paid',
  paid_at: '',
  notes: '',
})

/** Faturamento > Pagamento (Equipe): pagamentos aos membros da equipe e prestadores. Só Admin e Financeiro. */
export default function TeamPaymentsPanel({ onDueCount }: { onDueCount?: (n: number) => void }) {
  const { toast } = useToast()
  const { role } = useAuth()
  const [items, setItems] = useState<Payment[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [works, setWorks] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [statusFilter, setStatusFilter] = useState('pending')
  const [memberFilter, setMemberFilter] = useState('all')
  const [search, setSearch] = useState('')

  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)

  const today = todayISO()

  const fetchAll = useCallback(async () => {
    const [pRes, mRes, wRes] = await Promise.all([
      supabase.from('team_payments' as any).select('*, works:work_id(id, name)').order('created_at', { ascending: false }),
      supabase.from('team_members').select('id, name, pix_key, provider_id').eq('status', 'active').order('name'),
      supabase.from('works').select('id, name').order('name'),
    ])
    if (pRes.error) {
      setError(formatSupabaseError(pRes.error))
    } else {
      setError(null)
      setItems((pRes.data ?? []) as unknown as Payment[])
    }
    setMembers((mRes.data ?? []) as unknown as Member[])
    setWorks((wRes.data ?? []) as { id: string; name: string }[])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const memberOf = (id: string | null) => members.find((m) => m.id === id)

  // pagamentos calculados pela presença (semana de sábado a sexta) e os lançados à mão
  const weekly = useMemo(() => items.filter((p) => p.source === 'attendance'), [items])
  const manual = useMemo(() => items.filter((p) => p.source !== 'attendance'), [items])

  const visible = useMemo(() => {
    const t = search.trim().toLowerCase()
    return manual.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false
      if (memberFilter !== 'all' && p.member_id !== memberFilter) return false
      if (!t) return true
      return p.member_name.toLowerCase().includes(t) || p.reference.toLowerCase().includes(t) || (p.works?.name ?? '').toLowerCase().includes(t)
    })
  }, [manual, statusFilter, memberFilter, search])

  const dueNow = weekly.filter((p) => p.status === 'pending' && p.week_start && isWeekPayable(p.week_start.slice(0, 10), today))
  const dueTotal = dueNow.reduce((s, p) => s + Number(p.payment_amount), 0)
  useEffect(() => {
    onDueCount?.(dueNow.length)
  }, [dueNow.length, onDueCount])

  const pending = items.filter((p) => p.status === 'pending')
  const pendingTotal = pending.reduce((s, p) => s + Number(p.payment_amount), 0)
  const monthPrefix = today.slice(0, 7)
  const paidMonth = items.filter((p) => p.status === 'paid' && (p.paid_at ?? '').startsWith(monthPrefix))
  const paidMonthTotal = paidMonth.reduce((s, p) => s + Number(p.payment_amount), 0)

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm())
    setOpen(true)
  }
  const openEdit = (p: Payment) => {
    setEditingId(p.id)
    setForm({
      member_id: p.member_id ?? '',
      reference: p.reference,
      period_start: p.period_start ?? '',
      period_end: p.period_end ?? '',
      work_id: p.work_id ?? NONE,
      payment_amount: String(p.payment_amount),
      payment_method: p.payment_method ?? 'PIX',
      status: p.status,
      paid_at: p.paid_at ?? '',
      notes: p.notes ?? '',
    })
    setOpen(true)
  }

  const handleSave = async (ev: React.FormEvent) => {
    ev.preventDefault()
    const amount = num(form.payment_amount)
    if (!form.member_id || !form.reference.trim() || Number.isNaN(amount) || amount < 0 || form.payment_amount.trim() === '') {
      toast({ title: 'Confira os dados', description: 'Escolha o membro, informe a referência e o valor.', variant: 'destructive' })
      return
    }
    if (form.period_start && form.period_end && form.period_end < form.period_start) {
      toast({ title: 'Período inválido', description: 'O fim não pode ser antes do início.', variant: 'destructive' })
      return
    }
    if (form.paid_at && form.paid_at > today) {
      toast({ title: 'Data inválida', description: 'A data do pagamento não pode estar no futuro.', variant: 'destructive' })
      return
    }
    const payload = {
      member_id: form.member_id,
      reference: form.reference.trim(),
      period_start: form.period_start || null,
      period_end: form.period_end || null,
      work_id: form.work_id === NONE ? null : form.work_id,
      payment_amount: amount,
      payment_method: form.payment_method || null,
      status: form.status,
      paid_at: form.status === 'paid' ? form.paid_at || null : null,
      notes: form.notes.trim() || null,
    }
    setSaving(true)
    const { error: err } = editingId
      ? await supabase.from('team_payments' as any).update(payload).eq('id', editingId)
      : await supabase.from('team_payments' as any).insert(payload)
    setSaving(false)
    if (err) {
      toast({ title: 'Erro ao salvar', description: formatSupabaseError(err), variant: 'destructive' })
      return
    }
    toast({ title: editingId ? 'Pagamento atualizado' : 'Pagamento lançado' })
    setOpen(false)
    fetchAll()
  }

  const markPaid = async (p: Payment) => {
    // forma de pagamento: a que já está no lançamento; senão PIX quando a pessoa tem chave PIX
    const method = p.payment_method ?? (memberOf(p.member_id)?.pix_key ? 'PIX' : null)
    const { error: err } = await supabase.from('team_payments' as any).update({ status: 'paid', payment_method: method }).eq('id', p.id)
    if (err) {
      toast({ title: 'Erro ao registrar o pagamento', description: formatSupabaseError(err), variant: 'destructive' })
      return
    }
    toast({ title: 'Pagamento registrado', description: `${p.member_name}: ${formatCurrency(Number(p.payment_amount))}` })
    fetchAll()
  }

  const handleDelete = async (p: Payment) => {
    if (!confirm(`Excluir o pagamento de "${p.member_name}" (${p.reference})?`)) return
    const { error: err } = await supabase.from('team_payments' as any).delete().eq('id', p.id)
    if (err) {
      toast({ title: 'Erro ao excluir', description: formatSupabaseError(err), variant: 'destructive' })
      return
    }
    toast({ title: 'Pagamento excluído' })
    fetchAll()
  }

  if (loading) return <Skeleton className="h-64 w-full" />

  if (error) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        Não foi possível carregar os pagamentos: {error}
        <Button variant="outline" size="sm" className="ml-3 gap-2" onClick={fetchAll}>
          <RefreshCw className="h-4 w-4" /> Tentar novamente
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Pagamentos aos membros da equipe e prestadores: lance, acompanhe o que está pendente e registre o pagamento.</p>
        <Button className="gap-2 shrink-0" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Novo pagamento
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Pagamentos pendentes', value: String(pending.length), cls: pending.length ? 'text-amber-600' : '' },
          { label: 'Total a pagar', value: formatCurrency(pendingTotal), cls: '' },
          { label: 'Semana fechada: a pagar', value: formatCurrency(dueTotal), cls: dueNow.length ? 'text-rose-600' : '' },
          { label: 'Pagos no mês', value: String(paidMonth.length), cls: '' },
          { label: 'Valor pago no mês', value: formatCurrency(paidMonthTotal), cls: 'text-emerald-600' },
        ].map((c) => (
          <Card key={c.label} className="shadow-none border">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground font-medium uppercase">{c.label}</p>
              <h3 className={`text-2xl font-bold mt-1 ${c.cls}`}>{c.value}</h3>
            </CardContent>
          </Card>
        ))}
      </div>

      <WeeklyPayments
        payments={weekly as unknown as WeeklyRow[]}
        today={today}
        pixOf={(id) => memberOf(id)?.pix_key}
        canDelete={role === 'admin'}
        onPay={(p) => markPaid(p as unknown as Payment)}
        onDelete={(p) => handleDelete(p as unknown as Payment)}
      />

      <div>
        <h2 className="text-base font-semibold">Outros pagamentos</h2>
        <p className="text-sm text-muted-foreground">Lançamentos feitos à mão (prestadores, avulsos, mensalistas...).</p>
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por membro, referência ou obra..." className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pendentes</SelectItem>
            <SelectItem value="paid">Pagos</SelectItem>
            <SelectItem value="all">Todos</SelectItem>
          </SelectContent>
        </Select>
        <Select value={memberFilter} onValueChange={setMemberFilter}>
          <SelectTrigger className="md:w-56"><SelectValue placeholder="Membro" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toda a equipe</SelectItem>
            {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name.trim()}{m.provider_id ? ' · Prestador' : ''}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {manual.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-card space-y-3">
          <Wallet className="h-10 w-10 mx-auto text-muted-foreground opacity-60" />
          <p className="text-sm text-muted-foreground">Nenhum pagamento lançado à mão ainda.</p>
          <Button size="sm" onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" /> Novo pagamento</Button>
        </div>
      ) : (
        <div className="rounded-md border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Membro</TableHead>
                <TableHead>Referência</TableHead>
                <TableHead>Obra</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Forma</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">Nenhum pagamento encontrado.</TableCell>
                </TableRow>
              )}
              {visible.map((p) => {
                const pix = memberOf(p.member_id)?.pix_key
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="font-medium">{p.member_name || '-'}</div>
                      {pix && p.status === 'pending' && <div className="text-xs text-muted-foreground">PIX: {pix}</div>}
                    </TableCell>
                    <TableCell>
                      <div>{p.reference}</div>
                      {(p.period_start || p.period_end) && (
                        <div className="text-xs text-muted-foreground">
                          {p.period_start ? formatDate(p.period_start) : '...'} a {p.period_end ? formatDate(p.period_end) : '...'}
                        </div>
                      )}
                      {p.notes && <div className="text-xs max-w-xs">{p.notes}</div>}
                    </TableCell>
                    <TableCell>{p.works?.name?.trim() ?? '-'}</TableCell>
                    <TableCell className="text-right font-semibold whitespace-nowrap">{formatCurrency(Number(p.payment_amount))}</TableCell>
                    <TableCell>{p.payment_method ?? '-'}</TableCell>
                    <TableCell>
                      {p.status === 'paid' ? (
                        <Badge variant="outline" className="gap-1 font-normal border-emerald-300 bg-emerald-50 text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" /> Pago{p.paid_at ? ` em ${formatDate(p.paid_at)}` : ''}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="font-normal border-amber-300 bg-amber-50 text-amber-700">Pendente</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {p.status === 'pending' && (
                        <Button variant="outline" size="sm" className="h-8 gap-1 mr-1" title="Registrar o pagamento de hoje" onClick={() => markPaid(p)}>
                          <CheckCircle2 className="h-4 w-4" /> Pagar
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar" onClick={() => openEdit(p)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" title="Excluir" onClick={() => handleDelete(p)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar pagamento' : 'Novo pagamento'}</DialogTitle>
            <DialogDescription>Pagamento a um membro da equipe ou prestador.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label>Membro *</Label>
              <Select value={form.member_id} onValueChange={(v) => setForm({ ...form, member_id: v })}>
                <SelectTrigger><SelectValue placeholder="Escolha quem vai receber" /></SelectTrigger>
                <SelectContent>
                  {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name.trim()}{m.provider_id ? ' · Prestador' : ''}</SelectItem>)}
                </SelectContent>
              </Select>
              {form.member_id && memberOf(form.member_id)?.pix_key && (
                <p className="text-xs text-muted-foreground">Chave PIX: {memberOf(form.member_id)?.pix_key}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="tp-ref">Referência *</Label>
              <Input id="tp-ref" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="Ex.: Semana 10 a 16/11, Diárias de outubro" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tp-start">Período: início</Label>
                <Input id="tp-start" type="date" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tp-end">Período: fim</Label>
                <Input id="tp-end" type="date" min={form.period_start || undefined} value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tp-val">Valor (R$) *</Label>
                <Input id="tp-val" inputMode="decimal" placeholder="0,00" value={form.payment_amount} onChange={(e) => setForm({ ...form, payment_amount: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Forma de pagamento</Label>
                <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Obra</Label>
                <Select value={form.work_id} onValueChange={(v) => setForm({ ...form, work_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sem obra</SelectItem>
                    {works.map((w) => <SelectItem key={w.id} value={w.id}>{w.name.trim()}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Situação</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as 'pending' | 'paid' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="paid">Pago</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.status === 'paid' && (
                <div className="space-y-2">
                  <Label htmlFor="tp-paid">Pago em</Label>
                  <Input id="tp-paid" type="date" max={today} value={form.paid_at} onChange={(e) => setForm({ ...form, paid_at: e.target.value })} />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="tp-notes">Observações</Label>
              <Textarea id="tp-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Lançar'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
