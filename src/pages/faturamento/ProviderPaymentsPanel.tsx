import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Copy, Edit2, Plus, RefreshCw, Search, Trash2, Wallet, X } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency, formatDate, formatSupabaseError } from '@/lib/formatters'
import { parseMoney } from '@/lib/purchases'
import {
  EMPTY_FORM,
  PROVIDER_STATUS_LABEL,
  dueState,
  dueText,
  paymentTotals,
  sortPayments,
  summarizeByProvider,
  validateProviderPayment,
  type ProviderPaymentForm,
  type ProviderPaymentRow,
} from '@/lib/provider-payments'
import { localTodayISO } from '@/lib/team-week'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'

interface Provider {
  id: string
  name: string
  service_type: string | null
}
interface Mirror {
  provider_id: string | null
  pix_key: string | null
}

const METHODS = ['PIX', 'Transferência', 'Boleto', 'Dinheiro', 'Cheque', 'Outro']
const OTHER = '__other__'

const DUE_CLASS = {
  overdue: 'border-rose-300 bg-rose-50 text-rose-700',
  today: 'border-amber-300 bg-amber-50 text-amber-800',
  soon: 'border-amber-200 bg-amber-50/60 text-amber-700',
  ok: 'border-muted bg-muted/30 text-muted-foreground',
} as const

/**
 * Financeiro > Pagamento (Prestadores): o admin abre a solicitação de pagamento de um prestador de serviço externo (Nome, PIX,
 * Tratativa, NF, Casa, Valor e Vencimento) para o contas a pagar; o financeiro paga. Só Admin e Financeiro enxergam.
 */
export default function ProviderPaymentsPanel({ onCount }: { onCount?: (n: number) => void }) {
  const { toast } = useToast()
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const isFinance = role === 'financeiro'
  const today = localTodayISO()

  const [items, setItems] = useState<ProviderPaymentRow[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [mirrors, setMirrors] = useState<Mirror[]>([])
  const [works, setWorks] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [statusFilter, setStatusFilter] = useState('requested')
  const [workFilter, setWorkFilter] = useState('all')
  const [search, setSearch] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ProviderPaymentRow | null>(null)
  const [form, setForm] = useState<ProviderPaymentForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const [paying, setPaying] = useState<ProviderPaymentRow | null>(null)
  const [payForm, setPayForm] = useState({ method: 'PIX', date: today, notes: '' })

  const fetchAll = useCallback(async () => {
    const [pRes, prRes, mRes, wRes] = await Promise.all([
      supabase.from('provider_payments' as any).select('*, works:work_id(id, name)').order('due_date', { ascending: true }),
      supabase.from('service_providers').select('id, name, service_type').order('name'),
      supabase.from('team_members').select('provider_id, pix_key'),
      supabase.from('works').select('id, name').order('name'),
    ])
    if (pRes.error) {
      setError(formatSupabaseError(pRes.error))
    } else {
      setError(null)
      setItems((pRes.data ?? []) as unknown as ProviderPaymentRow[])
    }
    setProviders((prRes.data ?? []) as unknown as Provider[])
    setMirrors(((mRes.data ?? []) as unknown as Mirror[]).filter((m) => m.provider_id))
    setWorks((wRes.data ?? []) as { id: string; name: string }[])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const totals = useMemo(() => paymentTotals(items, today), [items, today])
  const summary = useMemo(() => summarizeByProvider(items, today), [items, today])
  // contador da aba: o financeiro vê o que há para pagar; o admin, o que já venceu
  const badge = isAdmin ? totals.overdueCount : totals.openCount
  useEffect(() => {
    onCount?.(badge)
  }, [badge, onCount])

  const visible = useMemo(() => {
    const t = search.trim().toLowerCase()
    const list = items.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false
      if (workFilter !== 'all' && p.work_id !== workFilter) return false
      if (!t) return true
      return [p.provider_name, p.service_type, p.invoice_number, p.work_name ?? '', p.works?.name ?? ''].some((v) => v.toLowerCase().includes(t))
    })
    return sortPayments(list)
  }, [items, statusFilter, workFilter, search])

  // ---------------------------------------------------------------- abrir / editar a solicitação (admin)
  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormOpen(true)
  }
  const openEdit = (p: ProviderPaymentRow) => {
    setEditing(p)
    setForm({
      provider_id: p.provider_id ?? '',
      provider_name: p.provider_name,
      pix_key: p.pix_key,
      service_type: p.service_type,
      invoice_number: p.invoice_number,
      work_id: p.work_id ?? '',
      amount: String(p.payment_amount).replace('.', ','),
      due_date: p.due_date.slice(0, 10),
      notes: p.notes ?? '',
    })
    setFormOpen(true)
  }
  // escolher um prestador cadastrado já traz nome, tratativa (tipo de serviço) e PIX; tudo continua editável
  const pickProvider = (value: string) => {
    if (value === OTHER) {
      setForm((f) => ({ ...f, provider_id: '' }))
      return
    }
    const prov = providers.find((x) => x.id === value)
    if (!prov) return
    const pix = mirrors.find((m) => m.provider_id === prov.id)?.pix_key ?? ''
    setForm((f) => ({
      ...f,
      provider_id: prov.id,
      provider_name: prov.name.trim(),
      service_type: f.service_type.trim() ? f.service_type : (prov.service_type ?? ''),
      pix_key: f.pix_key.trim() ? f.pix_key : pix,
    }))
  }

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault()
    const problem = validateProviderPayment(form)
    if (problem) {
      toast({ title: 'Confira os dados', description: problem, variant: 'destructive' })
      return
    }
    const payload = {
      provider_id: form.provider_id || null,
      provider_name: form.provider_name.trim(),
      pix_key: form.pix_key.trim(),
      service_type: form.service_type.trim(),
      invoice_number: form.invoice_number.trim(),
      work_id: form.work_id,
      payment_amount: parseMoney(form.amount),
      due_date: form.due_date,
      notes: form.notes.trim() || null,
    }
    setSaving(true)
    const { error: err } = editing
      ? await supabase.from('provider_payments' as any).update(payload).eq('id', editing.id)
      : await supabase.from('provider_payments' as any).insert(payload)
    setSaving(false)
    if (err) {
      toast({ title: 'Erro ao salvar', description: formatSupabaseError(err), variant: 'destructive' })
      return
    }
    toast({
      title: editing ? 'Solicitação atualizada' : 'Solicitação aberta',
      description: editing ? undefined : 'O financeiro (contas a pagar) já vê o pagamento e segue com o pagamento.',
    })
    setFormOpen(false)
    fetchAll()
  }

  const cancel = async (p: ProviderPaymentRow) => {
    if (!confirm(`Cancelar a solicitação de pagamento de "${p.provider_name}" (${formatCurrency(Number(p.payment_amount))})?`)) return
    const { error: err } = await supabase.from('provider_payments' as any).update({ status: 'cancelled' }).eq('id', p.id)
    if (err) {
      toast({ title: 'Erro ao cancelar', description: formatSupabaseError(err), variant: 'destructive' })
      return
    }
    toast({ title: 'Solicitação cancelada' })
    fetchAll()
  }

  const remove = async (p: ProviderPaymentRow) => {
    if (!confirm(`Excluir a solicitação de "${p.provider_name}"? Isso não pode ser desfeito.`)) return
    const { error: err } = await supabase.from('provider_payments' as any).delete().eq('id', p.id)
    if (err) {
      toast({ title: 'Erro ao excluir', description: formatSupabaseError(err), variant: 'destructive' })
      return
    }
    toast({ title: 'Solicitação excluída' })
    fetchAll()
  }

  // ---------------------------------------------------------------- pagar (financeiro)
  const openPay = (p: ProviderPaymentRow) => {
    setPaying(p)
    setPayForm({ method: 'PIX', date: today, notes: '' })
  }
  const pay = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!paying) return
    if (payForm.date > today) {
      toast({ title: 'Data inválida', description: 'A data do pagamento não pode estar no futuro.', variant: 'destructive' })
      return
    }
    setSaving(true)
    const { error: err } = await supabase
      .from('provider_payments' as any)
      .update({ status: 'paid', paid_at: payForm.date || today, payment_method: payForm.method, finance_notes: payForm.notes.trim() || null })
      .eq('id', paying.id)
    setSaving(false)
    if (err) {
      toast({ title: 'Erro ao registrar o pagamento', description: formatSupabaseError(err), variant: 'destructive' })
      return
    }
    toast({ title: 'Pagamento registrado', description: `${paying.provider_name}: ${formatCurrency(Number(paying.payment_amount))}` })
    setPaying(null)
    fetchAll()
  }

  const copyPix = async (pix: string) => {
    try {
      await navigator.clipboard.writeText(pix)
      toast({ title: 'PIX copiado', description: pix })
    } catch {
      toast({ title: 'PIX', description: pix })
    }
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
    { label: 'A pagar', value: String(totals.openCount), sub: formatCurrency(totals.openTotal), cls: totals.openCount ? 'text-amber-600' : '' },
    { label: 'Vencidas', value: String(totals.overdueCount), sub: formatCurrency(totals.overdueTotal), cls: totals.overdueCount ? 'text-rose-600' : '' },
    { label: 'Vencem em 7 dias', value: String(totals.soonCount), sub: formatCurrency(totals.soonTotal), cls: '' },
    { label: 'Pagas no mês', value: String(totals.paidMonthCount), sub: formatCurrency(totals.paidMonthTotal), cls: 'text-emerald-600' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {isAdmin
            ? 'Abra a solicitação de pagamento do prestador de serviço externo com Nome, PIX, Tratativa, NF, Casa, Valor e Vencimento. O financeiro (contas a pagar) faz o pagamento.'
            : 'Solicitações de pagamento de prestadores de serviços externos abertas pelo admin. Confira os dados, pague e registre o pagamento.'}
        </p>
        {isAdmin && (
          <Button className="gap-2 shrink-0" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Solicitar pagamento
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="shadow-none border">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground font-medium uppercase">{c.label}</p>
              <h3 className={`text-2xl font-bold mt-1 ${c.cls}`}>{c.value}</h3>
              <p className="text-xs text-muted-foreground">{c.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {summary.length > 0 && (
        <details className="rounded-lg border bg-card p-3">
          <summary className="cursor-pointer text-sm font-medium">Resumo por prestador ({summary.length})</summary>
          <div className="mt-3 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Prestador</TableHead>
                  <TableHead className="text-right">A pagar</TableHead>
                  <TableHead className="text-right">Vencidas</TableHead>
                  <TableHead>Próximo vencimento</TableHead>
                  <TableHead className="text-right">Já pago</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.map((s) => (
                  <TableRow key={s.key}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{s.pendingCount ? `${s.pendingCount} · ${formatCurrency(s.pendingTotal)}` : '-'}</TableCell>
                    <TableCell className={`text-right ${s.overdueCount ? 'text-rose-600 font-medium' : ''}`}>{s.overdueCount || '-'}</TableCell>
                    <TableCell>{s.nextDue ? formatDate(s.nextDue) : '-'}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{s.paidTotal ? formatCurrency(s.paidTotal) : '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </details>
      )}

      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por prestador, tratativa, NF ou casa..." className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="requested">A pagar</SelectItem>
            <SelectItem value="paid">Pagas</SelectItem>
            <SelectItem value="cancelled">Canceladas</SelectItem>
            <SelectItem value="all">Todas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={workFilter} onValueChange={setWorkFilter}>
          <SelectTrigger className="md:w-52"><SelectValue placeholder="Casa" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as casas</SelectItem>
            {works.map((w) => <SelectItem key={w.id} value={w.id}>{w.name.trim()}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-card space-y-3">
          <Wallet className="h-10 w-10 mx-auto text-muted-foreground opacity-60" />
          <p className="text-sm text-muted-foreground">Nenhuma solicitação de pagamento de prestador ainda.</p>
          {isAdmin && <Button size="sm" onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" /> Solicitar pagamento</Button>}
        </div>
      ) : (
        <div className="rounded-md border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vencimento</TableHead>
                <TableHead>Prestador / PIX</TableHead>
                <TableHead>Tratativa</TableHead>
                <TableHead>NF</TableHead>
                <TableHead>Casa</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-6 text-center text-muted-foreground">Nenhuma solicitação encontrada.</TableCell>
                </TableRow>
              )}
              {visible.map((p) => {
                const open = p.status === 'requested'
                const state = dueState(p.due_date, today)
                return (
                  <TableRow key={p.id} className={open && state === 'overdue' ? 'bg-rose-50/40' : undefined}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDate(p.due_date.slice(0, 10))}
                      {open && (
                        <div>
                          <Badge variant="outline" className={`mt-1 gap-1 font-normal text-[10px] ${DUE_CLASS[state]}`}>
                            {state === 'overdue' && <AlertTriangle className="h-3 w-3" />}
                            {dueText(p.due_date, today)}
                          </Badge>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{p.provider_name}</div>
                      <button type="button" className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" title="Copiar o PIX" onClick={() => copyPix(p.pix_key)}>
                        PIX: {p.pix_key} <Copy className="h-3 w-3" />
                      </button>
                    </TableCell>
                    <TableCell>
                      <div>{p.service_type}</div>
                      {p.notes && <div className="max-w-xs text-xs text-muted-foreground">{p.notes}</div>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{p.invoice_number}</TableCell>
                    <TableCell>{(p.works?.name ?? p.work_name ?? '-').trim()}</TableCell>
                    <TableCell className="text-right font-semibold whitespace-nowrap">{formatCurrency(Number(p.payment_amount))}</TableCell>
                    <TableCell>
                      {p.status === 'paid' ? (
                        <>
                          <Badge variant="outline" className="gap-1 font-normal border-emerald-300 bg-emerald-50 text-emerald-700">
                            <CheckCircle2 className="h-3 w-3" /> Pago{p.paid_at ? ` em ${formatDate(p.paid_at.slice(0, 10))}` : ''}
                          </Badge>
                          {p.payment_method && <div className="mt-0.5 text-xs text-muted-foreground">{p.payment_method}</div>}
                          {p.finance_notes && <div className="max-w-xs text-xs">{p.finance_notes}</div>}
                        </>
                      ) : p.status === 'cancelled' ? (
                        <Badge variant="outline" className="font-normal border-muted bg-muted/40 text-muted-foreground">{PROVIDER_STATUS_LABEL.cancelled}</Badge>
                      ) : (
                        <Badge variant="outline" className="font-normal border-amber-300 bg-amber-50 text-amber-800">{PROVIDER_STATUS_LABEL.requested}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {open && isFinance && (
                        <Button size="sm" className="h-8 gap-1 mr-1" onClick={() => openPay(p)}>
                          <CheckCircle2 className="h-4 w-4" /> Pagar
                        </Button>
                      )}
                      {open && isAdmin && (
                        <>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar" onClick={() => openEdit(p)}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Cancelar a solicitação" onClick={() => cancel(p)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      {isAdmin && p.status !== 'paid' && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" title="Excluir" onClick={() => remove(p)}>
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

      {/* Abrir / editar a solicitação (admin) */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar solicitação de pagamento' : 'Solicitar pagamento de prestador'}</DialogTitle>
            <DialogDescription>Todos os campos são obrigatórios (menos a observação). O financeiro paga a partir destes dados.</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Prestador cadastrado</Label>
              <Select value={form.provider_id || OTHER} onValueChange={pickProvider}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={OTHER}>Outro (digitar o nome)</SelectItem>
                  {providers.map((p) => <SelectItem key={p.id} value={p.id}>{p.name.trim()}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Escolher um prestador cadastrado em Equipes → Prestadores já preenche nome, tratativa e PIX.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pp-name">Nome *</Label>
                <Input id="pp-name" value={form.provider_name} onChange={(e) => setForm({ ...form, provider_name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pp-pix">PIX *</Label>
                <Input id="pp-pix" value={form.pix_key} onChange={(e) => setForm({ ...form, pix_key: e.target.value })} placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pp-service">Tratativa (tipo de serviço prestado) *</Label>
              <Input id="pp-service" value={form.service_type} onChange={(e) => setForm({ ...form, service_type: e.target.value })} placeholder="Ex.: pintura externa, elétrica, impermeabilização" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pp-nf">NF *</Label>
                <Input id="pp-nf" value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })} placeholder='Número da nota (ou "sem NF")' />
              </div>
              <div className="space-y-1.5">
                <Label>Casa *</Label>
                <Select value={form.work_id} onValueChange={(v) => setForm({ ...form, work_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Em qual casa foi o serviço" /></SelectTrigger>
                  <SelectContent>
                    {works.map((w) => <SelectItem key={w.id} value={w.id}>{w.name.trim()}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pp-val">Valor (R$) *</Label>
                <Input id="pp-val" inputMode="decimal" placeholder="0,00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pp-due">Vencimento *</Label>
                <Input id="pp-due" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pp-notes">Observação</Label>
              <Textarea id="pp-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Opcional" />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" disabled={saving} onClick={() => setFormOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Enviar ao financeiro'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Pagar (financeiro) */}
      <Dialog open={!!paying} onOpenChange={(o) => !o && setPaying(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar o pagamento</DialogTitle>
            <DialogDescription>
              {paying && `${paying.provider_name} · ${paying.service_type} · ${paying.work_name ?? paying.works?.name ?? ''}`}
            </DialogDescription>
          </DialogHeader>
          {paying && (
            <form onSubmit={pay} className="space-y-4">
              <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-0.5">
                <div><span className="text-muted-foreground">Valor:</span> <strong className="text-primary">{formatCurrency(Number(paying.payment_amount))}</strong></div>
                <div><span className="text-muted-foreground">PIX:</span> {paying.pix_key} <button type="button" className="ml-1 text-xs text-primary hover:underline" onClick={() => copyPix(paying.pix_key)}>copiar</button></div>
                <div><span className="text-muted-foreground">NF:</span> {paying.invoice_number} · <span className="text-muted-foreground">Vencimento:</span> {formatDate(paying.due_date.slice(0, 10))}</div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Forma de pagamento</Label>
                  <Select value={payForm.method} onValueChange={(v) => setPayForm({ ...payForm, method: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pay-date">Data do pagamento</Label>
                  <Input id="pay-date" type="date" max={today} value={payForm.date} onChange={(e) => setPayForm({ ...payForm, date: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pay-notes">Observações do financeiro</Label>
                <Textarea id="pay-notes" rows={2} value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} placeholder="Ex.: comprovante enviado" />
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" disabled={saving} onClick={() => setPaying(null)}>Cancelar</Button>
                <Button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Registrar pagamento'}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
