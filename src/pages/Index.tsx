import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { AlertCircle, Building2, Clock, CheckCircle2 } from 'lucide-react'
import { formatCurrency, getStatusColor, translateStatus, formatDate } from '@/lib/formatters'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import DashboardCharts from './dashboard/DashboardCharts'
import { useData } from '@/hooks/use-data'
import { Obra, Despesa } from '@/types'

export default function Index() {
  const { data: obras, loading: loadObras } = useData<Obra>('works')
  const { data: despesas, loading: loadDespesas } = useData<Despesa>('expenses')

  if (loadObras || loadDespesas) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-4 md:grid-cols-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    )
  }

  const today = new Date().toISOString().split('T')[0]
  const totalObras = obras.length
  const emAndamento = obras.filter((o) => o.status === 'in_progress').length
  const atrasadas = obras.filter(
    (o) => o.end_date_planned < today && o.status !== 'finished' && o.status !== 'completed',
  )
  const avgProgress =
    obras.reduce((acc, o) => acc + (Number(o.progress_percentage) || 0), 0) / (totalObras || 1)

  const totalBudget = obras.reduce((acc, o) => acc + (Number(o.budget_planned) || 0), 0)
  const totalSpent = despesas.reduce((acc, d) => acc + (Number(d.value) || 0), 0)
  const budgetConsumedPercent = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Obras
            </CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalObras}</div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Em Andamento
            </CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{emAndamento}</div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow border-red-100 bg-red-50/30">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-red-600">
              Obras em Risco/Atraso
            </CardTitle>
            <AlertCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{atrasadas.length}</div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Progresso Médio
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgProgress.toFixed(1)}%</div>
            <Progress value={avgProgress} className="h-2 mt-3" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Saúde Financeira Global
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between mb-2">
              <div>
                <p className="text-sm text-muted-foreground">Previsto</p>
                <p className="text-xl font-bold">{formatCurrency(totalBudget)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Realizado</p>
                <p className="text-xl font-bold text-primary">{formatCurrency(totalSpent)}</p>
              </div>
            </div>
            <Progress value={budgetConsumedPercent} className="h-3 bg-secondary" />
            <p className="text-xs text-muted-foreground mt-2 text-right">
              {budgetConsumedPercent.toFixed(1)}% consumido
            </p>
          </CardContent>
        </Card>
        <Card className="flex flex-col justify-center">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Obras com Maior Risco
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {atrasadas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma obra em risco detectada.</p>
              ) : (
                atrasadas.slice(0, 3).map((obra) => (
                  <div
                    key={obra.id}
                    className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0"
                  >
                    <div>
                      <p className="font-medium text-sm">{obra.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Fim planejado: {formatDate(obra.end_date_planned)}
                      </p>
                    </div>
                    <Badge variant="outline" className={getStatusColor(obra.status)}>
                      {translateStatus(obra.status)}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <DashboardCharts despesas={despesas} />
    </div>
  )
}
