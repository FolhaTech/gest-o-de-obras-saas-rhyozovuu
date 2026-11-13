import { useCallback, useEffect, useMemo, useState } from 'react'
import { Clock, Edit2, Eye, PackagePlus, Plus, RefreshCw, Search, ShoppingCart, Trash2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency, formatDate, formatSupabaseError } from '@/lib/formatters'
import {
  MIN_QUOTES,
  PAYMENT_MODE_LABEL,
  STATUS_LABEL,
  URGENCY_LABEL,
  canCancel,
  canDecide,
  canEditRequest,
  currentRound,
  daysLate,
  distinctSuppliers,
  fulfillAction,
  isBought,
  isOpen,
  needsMyAction,
  sortRequests,
  waitingText,
  type PurchaseRequestRow,
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
import DecisionDialog from './DecisionDialog'
import DetailsDialog from './DetailsDialog'
import FulfillDialog from './FulfillDialog'
import QuotesDialog from './QuotesDialog'
import { STATUS_CLASS, URGENCY_CLASS, fmtQty, todayISO, who } from './helpers'

const SELECT =
  '*, works:work_id(id, name), requester:requested_by(full_name, email, role), handler:handled_by(full_name, email), approver:approver_id(full_name, email)'
const NO_WORK = '__none__'
const UNITS = ['un', 'kg', 'saco', 'm', 'm²', 'm³', 'L', 'cx', 'pç', 'jogo']

const num = (v: string) => Number((v || '0').replace(',', '.'))

interface Line {
  key: number
  item: string
  quantity: string
  unit: string
  notes: string
}
let lineKey = 0
const newLine = (): Line => ({ key: ++lineKey, item: '', quantity: '1', unit: 'un', notes: '' })

interface QuoteLite {
  request_id: string
  round: number
  supplier: string
}

/**
 * Faturamento > Compras. Fluxo: o usuário solicita; o financeiro cota (3 ou mais fornecedores) e envia ao admin que
 * abriu; o admin aprova (ou recusa e o financeiro refaz); o financeiro compra, escolhe o pagamento (antecipado ou
 * após a entrega), libera o pagamento, recebe e confere e encerra.
 */
export default function PurchasesPanel({ onTodoCount }: { onTodoCount?: (n: number) => void }) {
  const { toast } = useToast()
  const { user, role, canSeeBilling } = useAuth()
  const isFinance = role === 'financeiro'
  const isAdmin = role === 'admin'
  const seesAll = role !== 'prestador'

  const [items, setItems] = useState<PurchaseRequestRow[]>([])
  const [quotes, setQuotes] = useState<QuoteLite[]>([])
  const [works, setWorks] = useState<{ id: string; name: string }[]>([])
  const [catalog, setCatalog] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [statusFilter, setStatusFilter] = useState('open')
  const [workFilter, setWorkFilter] = useState('all')
  const [search, setSearch] = useState('')

  // nova solicitação / edição
  const [reqOpen, setReqOpen] = useState(false)
  const [editing, setEditing] = useState<PurchaseRequestRow | null>(null)
  const [reqForm, setReqForm] = useState({ work_id: NO_WORK, urgency: 'normal' as Urgency, needed_by: '' })
  const [lines, setLines] = useState<Line[]>([newLine()])
  const [saving, setSaving] = useState(false)
  // telas do fluxo (guardam só o id; a solicitação vem da lista, sempre atualizada)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [quotesId, setQuotesId] = useState<string | null>(null)
  const [decideId, setDecideId] = useState<string | null>(null)
  const [fulfillId, setFulfillId] = useState<string | null>(null)

  const today = todayISO()

  const fetchAll = useCallback(async () => {
    const [rRes, wRes, mRes, qRes] = await Promise.all([
      supabase.from('purchase_requests' as any).select(SELECT).order('created_at', { ascending: false }),
      supabase.from('works').select('id, name').order('name'),
      supabase.from('materials').select('name').order('name'),
      // as cotações são valores: só Admin e Financeiro leem (para os outros a lista vem vazia)
      supabase.from('purchase_quotes' as any).select('request_id, round, supplier'),
    ])
    if (rRes.error) {
      setError(formatSupabaseError(rRes.error))
    } else {
      setError(null)
      setItems((rRes.data ?? []) as unknown as PurchaseRequestRow[])
    }
    setQuotes(qRes.error ? [] : ((qRes.data ?? []) as unknown as QuoteLite[]))
    setWorks((wRes.data ?? []) as { id: string; name: string }[])
    setCatalog(((mRes.data ?? []) as { name: string }[]).map((m) => m.name))
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const mine = useCallback(
    (r: PurchaseRequestRow) => needsMyAction(r, user?.id, role, r.requester?.role),
    [user?.id, role],
  )
  const todoCount = items.filter(mine).length
  useEffect(() => {
    onTodoCount?.(todoCount)
  }, [todoCount, onTodoCount])

  // cotações da rodada atual de cada solicitação (fornecedores diferentes)
  const quoteCount = useMemo(() => {
    const out: Record<string, number> = {}
    for (const r of items) out[r.id] = distinctSuppliers(currentRound(quotes.filter((q) => q.request_id === r.id), r.quote_round))
    return out
  }, [items, quotes])

  const visible = useMemo(() => {
    const t = search.trim().toLowerCase()
    const list = items.filter((r) => {
      if (statusFilter === 'open') {
        if (!isOpen(r.status)) return false
      } else if (statusFilter === 'mine') {
        if (!mine(r)) return false
      } else if (statusFilter !== 'all' && r.status !== statusFilter) return false
      if (workFilter !== 'all' && (workFilter === NO_WORK ? r.work_id !== null : r.work_id !== workFilter)) return false
      if (!t) return true
      return r.item.toLowerCase().includes(t) || (r.works?.name ?? '').toLowerCase().includes(t) || who(r.requester).toLowerCase().includes(t) || (r.supplier ?? '').toLowerCase().includes(t)
    })
    return sortRequests(list)
  }, [items, statusFilter, workFilter, search, mine])

  const monthPrefix = today.slice(0, 7)
  const count = (...st: PurchaseStatus[]) => items.filter((r) => st.includes(r.status)).length
  const boughtMonth = items.filter((r) => isBought(r.status) && (r.purchased_at ?? '').startsWith(monthPrefix))
  const boughtMonthValue = boughtMonth.reduce((s, r) => s + (Number(r.final_value) || 0), 0)
  const late = items.filter((r) => daysLate(r, today) > 0).length
  const minePending = items.filter((r) => r.requested_by === user?.id && r.status === 'requested').length

  const detail = items.find((r) => r.id === detailId) ?? null
  const quotesOf = items.find((r) => r.id === quotesId) ?? null
  const decideOf = items.find((r) => r.id === decideId) ?? null
  const fulfillOf = items.find((r) => r.id === fulfillId) ?? null

  // ---------------------------------------------------------------- solicitar
  const openCreate = () => {
    setEditing(null)
    setReqForm({ work_id: NO_WORK, urgency: 'normal', needed_by: '' })
    setLines([newLine()])
    setReqOpen(true)
  }
  const openEdit = (r: PurchaseRequestRow) => {
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
      description: editing ? undefined : 'O financeiro recebeu o pedido e vai devolver as cotações para aprovação.',
    })
    setReqOpen(false)
    fetchAll()
  }

  const cancelRequest = async (r: PurchaseRequestRow) => {
    if (!confirm(`Cancelar a solicitação de "${r.item}"?`)) return
    const { error: err } = await supabase.from('purchase_requests' as any).update({ status: 'cancelled' }).eq('id', r.id)
    if (err) {
      toast({ title: 'Erro ao cancelar', description: formatSupabaseError(err), variant: 'destructive' })
      return
    }
    toast({ title: 'Solicitação cancelada' })
    fetchAll()
  }

  const deleteRequest = async (r: PurchaseRequestRow) => {
    if (!confirm(`Excluir a solicitação de "${r.item}"${r.status === 'requested' ? '' : ' e as cotações dela'}? Isso não pode ser desfeito.`)) return
    const { error: err } = await supabase.from('purchase_requests' as any).delete().eq('id', r.id)
    if (err) {
      toast({ title: 'Erro ao excluir', description: formatSupabaseError(err), variant: 'destructive' })
      return
    }
    toast({ title: 'Solicitação excluída' })
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
    { label: 'Pendentes pelo financeiro', value: String(count('requested')), cls: count('requested') ? 'text-blue-600' : '' },
    { label: 'Em cotação', value: String(count('quoting')), cls: '' },
    { label: 'Aprovação do admin', value: String(count('quotes_sent')), cls: count('quotes_sent') ? 'text-amber-600' : '' },
    { label: 'Aprovadas: a comprar', value: String(count('approved')), cls: count('approved') ? 'text-teal-600' : '' },
    { label: 'Pagamento / entrega', value: String(count('awaiting_payment', 'awaiting_delivery', 'awaiting_release')), cls: '' },
    { label: 'Compradas no mês', value: String(boughtMonth.length), cls: '' },
    ...(canSeeBilling ? [{ label: 'Valor comprado no mês', value: formatCurrency(boughtMonthValue), cls: '' }] : []),
  ]

  const intro = isFinance
    ? `Cote cada pedido com ${MIN_QUOTES} ou mais fornecedores e envie ao admin que abriu. Aprovada a cotação, faça a compra, libere o pagamento e receba e confira a entrega.`
    : isAdmin
      ? 'Abra a solicitação: o financeiro devolve as cotações para você aprovar ou recusar (recusadas, ele refaz a cotação).'
      : 'Peça aqui o que precisa ser comprado. A solicitação fica pendente pelo financeiro e você acompanha cada etapa.'

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{intro}</p>
        <Button className="gap-2 shrink-0" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Solicitar compra
        </Button>
      </div>

      {!seesAll && (
        <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">Você vê somente as solicitações que fez.</div>
      )}
      {!isFinance && !isAdmin && minePending > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 flex items-center gap-2">
          <Clock className="h-4 w-4 shrink-0" />
          Você tem {minePending} solicitação(ões) <strong>pendente(s) pelo financeiro</strong>. Elas ficam com o financeiro até ele iniciar as cotações.
        </div>
      )}
      {(isFinance || isAdmin) && todoCount > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4 shrink-0" />
            {isAdmin
              ? `${todoCount} solicitação(ões) com cotações aguardando a sua aprovação.`
              : `${todoCount} solicitação(ões) aguardando a sua ação.`}
          </span>
          <Button size="sm" variant="outline" className="shrink-0 bg-white" onClick={() => setStatusFilter('mine')}>Ver</Button>
        </div>
      )}

      <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 ${canSeeBilling ? 'xl:grid-cols-7' : 'xl:grid-cols-6'}`}>
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
          <SelectTrigger className="md:w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Em aberto</SelectItem>
            {(isFinance || isAdmin) && <SelectItem value="mine">Aguardando a minha ação</SelectItem>}
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
                <TableHead>Cotação / compra</TableHead>
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
                const fulfill = isFinance ? fulfillAction(r) : null
                const myTurn = mine(r)
                const hasValue = canSeeBilling && (Number(r.final_value) > 0 || Number(r.quoted_value) > 0)
                return (
                  <TableRow key={r.id} className={myTurn ? 'bg-amber-50/40' : undefined}>
                    <TableCell className="whitespace-nowrap text-sm">{formatDate(r.created_at.slice(0, 10))}</TableCell>
                    <TableCell>
                      <div className="font-medium">{r.item}</div>
                      <div className="text-xs text-muted-foreground">{fmtQty(Number(r.quantity))} {r.unit ?? ''}</div>
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
                      <Badge variant="outline" className={`font-normal gap-1 ${STATUS_CLASS[r.status]}`}>
                        {r.status === 'requested' && <Clock className="h-3 w-3" />}
                        {STATUS_LABEL[r.status]}
                      </Badge>
                      <div className="mt-1 max-w-[14rem] text-[11px] leading-tight text-muted-foreground">{waitingText(r.status, r.payment_mode)}</div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.supplier && <div>{r.supplier}</div>}
                      {hasValue && (
                        <div className="text-xs font-medium text-primary">
                          {Number(r.final_value) > 0 ? formatCurrency(Number(r.final_value)) : `cotado ${formatCurrency(Number(r.quoted_value))}`}
                        </div>
                      )}
                      {r.payment_mode && <div className="text-xs text-muted-foreground">{PAYMENT_MODE_LABEL[r.payment_mode]}</div>}
                      {r.invoice_number && <div className="text-xs text-muted-foreground">NF {r.invoice_number}</div>}
                      {canSeeBilling && (r.status === 'requested' || r.status === 'quoting') && (
                        <div className="text-xs text-muted-foreground">
                          {quoteCount[r.id] ?? 0}/{MIN_QUOTES} cotações{r.quote_round > 1 ? ` · rodada ${r.quote_round}` : ''}
                        </div>
                      )}
                      {r.status === 'quoting' && r.quote_round > 1 && r.admin_notes && (
                        <div className="text-xs text-rose-700 max-w-xs">Recusa do admin: {r.admin_notes}</div>
                      )}
                      {r.finance_notes && <div className="text-xs max-w-xs">{r.finance_notes}</div>}
                      {!r.supplier && !r.finance_notes && !r.invoice_number && !hasValue && !(canSeeBilling && (r.status === 'requested' || r.status === 'quoting')) && (
                        <span className="text-xs text-muted-foreground">{r.status === 'requested' ? 'Aguardando o financeiro' : '-'}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {isFinance && (r.status === 'requested' || r.status === 'quoting') && (
                        <Button size="sm" className="h-8 mr-1" variant={myTurn ? 'default' : 'outline'} onClick={() => setQuotesId(r.id)}>
                          Cotações
                        </Button>
                      )}
                      {fulfill && (
                        <Button size="sm" className="h-8 mr-1" onClick={() => setFulfillId(r.id)}>
                          {fulfill.button}
                        </Button>
                      )}
                      {canDecide(r, user?.id, role, r.requester?.role) && (
                        <Button size="sm" className="h-8 mr-1" onClick={() => setDecideId(r.id)}>
                          Aprovar / recusar
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Ver andamento" onClick={() => setDetailId(r.id)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      {canEditRequest(r, user?.id) && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar" onClick={() => openEdit(r)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      )}
                      {canCancel(r, user?.id, role) && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Cancelar solicitação" onClick={() => cancelRequest(r)}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                      {(isAdmin || canEditRequest(r, user?.id)) && (
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

      {/* Etapas do fluxo */}
      <DetailsDialog request={detail} canSeeQuotes={canSeeBilling} onClose={() => setDetailId(null)} />
      {isFinance && <QuotesDialog request={quotesOf} onClose={() => setQuotesId(null)} onChanged={fetchAll} />}
      {isAdmin && <DecisionDialog request={decideOf} onClose={() => setDecideId(null)} onChanged={fetchAll} />}
      {isFinance && <FulfillDialog request={fulfillOf} onClose={() => setFulfillId(null)} onChanged={fetchAll} />}

      {/* Solicitar compra */}
      <Dialog open={reqOpen} onOpenChange={setReqOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar solicitação' : 'Solicitar compra'}</DialogTitle>
            <DialogDescription>Informe o que precisa ser comprado. O financeiro cota e devolve as cotações para aprovação.</DialogDescription>
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
    </div>
  )
}
