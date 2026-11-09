import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/hooks/use-auth'
import { Progress } from '@/components/ui/progress'
import { formatCurrency, formatDate } from '@/lib/formatters'
import { Obra, Despesa, Receita, Diario } from '@/types'
import { Calendar, User, MapPin, NotebookPen } from 'lucide-react'
import { useDataFilter } from '@/hooks/use-data'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Database, RefreshCw } from 'lucide-react'
import { calculateWorkFinancialMetrics } from '@/lib/financial-calculator'
import { WorkFinancialReturnSection } from '@/components/financial/WorkFinancialReturnSection'
import RewardProgressCard from './RewardProgressCard'

function FullOverview({
  obra,
  onAddNote,
  onNavigateToRevenues,
}: {
  obra: Obra
  onAddNote: () => void
  onNavigateToRevenues?: () => void
}) {
  const {
    data: despesas,
    loading: loadingDespesas,
    isTableMissing: missingDespesas,
    refetch: refetchDespesas,
  } = useDataFilter<Despesa>('expenses', 'work_id', obra.id)

  const {
    data: receitas,
    loading: loadingReceitas,
    isTableMissing: missingReceitas,
    refetch: refetchReceitas,
  } = useDataFilter<Receita>('revenues', 'work_id', obra.id)

  const {
    data: notes,
    loading: loadingNotes,
    isTableMissing: missingNotes,
    refetch: refetchNotes,
  } = useDataFilter<Diario>('work_diaries', 'work_id', obra.id)

  if (loadingDespesas || loadingNotes || loadingReceitas)
    return <Skeleton className="h-64 w-full" />

  const latestNotes = notes
    ? [...notes].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 3)
    : []

  const totalSpent = despesas.reduce((acc, d) => acc + Number(d.value), 0)
  const budgetPercent = Math.min((totalSpent / (Number(obra.budget_planned) || 1)) * 100, 100)

  const metrics = calculateWorkFinancialMetrics({
    obra,
    expenses: despesas,
    revenues: receitas,
  })

  const hasSubMissing = missingDespesas || missingNotes || missingReceitas

  return (
    <div className="space-y-6">
      {hasSubMissing && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900">
          <Database className="h-5 w-5 text-amber-600" />
          <AlertTitle className="font-semibold text-amber-900">
            Tabelas adicionais não configuradas
          </AlertTitle>
          <AlertDescription className="text-amber-800 text-sm mt-1">
            Algumas tabelas de apoio (
            <code className="font-mono">expenses, revenues, work_diaries</code>) ainda não foram
            criadas no Supabase. Execute o script SQL para integrar despesas, receitas e diários.
            <div className="mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  refetchDespesas()
                  refetchReceitas()
                  refetchNotes()
                }}
                className="gap-2 border-amber-300 bg-white hover:bg-amber-100 text-amber-900"
              >
                <RefreshCw className="h-4 w-4" /> Recarregar
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Seção Principal de Indicadores de Retorno Financeiro por Obra */}
      <WorkFinancialReturnSection
        obra={obra}
        metrics={metrics}
        onNavigateToRevenues={onNavigateToRevenues}
      />

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <ProjectDetailsCard obra={obra} />

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

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle>Últimas Notas</CardTitle>
              <Button variant="outline" size="sm" onClick={onAddNote}>
                Ver todas
              </Button>
            </CardHeader>
            <CardContent>
              {latestNotes.length === 0 ? (
                <div className="text-center py-8 mt-2 text-muted-foreground border rounded-lg bg-muted/20">
                  <NotebookPen className="h-10 w-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">Nenhuma nota registrada.</p>
                  <Button variant="link" onClick={onAddNote} className="mt-2">
                    Adicionar primeira nota
                  </Button>
                </div>
              ) : (
                <div className="space-y-4 mt-2">
                  {latestNotes.map((note) => (
                    <div key={note.id} className="space-y-2 border-b pb-4 last:border-0 last:pb-0">
                      <p className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> {formatDate(note.date)}
                      </p>
                      {note.notes && <p className="text-sm text-foreground/90">{note.notes}</p>}
                      {note.photos && note.photos.length > 0 && (
                        <div className="flex gap-2 overflow-x-auto pb-1 mt-2">
                          {note.photos.map((photo, i) => (
                            <img
                              key={i}
                              src={photo}
                              alt="Foto da nota"
                              className="h-20 w-20 object-cover rounded-md border"
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <PhysicalProgressCard obra={obra} />
          <RewardProgressCard obra={obra} />
        </div>
      </div>
    </div>
  )
}

function ProjectDetailsCard({ obra }: { obra: Obra }) {
  return (
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
                  <p className="text-sm font-medium text-muted-foreground">
                    Engenheiro Responsável
                  </p>
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
  )
}

function PhysicalProgressCard({ obra }: { obra: Obra }) {
  return (
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
  )
}

/**
 * Prestador: só Detalhes do Projeto e Progresso Físico (sem ROI, ponto de equilíbrio, payback,
 * resumo financeiro e notas). Equipe interna: visão completa.
 */
export default function OverviewTab(props: {
  obra: Obra
  onAddNote: () => void
  onNavigateToRevenues?: () => void
}) {
  const { role } = useAuth()
  if (role === 'prestador') {
    return (
      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <ProjectDetailsCard obra={props.obra} />
        </div>
        <div className="space-y-6">
          <PhysicalProgressCard obra={props.obra} />
          <RewardProgressCard obra={props.obra} />
        </div>
      </div>
    )
  }
  return <FullOverview {...props} />
}
