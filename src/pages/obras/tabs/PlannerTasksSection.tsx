import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Calendar,
  CalendarDays,
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  Film,
  Image as ImageIcon,
  Link2,
  Play,
  RefreshCw,
  User,
} from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/hooks/use-auth'
import { formatDate, formatSupabaseError } from '@/lib/formatters'
import { PlannerAttachment, PlannerTask, PlannerTaskPriority, PlannerTaskStatus } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import { progressFromStatus, taskProgress } from '@/lib/planner-progress'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const STATUS_LABEL: Record<PlannerTaskStatus, string> = {
  pending: 'Pendente',
  in_progress: 'Em Andamento',
  delayed: 'Em Atraso',
  completed: 'Concluída',
}

const PRIORITY_CONFIG: Record<PlannerTaskPriority, { label: string; className: string }> = {
  low: {
    label: 'Baixa',
    className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200',
  },
  medium: {
    label: 'Média',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200',
  },
  high: {
    label: 'Alta',
    className: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 border-rose-200',
  },
}

function StatusIcon({ status }: { status: PlannerTaskStatus }) {
  if (status === 'completed') return <CheckCircle2 className="h-5 w-5 text-emerald-500" />
  if (status === 'delayed') return <AlertTriangle className="h-5 w-5 text-rose-500" />
  if (status === 'in_progress') return <Play className="h-5 w-5 text-blue-500" />
  return <CircleDashed className="h-5 w-5 text-muted-foreground" />
}

/**
 * Lista todas as tarefas do Planner vinculadas à obra selecionada
 * (planner_tasks.work_id = obraId) dentro da aba "Etapas do Projeto".
 */
export default function PlannerTasksSection({ obraId }: { obraId: string }) {
  const { toast } = useToast()
  // Financeiro não lê o Planner (RLS): a seção inteira some para ele.
  const { readOnly } = useAuth()
  const [tasks, setTasks] = useState<PlannerTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Tarefas "gerais" do Planner (sem obra) também podem ser exibidas e vinculadas a esta obra.
  const [showGeneral, setShowGeneral] = useState(false)

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    try {
      // Tarefas espelho de etapas do Cronograma (stage_id) já aparecem na lista de etapas acima.
      let query = supabase
        .from('planner_tasks' as any)
        .select('*, team_members:assignee_id(id, name, role, phone)')
        .is('stage_id', null)
      query = showGeneral
        ? query.or(`work_id.eq.${obraId},work_id.is.null`)
        : query.eq('work_id', obraId)
      const { data, error: tasksError } = await query.order('created_at', { ascending: false })

      if (tasksError) throw tasksError

      const rows = (data ?? []) as any[]
      const byTask: Record<string, PlannerAttachment[]> = {}
      if (rows.length > 0) {
        const { data: atts } = await supabase
          .from('planner_task_attachments' as any)
          .select('*')
          .in(
            'task_id',
            rows.map((t) => t.id),
          )
        ;((atts ?? []) as any[]).forEach((a) => {
          ;(byTask[a.task_id] ||= []).push(a)
        })
      }

      setTasks(rows.map((t) => ({ ...t, attachments: byTask[t.id] ?? [] })) as PlannerTask[])
      setError(null)
    } catch (err: any) {
      console.warn('[PlannerTasksSection] erro ao carregar tarefas:', err)
      setError(formatSupabaseError(err))
      setTasks([])
    } finally {
      setLoading(false)
    }
  }, [obraId, showGeneral])

  useEffect(() => {
    if (!readOnly) fetchTasks()
  }, [fetchTasks, readOnly])

  const handleLinkToWork = async (taskId: string) => {
    const { error: linkError } = await supabase
      .from('planner_tasks' as any)
      .update({ work_id: obraId })
      .eq('id', taskId)

    if (linkError) {
      toast({
        title: 'Erro ao vincular tarefa',
        description: formatSupabaseError(linkError),
        variant: 'destructive',
      })
      return
    }
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, work_id: obraId } : t)))
    toast({ title: 'Tarefa vinculada a esta obra' })
  }

  const handleStatusChange = async (taskId: string, status: PlannerTaskStatus) => {
    const current = tasks.find((t) => t.id === taskId)
    const progress = progressFromStatus(status, current ? taskProgress(current) : 0)
    const { error: updateError } = await supabase
      .from('planner_tasks' as any)
      .update({ status, progress_percentage: progress })
      .eq('id', taskId)

    if (updateError) {
      toast({
        title: 'Erro ao alterar status',
        description: formatSupabaseError(updateError),
        variant: 'destructive',
      })
      return
    }
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status, progress_percentage: progress } : t)),
    )
  }

  const summary = useMemo(() => {
    // O avanço considera só as tarefas já vinculadas a esta obra.
    const linked = tasks.filter((t) => t.work_id === obraId)
    const total = linked.length
    const done = linked.filter((t) => t.status === 'completed').length
    const progress = total
      ? Math.round(linked.reduce((acc, t) => acc + taskProgress(t), 0) / total)
      : 0
    return { total, done, progress }
  }, [tasks, obraId])

  if (readOnly) return null

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" /> Tarefas do Planner
          </h3>
          {!loading && !error && (
            <p className="text-xs text-muted-foreground">
              {summary.total === 0
                ? 'Nenhuma tarefa do Planner vinculada a esta obra.'
                : `${summary.done} de ${summary.total} concluídas • ${summary.progress}% de avanço`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 pr-1">
            <Switch id="planner-show-general" checked={showGeneral} onCheckedChange={setShowGeneral} />
            <Label htmlFor="planner-show-general" className="text-xs cursor-pointer">
              Incluir tarefas gerais (sem obra)
            </Label>
          </div>
          <Button variant="outline" size="sm" onClick={fetchTasks} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Atualizar
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link to="/planner">
              <ExternalLink className="h-4 w-4" /> Abrir Planner
            </Link>
          </Button>
        </div>
      </div>

      {!loading && !error && summary.total > 0 && (
        <Progress value={summary.progress} className="h-2" />
      )}

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive p-4">
          Não foi possível carregar as tarefas do Planner: {error}
        </p>
      ) : tasks.length === 0 ? (
        <p className="text-muted-foreground p-4">
          Nenhuma tarefa do Planner vinculada a esta obra. Crie tarefas no Planner e selecione esta
          obra no campo &quot;Vincular a uma Obra&quot;.
        </p>
      ) : (
        tasks.map((task) => {
          const images = task.attachments?.filter((a) => a.file_type === 'image').length ?? 0
          const videos = task.attachments?.filter((a) => a.file_type === 'video').length ?? 0
          const priority = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.medium
          return (
            <Card key={task.id} className="overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 md:p-6">
                <div className="flex items-start gap-3 w-full sm:w-1/3 min-w-0">
                  <StatusIcon status={task.status} />
                  <div className="min-w-0">
                    <h4
                      className={`font-medium text-base ${
                        task.status === 'completed' ? 'line-through text-muted-foreground' : ''
                      }`}
                    >
                      {task.title}
                    </h4>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <User className="h-3 w-3" />
                      Resp: {task.team_members?.name || '-'}
                    </p>
                  </div>
                </div>

                <div className="flex-1 w-full space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="font-normal">
                        {STATUS_LABEL[task.status]}
                      </Badge>
                      <Badge variant="outline" className={`font-normal ${priority.className}`}>
                        {priority.label}
                      </Badge>
                      {!task.work_id && (
                        <>
                          <Badge variant="outline" className="font-normal">
                            Geral (sem obra)
                          </Badge>
                          <Button
                            type="button"
                            variant="link"
                            size="sm"
                            className="h-auto p-0 text-xs gap-1"
                            onClick={() => handleLinkToWork(task.id)}
                          >
                            <Link2 className="h-3 w-3" /> Vincular a esta obra
                          </Button>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {task.due_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" /> Prazo: {formatDate(task.due_date)}
                        </span>
                      )}
                      {images > 0 && (
                        <span className="flex items-center gap-0.5">
                          <ImageIcon className="h-3 w-3 text-emerald-600" /> {images}
                        </span>
                      )}
                      {videos > 0 && (
                        <span className="flex items-center gap-0.5">
                          <Film className="h-3 w-3 text-blue-600" /> {videos}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Progress value={taskProgress(task)} className="h-2 flex-1" />
                    <span className="text-sm font-medium w-10 text-right">{taskProgress(task)}%</span>
                  </div>
                  {task.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>
                  )}
                </div>

                <Select
                  value={task.status}
                  onValueChange={(val: PlannerTaskStatus) => handleStatusChange(task.id, val)}
                >
                  <SelectTrigger className="h-8 text-xs w-full sm:w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="in_progress">Em Andamento</SelectItem>
                    <SelectItem value="delayed">Em Atraso</SelectItem>
                    <SelectItem value="completed">Concluída</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </Card>
          )
        })
      )}
    </div>
  )
}
