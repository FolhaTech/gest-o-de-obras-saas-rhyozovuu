import { useMemo } from 'react'
import {
  differenceInDays,
  parseISO,
  min,
  max,
  addDays,
  format,
  isAfter,
  startOfMonth,
  endOfMonth,
  startOfDay,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Stage } from '@/types'
import { useDataFilter } from '@/hooks/use-data'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { CalendarDays, AlertCircle, CheckCircle2, Database, RefreshCw, WifiOff } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export default function ScheduleTab({ obraId }: { obraId: string }) {
  const {
    data: stages,
    loading,
    isTableMissing,
    isNetworkError,
    refetch,
  } = useDataFilter<Stage>('work_stages', 'work_id', obraId)

  const validStages = useMemo(() => {
    return (stages || [])
      .filter((s) => s.start_date && s.end_date_planned)
      .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
  }, [stages])

  const { startDate, endDate, totalDays, months } = useMemo(() => {
    if (validStages.length === 0)
      return { startDate: new Date(), endDate: new Date(), totalDays: 0, months: [] }

    const startDates = validStages.map((s) => startOfDay(parseISO(s.start_date)))
    const endDates = validStages.map((s) => {
      const planned = startOfDay(parseISO(s.end_date_planned))
      const real = s.end_date_real ? startOfDay(parseISO(s.end_date_real)) : startOfDay(new Date())
      return isAfter(real, planned) ? real : planned
    })

    let minDate = min(startDates)
    let maxDate = max(endDates)

    // Add padding to ends for better visualization
    minDate = addDays(minDate, -7)
    maxDate = addDays(maxDate, 14)

    const totalDays = differenceInDays(maxDate, minDate) + 1

    const months = []
    let currentMonth = startOfMonth(minDate)
    const endMonth = startOfMonth(maxDate)

    while (!isAfter(currentMonth, endMonth)) {
      months.push(currentMonth)
      currentMonth = addDays(endOfMonth(currentMonth), 1)
    }

    return { startDate: minDate, endDate: maxDate, totalDays, months }
  }, [validStages])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (isTableMissing) {
    return (
      <Alert className="border-amber-200 bg-amber-50 text-amber-900">
        <Database className="h-5 w-5 text-amber-600" />
        <AlertTitle className="font-semibold text-amber-900">
          Tabela de cronograma/etapas não configurada
        </AlertTitle>
        <AlertDescription className="text-amber-800 text-sm mt-1">
          A tabela <code className="font-mono">work_stages</code> ainda não foi criada no Supabase.
          Execute o script SQL para visualizar o gráfico Gantt.
          <div className="mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="gap-2 border-amber-300 bg-white hover:bg-amber-100 text-amber-900"
            >
              <RefreshCw className="h-4 w-4" /> Recarregar
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    )
  }

  if (isNetworkError) {
    return (
      <Alert variant="destructive">
        <WifiOff className="h-5 w-5" />
        <AlertTitle className="font-semibold">Erro de conexão</AlertTitle>
        <AlertDescription className="text-sm mt-1">
          Não foi possível carregar as etapas do cronograma.
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
    )
  }

  if (validStages.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Cronograma (Gantt)
          </CardTitle>
          <CardDescription>Visualize o progresso planejado x realizado.</CardDescription>
        </CardHeader>
        <CardContent className="py-8 text-center text-muted-foreground">
          Nenhuma etapa com data de início e previsão de término cadastrada para exibir o gráfico.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="animate-fade-in-up shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" />
          Cronograma do Projeto
        </CardTitle>
        <CardDescription>
          Acompanhe o planejamento vs. execução de cada etapa da obra
        </CardDescription>
        <div className="flex gap-4 mt-4 text-xs font-medium text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-blue-200 dark:bg-blue-900" />
            <span>Planejado</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-green-500" />
            <span>Realizado (No prazo)</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-red-500" />
            <span>Realizado (Atrasado)</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="border-t flex">
          {/* Sidebar */}
          <div className="w-48 md:w-64 flex-shrink-0 border-r bg-muted/10 z-20">
            <div className="h-12 border-b flex items-center px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground bg-background">
              Etapa
            </div>
            {validStages.map((stage) => (
              <div
                key={`sidebar-${stage.id}`}
                className="h-20 flex flex-col justify-center px-4 text-sm border-b hover:bg-muted/30 transition-colors"
              >
                <div className="font-medium truncate" title={stage.name}>
                  {stage.name}
                </div>
                <div className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-1">
                  <span>Progresso: {stage.progress_percentage || 0}%</span>
                </div>
              </div>
            ))}
          </div>

          {/* Timeline Scrollable Area */}
          <div className="flex-1 overflow-x-auto relative">
            <div className="min-w-[800px] relative pb-4">
              {/* Header: Months Grid */}
              <div className="h-12 border-b flex relative bg-background z-10">
                {months.map((month, i) => {
                  const sDate = isAfter(month, startDate) ? month : startDate
                  const eDate = isAfter(endOfMonth(month), endDate) ? endDate : endOfMonth(month)
                  const daysInMonth = differenceInDays(eDate, sDate) + 1

                  const left = (differenceInDays(sDate, startDate) / totalDays) * 100
                  const width = (daysInMonth / totalDays) * 100

                  return (
                    <div
                      key={`month-${i}`}
                      className="absolute h-full border-r px-2 py-2 text-xs font-medium text-muted-foreground flex items-center justify-center border-l bg-background"
                      style={{ left: `${left}%`, width: `${width}%` }}
                    >
                      {format(month, 'MMM yyyy', { locale: ptBR }).toUpperCase()}
                    </div>
                  )
                })}
              </div>

              {/* Rows */}
              {validStages.map((stage) => {
                const start = startOfDay(parseISO(stage.start_date))
                const plannedEnd = startOfDay(parseISO(stage.end_date_planned))
                const isCompleted = !!stage.end_date_real
                const realEnd = isCompleted
                  ? startOfDay(parseISO(stage.end_date_real))
                  : startOfDay(new Date())

                const plannedOffsetDays = differenceInDays(start, startDate)
                const plannedDurationDays = Math.max(1, differenceInDays(plannedEnd, start) + 1)

                const realOffsetDays = differenceInDays(start, startDate)
                const realDurationDays = Math.max(1, differenceInDays(realEnd, start) + 1)

                const isDelayed = isAfter(realEnd, plannedEnd)
                const totalDelay = differenceInDays(realEnd, plannedEnd)

                return (
                  <div
                    key={`timeline-${stage.id}`}
                    className="h-20 border-b relative group hover:bg-muted/5 transition-colors"
                  >
                    {/* Month Vertical Grid Lines */}
                    {months.map((month, i) => {
                      const sDate = isAfter(month, startDate) ? month : startDate
                      const left = (differenceInDays(sDate, startDate) / totalDays) * 100
                      return (
                        <div
                          key={`grid-${i}`}
                          className="absolute top-0 bottom-0 border-l border-muted-foreground/10 pointer-events-none"
                          style={{ left: `${left}%` }}
                        />
                      )
                    })}

                    <TooltipProvider>
                      <Tooltip delayDuration={100}>
                        <TooltipTrigger asChild>
                          <div className="absolute inset-0 z-10 cursor-crosshair" />
                        </TooltipTrigger>
                        <TooltipContent
                          side="bottom"
                          align="start"
                          className="flex flex-col gap-2 p-3 sm:max-w-[300px]"
                        >
                          <div className="font-bold text-sm border-b pb-1 mb-1">{stage.name}</div>

                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                            <span className="text-muted-foreground">Início Planejado:</span>
                            <span className="font-medium text-right">
                              {format(start, 'dd/MM/yyyy')}
                            </span>

                            <span className="text-muted-foreground">Fim Planejado:</span>
                            <span className="font-medium text-right">
                              {format(plannedEnd, 'dd/MM/yyyy')}
                            </span>

                            <span className="text-muted-foreground">Fim Realizado:</span>
                            <span className="font-medium text-right">
                              {isCompleted ? format(realEnd, 'dd/MM/yyyy') : 'Em andamento'}
                            </span>
                          </div>

                          <div className="mt-1 pt-1 border-t flex items-center justify-between">
                            <span className="text-xs font-semibold">Progresso</span>
                            <Badge
                              variant={stage.progress_percentage === 100 ? 'default' : 'secondary'}
                            >
                              {stage.progress_percentage || 0}%
                            </Badge>
                          </div>

                          <div className="mt-1">
                            {isDelayed ? (
                              <div className="flex items-center gap-1 text-xs text-red-500 font-bold bg-red-500/10 p-1.5 rounded-sm">
                                <AlertCircle className="w-3 h-3" /> Atraso de {totalDelay} dia(s)
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-bold bg-green-500/10 p-1.5 rounded-sm">
                                <CheckCircle2 className="w-3 h-3" /> No prazo
                              </div>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    {/* Bars Container */}
                    <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-10 pointer-events-none">
                      {/* Planned Bar */}
                      <div
                        className="absolute top-1 h-3 bg-blue-200 dark:bg-blue-900 rounded-sm overflow-hidden"
                        style={{
                          left: `${(plannedOffsetDays / totalDays) * 100}%`,
                          width: `${(plannedDurationDays / totalDays) * 100}%`,
                        }}
                      />

                      {/* Realized Bar */}
                      <div
                        className={cn(
                          'absolute bottom-1 h-4 rounded-sm overflow-hidden border',
                          isDelayed
                            ? 'bg-red-100 border-red-300 dark:bg-red-950 dark:border-red-900'
                            : 'bg-green-100 border-green-300 dark:bg-green-950 dark:border-green-900',
                        )}
                        style={{
                          left: `${(realOffsetDays / totalDays) * 100}%`,
                          width: `${(realDurationDays / totalDays) * 100}%`,
                        }}
                      >
                        {/* Progress Fill inside Realized Bar */}
                        <div
                          className={cn(
                            'h-full transition-all duration-500 relative',
                            isDelayed ? 'bg-red-500' : 'bg-green-500',
                          )}
                          style={{ width: `${stage.progress_percentage || 0}%` }}
                        >
                          <div className="absolute inset-0 bg-white/20 dark:bg-black/10 mix-blend-overlay"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
