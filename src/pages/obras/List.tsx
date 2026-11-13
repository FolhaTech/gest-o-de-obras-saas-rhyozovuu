import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Calendar,
  MapPin,
  Plus,
  Database,
  RefreshCw,
  WifiOff,
  Building2,
  AlertTriangle,
  Sparkles,
  Loader2,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getStatusColor, formatDate, formatCurrency, translateStatus } from '@/lib/formatters'
import { useData, isMissingTableError, isNetworkOrFetchError } from '@/hooks/use-data'
import { Obra, Despesa, Receita } from '@/types'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/hooks/use-auth'
import { WorkRoiBadge } from '@/components/financial/WorkRoiBadge'
import { calculateWorkFinancialMetrics } from '@/lib/financial-calculator'
import { createSampleWork } from '@/lib/sample-work'

export default function ObrasList() {
  const {
    data: obras,
    loading: loadingObras,
    error,
    isTableMissing,
    isNetworkError,
    refetch: refetchObras,
  } = useData<Obra>('works')

  const {
    data: allExpenses,
    loading: loadingExpenses,
    refetch: refetchExpenses,
  } = useData<Despesa>('expenses')

  const {
    data: allRevenues,
    loading: loadingRevenues,
    refetch: refetchRevenues,
  } = useData<Receita>('revenues')

  const loading = loadingObras

  const refetch = async () => {
    await Promise.allSettled([refetchObras(), refetchExpenses(), refetchRevenues()])
  }

  const { user, canSeeValues, readOnly } = useAuth()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [creatingSample, setCreatingSample] = useState(false)
  const { toast } = useToast()
  const [formData, setFormData] = useState({
    name: '',
    client: '',
    address: '',
    manager: '',
    budget: '',
    contractedValue: '',
    startDate: '',
    endDate: '',
    totalArea: '',
  })

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const { error: insertError } = await supabase.from('works').insert({
        name: formData.name,
        client: formData.client || null,
        address: formData.address || null,
        manager: formData.manager || null,
        budget_planned: Number(formData.budget) || 0,
        contracted_value: Number(formData.contractedValue) || 0,
        start_date: formData.startDate || null,
        end_date_planned: formData.endDate || null,
        total_area: Number(formData.totalArea) || 0,
        status: 'planned',
      })

      if (!insertError) {
        toast({ title: 'Obra criada com sucesso!' })
        setFormData({
          name: '',
          client: '',
          address: '',
          manager: '',
          budget: '',
          contractedValue: '',
          startDate: '',
          endDate: '',
          totalArea: '',
        })
        setOpen(false)
        refetch()
      } else {
        if (isMissingTableError(insertError)) {
          toast({
            title: 'Tabela ausente no Supabase',
            description:
              'A tabela "works" ainda não existe no seu banco de dados. Execute o script SQL no Supabase.',
            variant: 'destructive',
          })
        } else {
          toast({
            title: 'Erro ao criar obra',
            description: insertError.message,
            variant: 'destructive',
          })
        }
      }
    } catch (err: any) {
      toast({
        title: 'Erro inesperado',
        description: err?.message || 'Falha ao comunicar com o servidor',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleCreateSampleWork = async () => {
    setCreatingSample(true)
    try {
      const result = await createSampleWork(user?.id)
      if (result.success) {
        toast({
          title: 'Obra de exemplo criada com sucesso!',
          description: `"${result.workName}" foi criada com despesas, receitas e etapas para simulação financeira.`,
        })
        await refetch()
      } else {
        toast({
          title: 'Erro ao criar obra de exemplo',
          description: result.error || 'Ocorreu um problema ao cadastrar os dados.',
          variant: 'destructive',
        })
      }
    } catch (err: any) {
      toast({
        title: 'Erro inesperado',
        description: err?.message || 'Falha ao processar solicitação de teste.',
        variant: 'destructive',
      })
    } finally {
      setCreatingSample(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Alerta de tabela ausente */}
      {isTableMissing && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900 shadow-sm">
          <Database className="h-5 w-5 text-amber-600" />
          <AlertTitle className="font-semibold text-amber-900">
            Configure seu banco de dados no Supabase para cadastrar obras
          </AlertTitle>
          <AlertDescription className="text-amber-800 text-sm mt-1">
            <p>
              A tabela{' '}
              <code className="font-mono font-semibold bg-amber-100 px-1 py-0.5 rounded">
                public.works
              </code>{' '}
              ainda não foi criada no seu projeto Supabase conectado.
            </p>
            <p className="mt-2">
              Para cadastrar e gerenciar obras em tempo real, execute o script SQL de migração no
              painel do Supabase (SQL Editor).
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="gap-2 border-amber-300 bg-white hover:bg-amber-100 text-amber-900"
              >
                <RefreshCw className="h-4 w-4" /> Recarregar Obras
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Alerta de erro de rede */}
      {isNetworkError && !isTableMissing && (
        <Alert variant="destructive">
          <WifiOff className="h-5 w-5" />
          <AlertTitle className="font-semibold">Erro de conexão com o Supabase</AlertTitle>
          <AlertDescription className="text-sm mt-1">
            Não foi possível carregar a lista de obras. Verifique sua conexão com a internet ou se o
            serviço do Supabase está disponível.
            <div className="mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="gap-2 bg-white text-destructive hover:bg-red-50"
              >
                <RefreshCw className="h-4 w-4" /> Tentar Novamente
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Outros erros genéricos */}
      {error && !isTableMissing && !isNetworkError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle className="font-semibold">Erro ao carregar dados</AlertTitle>
          <AlertDescription className="text-sm mt-1">
            {error.message || 'Ocorreu um erro ao buscar as obras.'}
            <div className="mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
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
          <h1 className="text-3xl font-bold tracking-tight">Obras</h1>
          <p className="text-muted-foreground">Gerencie todos os seus projetos de construção.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="gap-2"
            title="Atualizar lista"
          >
            <RefreshCw className="h-4 w-4" /> Atualizar
          </Button>
          {/* Financeiro só consulta: sem criar obra */}
          {!readOnly && (
            <>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCreateSampleWork}
            disabled={creatingSample || isTableMissing}
            className="gap-2 border border-primary/20 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary font-medium"
            title="Insere uma obra de demonstração completa com etapas, despesas e receitas para testar o sistema"
          >
            {creatingSample ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Criando Exemplo...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Criar Obra de Exemplo
              </>
            )}
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" /> Nova Obra
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Criar Nova Obra</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Nome da Obra *</Label>
                  <Input
                    required
                    placeholder="Ex: Residencial Parque das Flores"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Cliente / Proprietário</Label>
                    <Input
                      placeholder="Ex: Construtora Horizon"
                      value={formData.client}
                      onChange={(e) => setFormData({ ...formData, client: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Gerente / Responsável</Label>
                    <Input
                      placeholder="Ex: Eng. Carlos Silva"
                      value={formData.manager}
                      onChange={(e) => setFormData({ ...formData, manager: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Endereço / Localização</Label>
                  <Input
                    placeholder="Ex: Av. Paulista, 1000 - São Paulo/SP"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Data de Início</Label>
                    <Input
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Previsão de Término</Label>
                    <Input
                      type="date"
                      value={formData.endDate}
                      onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label>Área Total (m²)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={formData.totalArea}
                      onChange={(e) => setFormData({ ...formData, totalArea: e.target.value })}
                    />
                  </div>
                  {canSeeValues && (
                  <div className="space-y-2">
                    <Label>Orçamento Planejado (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={formData.budget}
                      onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                    />
                  </div>
                  )}
                  {canSeeValues && (
                  <div className="space-y-2">
                    <Label>Valor Contratado (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={formData.contractedValue}
                      onChange={(e) =>
                        setFormData({ ...formData, contractedValue: e.target.value })
                      }
                    />
                  </div>
                  )}
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? 'Criando...' : 'Criar Obra'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : isTableMissing ? (
        <Card className="border-dashed border-amber-300 bg-amber-50/40">
          <CardHeader className="text-center py-10">
            <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-3">
              <Database className="h-6 w-6 text-amber-600" />
            </div>
            <CardTitle className="text-xl text-amber-900">
              Banco de dados aguardando inicialização
            </CardTitle>
            <CardDescription className="max-w-md mx-auto text-amber-800 text-sm mt-2">
              A tabela de obras (<code className="font-mono font-semibold">public.works</code>)
              ainda não foi encontrada no Supabase. Assim que o script SQL for executado, suas obras
              cadastradas aparecerão aqui automaticamente.
            </CardDescription>
            <div className="pt-4 flex justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="gap-2 border-amber-300 bg-white hover:bg-amber-100 text-amber-900"
              >
                <RefreshCw className="h-4 w-4" /> Recarregar
              </Button>
            </div>
          </CardHeader>
        </Card>
      ) : obras.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader className="text-center py-12">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <Building2 className="h-6 w-6 text-muted-foreground" />
            </div>
            <CardTitle className="text-lg">Nenhuma obra cadastrada</CardTitle>
            <CardDescription className="max-w-sm mx-auto mt-1">
              {readOnly
                ? 'Ainda não há obras cadastradas.'
                : 'Comece criando seu primeiro projeto de construção ou gere uma obra de demonstração completa para testar o sistema.'}
            </CardDescription>
            {!readOnly && (
            <div className="pt-4 flex flex-wrap items-center justify-center gap-3">
              <Button onClick={() => setOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" /> Cadastrar Primeira Obra
              </Button>
              <Button
                variant="outline"
                onClick={handleCreateSampleWork}
                disabled={creatingSample}
                className="gap-2 border-primary/30 text-primary hover:bg-primary/10"
              >
                {creatingSample ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {creatingSample ? 'Criando...' : 'Criar Obra de Exemplo'}
              </Button>
            </div>
            )}
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {obras.map((obra) => {
            const obraExpenses = allExpenses?.filter((e) => e.work_id === obra.id) || []
            const obraRevenues = allRevenues?.filter((r) => r.work_id === obra.id) || []
            const metrics = calculateWorkFinancialMetrics({
              obra,
              expenses: obraExpenses,
              revenues: obraRevenues,
            })

            return (
              <Link key={obra.id} to={`/obras/${obra.id}`}>
                <Card className="hover:shadow-md transition-all cursor-pointer h-full flex flex-col group">
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <Badge variant="outline" className={getStatusColor(obra.status)}>
                        {translateStatus(obra.status)}
                      </Badge>
                      {canSeeValues && (
                        <WorkRoiBadge
                          roiPercentage={metrics.roiPercentage}
                          status={metrics.roiStatus}
                        />
                      )}
                    </div>
                    <CardTitle className="text-xl group-hover:text-primary transition-colors">
                      {obra.name}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {obra.client || 'Sem cliente informado'}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3 flex-1">
                    <div className="flex items-center text-sm text-muted-foreground gap-2">
                      <MapPin className="h-4 w-4 shrink-0" />
                      <span className="truncate">{obra.address || 'Sem endereço'}</span>
                    </div>
                    <div className="flex items-center text-sm text-muted-foreground gap-2">
                      <Calendar className="h-4 w-4 shrink-0" />
                      <span>{formatDate(obra.end_date_planned)} (Previsão)</span>
                    </div>
                    <div className="pt-2">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium">Progresso</span>
                        <span>{obra.progress_percentage || 0}%</span>
                      </div>
                      <Progress value={Number(obra.progress_percentage) || 0} className="h-2" />
                    </div>
                  </CardContent>
                  {canSeeValues && (
                  <CardFooter className="bg-muted/30 border-t py-3 flex-col gap-1.5 items-stretch">
                    <div className="w-full flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Orçamento</span>
                      <span className="font-semibold">{formatCurrency(obra.budget_planned)}</span>
                    </div>
                    {metrics.breakEvenValue > 0 && (
                      <div className="w-full flex justify-between items-center text-xs text-muted-foreground">
                        <span>Ponto de Equilíbrio</span>
                        <span
                          className={
                            metrics.hasReachedBreakEven ? 'text-emerald-600 font-medium' : ''
                          }
                        >
                          {metrics.breakEvenPercentage !== null
                            ? `${metrics.breakEvenPercentage.toFixed(0)}% cobrindo`
                            : '—'}
                        </span>
                      </div>
                    )}
                  </CardFooter>
                  )}
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
