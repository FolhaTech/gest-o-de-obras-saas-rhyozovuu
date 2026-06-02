import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { formatCurrency, formatDate } from '@/lib/formatters'
import { Obra, Despesa } from '@/types'
import { Calendar, User, MapPin } from 'lucide-react'
import { useDataFilter } from '@/hooks/use-data'
import { Skeleton } from '@/components/ui/skeleton'

export default function OverviewTab({ obra }: { obra: Obra }) {
  const { data: despesas, loading } = useDataFilter<Despesa>('expenses', 'work_id', obra.id)

  if (loading) return <Skeleton className="h-64 w-full" />

  const totalSpent = despesas.reduce((acc, d) => acc + Number(d.value), 0)
  const budgetPercent = Math.min((totalSpent / (Number(obra.budget_planned) || 1)) * 100, 100)

  return (
    <div className="grid gap-6 md:grid-cols-3">
      <div className="md:col-span-2 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Detalhes do Projeto</CardTitle>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Endereço</p>
                <p className="text-sm">{obra.address || '-'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <User className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Engenheiro Responsável</p>
                <p className="text-sm">{obra.manager || '-'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Início</p>
                <p className="text-sm">{formatDate(obra.start_date)}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Previsão Fim</p>
                <p className="text-sm">{formatDate(obra.end_date_planned)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Resumo Financeiro</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-end">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Custo Realizado vs Orçamento</p>
                <p className="text-2xl font-bold">{formatCurrency(totalSpent)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-muted-foreground">
                  de {formatCurrency(obra.budget_planned)}
                </p>
              </div>
            </div>
            <div>
              <Progress
                value={budgetPercent}
                className={`h-3 ${budgetPercent > 90 ? 'bg-red-200 [&>div]:bg-red-500' : ''}`}
              />
              <p className="text-xs text-right mt-1.5 text-muted-foreground">
                {budgetPercent.toFixed(1)}% utilizado
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Progresso Físico</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-6">
            <div className="relative flex items-center justify-center h-32 w-32 rounded-full border-8 border-muted">
              <svg
                className="absolute inset-0 h-full w-full -rotate-90 transform"
                viewBox="0 0 100 100"
              >
                <circle
                  cx="50"
                  cy="50"
                  r="46"
                  fill="transparent"
                  stroke="hsl(var(--primary))"
                  strokeWidth="8"
                  strokeDasharray={`${(obra.progress_percentage / 100) * 289} 289`}
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              <span className="text-3xl font-bold">{Math.round(obra.progress_percentage)}%</span>
            </div>
            <p className="mt-4 text-sm text-muted-foreground text-center">
              Conclusão baseada nas medições das etapas.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
