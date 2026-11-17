import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Minus, RotateCcw, ShieldCheck, X } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency, formatSupabaseError } from '@/lib/formatters'
import {
  WEEKDAY_SHORT,
  addDaysISO,
  conferenceState,
  dayMonth,
  gridTotals,
  localTodayISO,
  presenceGrid,
  weekDates,
  weekEndOf,
  weekLabel,
  weekStartOf,
  weeksAwaitingApproval,
  type DayMark,
  type GridExtra,
  type GridMember,
  type GridRecord,
} from '@/lib/team-week'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

interface Approval {
  week_start: string
  approved_at: string
  approved_by: string | null
  notes: string | null
  approver?: { full_name: string | null; email: string | null } | null
}

const STATE_BADGE = {
  future: { text: 'Semana ainda não começou', cls: 'border-muted bg-muted/40 text-muted-foreground' },
  running: { text: 'Em andamento', cls: 'border-blue-300 bg-blue-50 text-blue-700' },
  awaiting: { text: 'Aguardando a conferência do admin', cls: 'border-amber-300 bg-amber-50 text-amber-800' },
  approved: { text: 'Conferida e aprovada', cls: 'border-emerald-300 bg-emerald-50 text-emerald-700' },
} as const

function Mark({ mark }: { mark: DayMark }) {
  if (mark === 'present') return <Check className="mx-auto h-4 w-4 text-emerald-600" aria-label="Presente" />
  if (mark === 'absent') return <X className="mx-auto h-4 w-4 text-rose-600" aria-label="Ausente" />
  return <Minus className="mx-auto h-4 w-4 text-muted-foreground/50" aria-label="Sem marcação" />
}

/**
 * Conferência da semana (toda sexta): o admin confere a presença de toda a equipe, de sábado a sexta, e aprova a semana.
 * Só depois disso o financeiro paga. O Gestor e o Financeiro só consultam.
 */
export default function ConferenceTab() {
  const { role, canSeeValues } = useAuth()
  const { toast } = useToast()
  const isAdmin = role === 'admin'
  const today = localTodayISO()

  const [weekStart, setWeekStart] = useState(() => weekStartOf(today))
  const touched = useRef(false) // o usuário já escolheu uma semana: não troca sozinho
  const [members, setMembers] = useState<GridMember[]>([])
  const [records, setRecords] = useState<GridRecord[]>([])
  const [extras, setExtras] = useState<GridExtra[]>([])
  const [approval, setApproval] = useState<Approval | null>(null)
  const [awaiting, setAwaiting] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notes, setNotes] = useState('')

  // semanas fechadas que esperam a aprovação (só quem lê os pagamentos calculados enxerga)
  const loadAwaiting = useCallback(async () => {
    const [p, a] = await Promise.all([
      supabase.from('team_payments' as any).select('week_start').eq('source', 'attendance').eq('status', 'pending'),
      supabase.from('team_week_approvals' as any).select('week_start'),
    ])
    const pending = ((p.data ?? []) as unknown as { week_start: string | null }[]).map((r) => r.week_start).filter((w): w is string => !!w)
    const approved = new Set(((a.data ?? []) as unknown as { week_start: string }[]).map((r) => r.week_start.slice(0, 10)))
    const list = weeksAwaitingApproval(pending, approved, today)
    setAwaiting(list)
    return list
  }, [today])

  const loadWeek = useCallback(async () => {
    setLoading(true)
    const dates = weekDates(weekStart)
    const [m, r, e, a] = await Promise.all([
      supabase.from('team_members').select('id, name, role, daily_cost, payment_type, status').is('provider_id', null).order('name'),
      supabase.from('attendance_records').select('worker_id, date, is_present').gte('date', dates[0]).lte('date', dates[6]),
      supabase.from('attendance_extras').select('worker_id, week_start_date, extra_value').eq('week_start_date', weekStart),
      supabase.from('team_week_approvals' as any).select('*, approver:approved_by(full_name, email)').eq('week_start', weekStart).maybeSingle(),
    ])
    setMembers((m.data ?? []) as unknown as GridMember[])
    setRecords((r.data ?? []) as unknown as GridRecord[])
    setExtras((e.data ?? []) as unknown as GridExtra[])
    setApproval((a.data ?? null) as unknown as Approval | null)
    setLoading(false)
  }, [weekStart])

  useEffect(() => {
    loadWeek()
  }, [loadWeek])

  useEffect(() => {
    loadAwaiting().then((list) => {
      if (!touched.current && list.length > 0) setWeekStart(list[0])
    })
  }, [loadAwaiting])

  const go = (start: string) => {
    touched.current = true
    setWeekStart(start)
    setNotes('')
  }

  const grid = useMemo(() => presenceGrid(members, records, extras, weekStart), [members, records, extras, weekStart])
  const totals = useMemo(() => gridTotals(grid), [grid])
  const dates = weekDates(weekStart)
  const state = conferenceState(weekStart, today, !!approval)
  const unmarked = grid.filter((r) => r.unmarked)

  const approve = async () => {
    const what = canSeeValues ? ` O financeiro poderá pagar ${formatCurrency(totals.total)} (${totals.payees} pessoa(s)).` : ''
    if (!confirm(`Confirma que você conferiu a presença de toda a equipe de ${dayMonth(weekStart)} a ${dayMonth(weekEndOf(weekStart))}?${what}`)) return
    setSaving(true)
    const { error } = await supabase.from('team_week_approvals' as any).insert({ week_start: weekStart, notes: notes.trim() || null })
    setSaving(false)
    if (error) {
      toast({ title: 'Erro ao aprovar a semana', description: formatSupabaseError(error), variant: 'destructive' })
      return
    }
    toast({ title: 'Semana aprovada', description: 'O financeiro já pode fazer o pagamento de cada pessoa.' })
    setNotes('')
    await Promise.all([loadWeek(), loadAwaiting()])
  }

  const reopen = async () => {
    if (!confirm('Reabrir a conferência? O financeiro não poderá pagar essa semana até você aprovar de novo.')) return
    setSaving(true)
    const { error } = await supabase.from('team_week_approvals' as any).delete().eq('week_start', weekStart)
    setSaving(false)
    if (error) {
      toast({ title: 'Erro ao reabrir', description: formatSupabaseError(error), variant: 'destructive' })
      return
    }
    toast({ title: 'Conferência reaberta' })
    await Promise.all([loadWeek(), loadAwaiting()])
  }

  const approver = approval?.approver?.full_name?.trim() || approval?.approver?.email || 'admin'

  return (
    <div className="space-y-4">
      {awaiting.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {awaiting.length} semana(s) fechada(s) aguardando a conferência do admin para o financeiro pagar:{' '}
            {awaiting.map((w) => `${dayMonth(w)} a ${dayMonth(weekEndOf(w))}`).join(', ')}.
          </span>
          {awaiting[0] !== weekStart && (
            <Button size="sm" variant="outline" className="bg-white" onClick={() => go(awaiting[0])}>
              Ir para a mais antiga
            </Button>
          )}
        </div>
      )}

      <Card className="shadow-none">
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => go(addDaysISO(weekStart, -7))} title="Semana anterior">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div>
                <h2 className="text-lg font-semibold">{weekLabel(weekStart)}</h2>
                <p className="text-xs text-muted-foreground">De sábado a sexta-feira. A conferência abre na sexta, último dia da semana.</p>
              </div>
              <Button variant="outline" size="icon" onClick={() => go(addDaysISO(weekStart, 7))} title="Próxima semana">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Badge variant="outline" className={cn('gap-1 font-normal', STATE_BADGE[state].cls)}>
              {state === 'approved' && <ShieldCheck className="h-3.5 w-3.5" />}
              {STATE_BADGE[state].text}
            </Badge>
          </div>

          {state === 'future' && <p className="text-sm text-muted-foreground">Essa semana ainda não começou.</p>}
          {state === 'running' && (
            <p className="text-sm text-muted-foreground">
              A semana está em andamento. Na sexta-feira ({dayMonth(weekEndOf(weekStart))}) o admin confere a presença de toda a equipe e aprova; só então o
              financeiro paga.
            </p>
          )}
          {state === 'awaiting' && (
            <div className="space-y-2">
              <p className="text-sm">
                {isAdmin
                  ? 'Confira abaixo se a presença de cada pessoa foi marcada certo. Se algo estiver errado, corrija em Controle de Diárias e volte aqui. Estando tudo certo, aprove: o financeiro passa a poder pagar.'
                  : 'O admin ainda não conferiu esta semana. O financeiro só paga depois da aprovação.'}
              </p>
              {isAdmin && (
                <div className="flex flex-wrap items-end gap-2">
                  <Textarea
                    rows={1}
                    className="min-h-9 max-w-md flex-1"
                    placeholder="Observação da conferência (opcional)"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                  <Button className="gap-1.5" disabled={saving || loading} onClick={approve}>
                    <ShieldCheck className="h-4 w-4" /> {saving ? 'Aprovando...' : 'Conferi: aprovar a semana'}
                  </Button>
                </div>
              )}
              {unmarked.length > 0 && (
                <p className="flex items-center gap-1.5 text-sm text-amber-800">
                  <AlertTriangle className="h-4 w-4" /> {unmarked.length} pessoa(s) ativa(s) sem nenhuma marcação nesta semana: {unmarked.map((r) => r.member.name.trim()).join(', ')}.
                </p>
              )}
            </div>
          )}
          {state === 'approved' && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm">
                Conferida e aprovada por <strong>{approver}</strong> em {new Date(approval!.approved_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}. O financeiro pode pagar.
                {approval?.notes ? ` Observação: ${approval.notes}` : ''}
              </p>
              {isAdmin && (
                <Button size="sm" variant="outline" className="gap-1.5" disabled={saving} onClick={reopen}>
                  <RotateCcw className="h-4 w-4" /> Reabrir conferência
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-md border bg-card">
        <Table className="min-w-[760px] text-sm">
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[180px]">Pessoa</TableHead>
              {dates.map((d, i) => (
                <TableHead key={d} className="text-center">
                  <div>{WEEKDAY_SHORT[i]}</div>
                  <div className="text-[10px] font-normal text-muted-foreground">{dayMonth(d)}</div>
                </TableHead>
              ))}
              <TableHead className="text-center">Dias</TableHead>
              {canSeeValues && <TableHead className="text-right">Diária</TableHead>}
              {canSeeValues && <TableHead className="text-right">Extra / desconto</TableHead>}
              {canSeeValues && <TableHead className="text-right">Valor da semana</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={canSeeValues ? 12 : 9} className="py-8 text-center text-muted-foreground">Carregando...</TableCell>
              </TableRow>
            ) : grid.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canSeeValues ? 12 : 9} className="py-8 text-center text-muted-foreground">Nenhum funcionário ativo.</TableCell>
              </TableRow>
            ) : (
              grid.map((r) => (
                <TableRow key={r.member.id} className={r.unmarked ? 'bg-amber-50/60' : undefined}>
                  <TableCell>
                    <div className="font-medium">{r.member.name.trim()}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.member.role ?? ''}
                      {r.monthly ? ' · mensal (contrato)' : ''}
                      {r.member.status !== 'active' ? ' · inativo' : ''}
                    </div>
                    {r.unmarked && <div className="text-[11px] font-medium text-amber-800">sem nenhuma marcação na semana</div>}
                  </TableCell>
                  {r.marks.map((m, i) => (
                    <TableCell key={i} className="px-1 text-center">
                      <Mark mark={m} />
                    </TableCell>
                  ))}
                  <TableCell className="text-center font-bold">{r.days}</TableCell>
                  {canSeeValues && (
                    <TableCell className="whitespace-nowrap text-right text-muted-foreground">
                      {r.monthly ? 'Mensal' : formatCurrency(Number(r.member.daily_cost) || 0)}
                    </TableCell>
                  )}
                  {canSeeValues && (
                    <TableCell className={cn('whitespace-nowrap text-right', r.extra < 0 && 'text-rose-600')}>
                      {r.extra !== 0 ? formatCurrency(r.extra) : '-'}
                    </TableCell>
                  )}
                  {canSeeValues && (
                    <TableCell className="whitespace-nowrap text-right font-semibold text-primary">
                      {r.monthly ? 'Contrato' : formatCurrency(r.total)}
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
            {!loading && grid.length > 0 && (
              <TableRow className="bg-muted/30 font-semibold">
                <TableCell>Total da equipe</TableCell>
                <TableCell colSpan={7} />
                <TableCell className="text-center">{totals.days}</TableCell>
                {canSeeValues && <TableCell />}
                {canSeeValues && <TableCell />}
                {canSeeValues && <TableCell className="whitespace-nowrap text-right text-primary">{formatCurrency(totals.total)}</TableCell>}
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        ✓ presente · ✗ ausente · – sem marcação. Se a presença, o extra ou a diária mudarem depois da aprovação, a aprovação cai e a semana volta a precisar de conferência.
      </p>
    </div>
  )
}
