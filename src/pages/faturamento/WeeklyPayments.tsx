import { CalendarCheck, CheckCircle2, Trash2 } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/formatters'
import { groupByWeek, isWeekPayable, weekEndOf, weekLabel, weekPhase, weekPhaseText } from '@/lib/team-week'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export interface WeeklyRow {
  id: string
  member_id: string | null
  member_name: string
  reference: string
  payment_amount: number
  payment_method: string | null
  status: 'pending' | 'paid'
  paid_at: string | null
  week_start: string | null
  week_days: number | null
  week_rate: number | null
  week_extra: number | null
}

interface Props {
  payments: WeeklyRow[]
  today: string
  pixOf: (memberId: string | null) => string | null | undefined
  canDelete: boolean
  onPay: (p: WeeklyRow) => void
  onDelete: (p: WeeklyRow) => void
}

const PHASE_CLASS = {
  future: 'border-muted bg-muted/40 text-muted-foreground',
  running: 'border-blue-300 bg-blue-50 text-blue-700',
  payable: 'border-amber-300 bg-amber-50 text-amber-800',
} as const

/**
 * Pagamento semanal calculado pela presença: o valor de cada pessoa vai somando conforme o admin marca presença
 * (Equipes > Presença) e, fechada a semana (sexta), o financeiro paga pessoa por pessoa.
 */
export default function WeeklyPayments({ payments, today, pixOf, canDelete, onPay, onDelete }: Props) {
  const groups = groupByWeek(payments)

  if (groups.length === 0) {
    return (
      <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Quando o admin marca a presença em <strong>Equipes → Presença</strong>, o valor da semana de cada pessoa
          aparece aqui e vai somando (dias presentes × diária + extra). Fechada a semana (sexta-feira), o pagamento de
          cada pessoa é feito separado.
        </span>
      </div>
    )
  }

  // semanas com algo a pagar ou ainda em andamento ficam à vista; as totalmente pagas ficam recolhidas
  const open = groups.filter((g) => g.pendingCount > 0 || !isWeekPayable(g.weekStart, today))
  const paid = groups.filter((g) => !open.includes(g))

  const week = (g: (typeof groups)[number]) => {
    const phase = weekPhase(g.weekStart, today)
    const payable = phase === 'payable'
    return (
      <section key={g.weekStart} className="space-y-2 rounded-lg border bg-card p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{weekLabel(g.weekStart)}</h3>
            <Badge variant="outline" className={`font-normal ${g.pendingCount === 0 && payable ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : PHASE_CLASS[phase]}`}>
              {g.pendingCount === 0 && payable ? 'Semana paga' : weekPhaseText(g.weekStart, today)}
            </Badge>
          </div>
          {g.pendingCount > 0 && (
            <span className="text-sm text-muted-foreground">
              {payable ? 'A pagar' : 'Até agora'}: <strong className="text-foreground">{formatCurrency(g.pendingTotal)}</strong> · {g.pendingCount} pessoa(s)
            </span>
          )}
        </div>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pessoa</TableHead>
                <TableHead className="text-center">Dias</TableHead>
                <TableHead className="text-right">Diária</TableHead>
                <TableHead className="text-right">Extra / desconto</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {g.rows.map((p) => {
                const pix = pixOf(p.member_id)
                const complement = /complemento/.test(p.reference)
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="font-medium">{p.member_name || '-'}</div>
                      {complement && <div className="text-xs text-muted-foreground">Complemento: presença mudou depois do pagamento</div>}
                      {pix && p.status === 'pending' && <div className="text-xs text-muted-foreground">PIX: {pix}</div>}
                    </TableCell>
                    <TableCell className="text-center">{p.week_days ?? 0}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{formatCurrency(Number(p.week_rate) || 0)}</TableCell>
                    <TableCell className={`text-right whitespace-nowrap ${Number(p.week_extra) < 0 ? 'text-rose-600' : ''}`}>{Number(p.week_extra) !== 0 ? formatCurrency(Number(p.week_extra)) : '-'}</TableCell>
                    <TableCell className="text-right font-semibold whitespace-nowrap">{formatCurrency(Number(p.payment_amount))}</TableCell>
                    <TableCell>
                      {p.status === 'paid' ? (
                        <Badge variant="outline" className="gap-1 font-normal border-emerald-300 bg-emerald-50 text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" /> Pago{p.paid_at ? ` em ${formatDate(p.paid_at)}` : ''}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className={`font-normal ${PHASE_CLASS[phase]}`}>
                          {payable ? 'A pagar' : 'Contando'}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {p.status === 'pending' && (
                        <Button
                          variant={payable ? 'default' : 'outline'}
                          size="sm"
                          className="h-8 gap-1 mr-1"
                          disabled={!payable}
                          title={payable ? 'Registrar o pagamento de hoje' : `Libera na sexta ${weekEndOf(g.weekStart).slice(8, 10)}/${weekEndOf(g.weekStart).slice(5, 7)}, quando a semana fecha`}
                          onClick={() => onPay(p)}
                        >
                          <CheckCircle2 className="h-4 w-4" /> Pagar
                        </Button>
                      )}
                      {canDelete && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" title="Excluir" onClick={() => onDelete(p)}>
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
      </section>
    )
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">Pagamento semanal da equipe</h2>
        <p className="text-sm text-muted-foreground">
          Calculado pela presença marcada (semana de sábado a sexta). O valor de cada pessoa vai somando e, na sexta, a semana fecha para pagamento.
        </p>
      </div>
      {open.map(week)}
      {paid.length > 0 && (
        <details className="rounded-lg border p-3">
          <summary className="cursor-pointer text-sm font-medium">Semanas pagas ({paid.length})</summary>
          <div className="mt-3 space-y-3">{paid.map(week)}</div>
        </details>
      )}
    </div>
  )
}
