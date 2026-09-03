import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  AlertCircle,
  Building2,
  Clock,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Wallet,
  Package,
  Database,
  RefreshCw,
  WifiOff,
} from 'lucide-react'
import { formatCurrency, getStatusColor, translateStatus, formatDate } from '@/lib/formatters'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import DashboardCharts from './dashboard/DashboardCharts'
import { useData } from '@/hooks/use-data'
import { Obra, Despesa, Receita, Material } from '@/types'

export default function Index() {
  const {
    data: obras,
    loading: loadObras,
    error: errObras,
    isTableMissing: missingObras,
    isNetworkError: netObras,
    refetch: refetchObras,
  } = useData<Obra>('works')

  const {
    data: despesas,
    loading: loadDespesas,
    error: errDespesas,
    isTableMissing: missingDespesas,
    isNetworkError: netDespesas,
    refetch: refetchDespesas,
  } = useData<Despesa>('expenses')

  const {
    data: receitas,
    loading: loadReceitas,
    error: errReceitas,
    isTableMissing: missingReceitas,
    isNetworkError: netReceitas,
    refetch: refetchReceitas,
  } = useData<Receita>('revenues')

  const {
    data: materiais,
    loading: loadMateriais,
    error: errMateriais,
    isTableMissing: missingMateriais,
    isNetworkError: netMateriais,
    refetch: refetchMateriais,
  } = useData<Material>('materials')

  const isLoading = loadObras || loadDespesas || loadReceitas || loadMateriais
  const hasTableMissing = missingObras || missingDespesas || missingReceitas || missingMateriais
  const hasNetworkError = netObras || netDespesas || netReceitas || netMateriais
  const hasAnyError = Boolean(errObras || errDespesas || errReceitas || errMateriais)

  const handleRefreshAll = () => {
    refetchObras()
    refetchDespesas()
    refetchReceitas()
    refetchMateriais()
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-4 md:grid-cols-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
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
    (o) => !!o.end_date_planned && o.end_date_planned < today && o.status !== 'finished',
  )
  const avgProgress =
    obras.reduce((acc, o) => acc + (Number(o.progress_percentage) || 0), 0) / (totalObras || 1)

  const totalBudget = obras.reduce((acc, o) => acc + (Number(o.budget_planned) || 0), 0)
  const totalSpent = despesas.reduce((acc, d) => acc + (Number(d.value) || 0), 0)
  const totalRevenue = receitas.reduce((acc, r) => acc + (Number(r.value) || 0), 0)

  const allocatedMaterialsCount = materiais.filter((m) => m.work_id !== null).length

  const budgetConsumedPercent = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0
  const balance = totalRevenue - totalSpent

  // ROI Global da Empresa
  const globalInvestment = totalSpent > 0 ? totalSpent : totalBudget
  const globalRoi =
    globalInvestment > 0 ? ((totalRevenue - globalInvestment) / globalInvestment) * 100 : null

  return (
    <div className="space-y-6">
      {hasTableMissing && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900">
          <Database className="h-5 w-5 text-amber-600" />
          <AlertTitle className="font-semibold text-amber-900">
            Configure seu banco de dados no Supabase para ver os indicadores
          </AlertTitle>
          <AlertDescription className="text-amber-800 text-sm mt-1">
            Algumas tabelas do sistema ainda não foram criadas ou inicializadas no projeto Supabase
            conectado. Execute o script de migração SQL no seu painel Supabase para habilitar todos
            os recursos e relatórios em tempo real.
            <div className="mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshAll}
                className="gap-2 border-amber-300 bg-white hover:bg-amber-100 text-amber-900"
              >
                <RefreshCw className="h-4 w-4" /> Recarregar Indicadores
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {hasNetworkError && !hasTableMissing && (
        <Alert variant="destructive">
          <WifiOff className="h-5 w-5" />
          <AlertTitle className="font-semibold">Erro de conexão com o Supabase</AlertTitle>
          <AlertDescription className="text-sm mt-1">
            Não foi possível carregar os dados atualizados. Verifique sua conexão com a internet ou
            se as credenciais do Supabase estão ativas.
            <div className="mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshAll}
                className="gap-2 bg-white text-destructive hover:bg-red-50"
              >
                <RefreshCw className="h-4 w-4" /> Tentar Novamente
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Visão consolidada de obras, finanças e insumos.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefreshAll}
          className="gap-2 self-start sm:self-auto"
        >
          <RefreshCw className="h-4 w-4" /> Atualizar
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
        <Card className="hover:shadow-md transition-shadow bg-blue-50/50 border-blue-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-blue-700">Materiais Alocados</CardTitle>
            <Package className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-700">{allocatedMaterialsCount}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Receita Total
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {formatCurrency(totalRevenue)}
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Despesa Total
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatCurrency(totalSpent)}</div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Saldo Global
            </CardTitle>
            <Wallet className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{formatCurrency(balance)}</div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              ROI Global Consolidado
            </CardTitle>
            <TrendingUp
              className={`h-4 w-4 ${globalRoi !== null && globalRoi >= 0 ? 'text-emerald-500' : 'text-red-500'}`}
            />
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${globalRoi !== null && globalRoi >= 0 ? 'text-emerald-600' : 'text-red-600'}`}
            >
              {globalRoi !== null ? `${globalRoi > 0 ? '+' : ''}${globalRoi.toFixed(1)}%` : '—'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Retorno sobre o total investido</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Progresso do Orçamento (Previsto vs Realizado)
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
