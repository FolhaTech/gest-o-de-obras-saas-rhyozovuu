import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import { formatDate, formatSupabaseError, isMissingTableError } from '@/lib/formatters'
import {
  PlannerTask,
  PlannerAttachment,
  PlannerTaskStatus,
  PlannerTaskPriority,
  Obra,
  Equipe,
} from '@/types'
import {
  Calendar,
  CheckCircle2,
  Clock,
  Filter,
  Plus,
  Trash2,
  Edit2,
  Paperclip,
  Image as ImageIcon,
  Film,
  User,
  Building,
  AlertTriangle,
  LayoutGrid,
  List as ListIcon,
  Search,
  UploadCloud,
  X,
  Play,
  CalendarDays,
  Check,
  ChevronRight,
  Database,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { Slider } from '@/components/ui/slider'
import {
  clampProgress,
  progressFromStatus,
  statusFromProgress,
  taskProgress,
} from '@/lib/planner-progress'

const STATUS_COLUMNS: {
  key: PlannerTaskStatus
  label: string
  icon: any
  color: string
  bg: string
}[] = [
  {
    key: 'pending',
    label: 'Pendente',
    icon: Clock,
    color: 'text-amber-600',
    bg: 'bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-300',
  },
  {
    key: 'in_progress',
    label: 'Em Andamento',
    icon: Play,
    color: 'text-blue-600',
    bg: 'bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-300',
  },
  {
    key: 'completed',
    label: 'Concluída',
    icon: CheckCircle2,
    color: 'text-emerald-600',
    bg: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300',
  },
]

const PRIORITY_CONFIG: Record<PlannerTaskPriority, { label: string; badgeClass: string }> = {
  low: {
    label: 'Baixa',
    badgeClass:
      'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200',
  },
  medium: {
    label: 'Média',
    badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200',
  },
  high: {
    label: 'Alta',
    badgeClass: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 border-rose-200',
  },
}

export default function PlannerPage() {
  const { user } = useAuth()
  const { toast } = useToast()

  const [tasks, setTasks] = useState<PlannerTask[]>([])
  const [works, setWorks] = useState<Obra[]>([])
  const [teamMembers, setTeamMembers] = useState<Equipe[]>([])
  const [loading, setLoading] = useState(true)
  const [isTableMissing, setIsTableMissing] = useState(false)

  // Filtros
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all')
  const [workFilter, setWorkFilter] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban')

  // Modais de Criação / Edição
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<PlannerTask | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)

  // Formulário de Tarefa
  const [formTitle, setFormTitle] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formStatus, setFormStatus] = useState<PlannerTaskStatus>('pending')
  const [formPriority, setFormPriority] = useState<PlannerTaskPriority>('medium')
  const [formProgress, setFormProgress] = useState(0)
  const [formWorkId, setFormWorkId] = useState<string>('none')
  const [formAssigneeId, setFormAssigneeId] = useState<string>('none')
  const [formStartDate, setFormStartDate] = useState('')
  const [formDueDate, setFormDueDate] = useState('')
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [currentAttachments, setCurrentAttachments] = useState<PlannerAttachment[]>([])

  // Modal de Detalhes / Visualização com Mídia
  const [previewTask, setPreviewTask] = useState<PlannerTask | null>(null)
  const [mediaPreview, setMediaPreview] = useState<{
    url: string
    type: 'image' | 'video'
    name: string
  } | null>(null)

  // Carrega membros e obras auxiliares
  const loadAuxData = useCallback(async () => {
    try {
      const [worksRes, teamRes] = await Promise.all([
        supabase.from('works').select('id, name').order('name'),
        supabase
          .from('team_members')
          .select('id, name, role, phone')
          .eq('status', 'active')
          .order('name'),
      ])
      if (worksRes.data) setWorks(worksRes.data as unknown as Obra[])
      if (teamRes.data) setTeamMembers(teamRes.data as unknown as Equipe[])
    } catch (e) {
      console.warn('Erro ao carregar obras/equipes auxiliares:', e)
    }
  }, [])

  // Carrega tarefas com attachments e relações
  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true)
      const { data: tasksData, error: tasksError } = await supabase
        .from('planner_tasks' as any)
        .select(`
          *,
          works:work_id(id, name),
          team_members:assignee_id(id, name, role, phone)
        `)
        .order('created_at', { ascending: false })

      if (tasksError) {
        if (isMissingTableError(tasksError)) {
          setIsTableMissing(true)
          setTasks([])
          return
        }
        throw tasksError
      }

      setIsTableMissing(false)

      if (tasksData && tasksData.length > 0) {
        const taskIds = tasksData.map((t: any) => t.id)
        const { data: attachmentsData, error: attError } = await supabase
          .from('planner_task_attachments' as any)
          .select('*')
          .in('task_id', taskIds)

        const attachmentsByTaskId: Record<string, PlannerAttachment[]> = {}
        if (!attError && attachmentsData) {
          attachmentsData.forEach((att: any) => {
            if (!attachmentsByTaskId[att.task_id]) {
              attachmentsByTaskId[att.task_id] = []
            }
            attachmentsByTaskId[att.task_id].push(att)
          })
        }

        const fullTasks: PlannerTask[] = tasksData.map((t: any) => ({
          ...t,
          attachments: attachmentsByTaskId[t.id] || [],
        }))

        setTasks(fullTasks)
      } else {
        setTasks([])
      }
    } catch (err: any) {
      console.error('Erro ao buscar tarefas:', err)
      toast({
        title: 'Erro ao carregar tarefas',
        description: formatSupabaseError(err),
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadAuxData()
    fetchTasks()
  }, [loadAuxData, fetchTasks])

  // Resetar formulário
  const resetForm = () => {
    setFormTitle('')
    setFormDescription('')
    setFormStatus('pending')
    setFormPriority('medium')
    setFormProgress(0)
    setFormWorkId('none')
    setFormAssigneeId('none')
    setFormStartDate('')
    setFormDueDate('')
    setNewFiles([])
    setCurrentAttachments([])
    setEditingTask(null)
    setUploadProgress(null)
  }

  // Abrir modal de criação
  const handleOpenCreate = (defaultStatus: PlannerTaskStatus = 'pending') => {
    resetForm()
    setFormStatus(defaultStatus)
    setFormProgress(progressFromStatus(defaultStatus, 0))
    setDialogOpen(true)
  }

  // Abrir modal de edição
  const handleOpenEdit = (task: PlannerTask) => {
    setEditingTask(task)
    setFormTitle(task.title)
    setFormDescription(task.description || '')
    setFormStatus(task.status)
    setFormPriority(task.priority)
    setFormProgress(taskProgress(task))
    setFormWorkId(task.work_id || 'none')
    setFormAssigneeId(task.assignee_id || 'none')
    setFormStartDate(task.start_date || '')
    setFormDueDate(task.due_date || '')
    setCurrentAttachments(task.attachments || [])
    setNewFiles([])
    setDialogOpen(true)
  }

  // Upload dos arquivos no storage
  const uploadFiles = async (files: File[], taskId: string): Promise<PlannerAttachment[]> => {
    const uploaded: PlannerAttachment[] = []
    const totalFiles = files.length
    if (totalFiles === 0) return uploaded

    for (let i = 0; i < totalFiles; i++) {
      const file = files[i]
      setUploadProgress(Math.round(((i + 0.5) / totalFiles) * 100))

      const ext = file.name.split('.').pop() || 'file'
      const isVideo = file.type.startsWith('video/')
      const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
      const storagePath = `${taskId}/${Date.now()}-${cleanFileName}`

      const { error: uploadError } = await supabase.storage
        .from('planner-attachments')
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: true,
        })

      if (uploadError) {
        console.error('Erro no upload de anexo:', uploadError)
        // Se o bucket não existir, tenta criar dinamicamente ou informa amigavelmente
        toast({
          title: `Falha ao enviar ${file.name}`,
          description: uploadError.message,
          variant: 'destructive',
        })
        continue
      }

      const { data: publicUrlData } = supabase.storage
        .from('planner-attachments')
        .getPublicUrl(storagePath)

      const attachmentPayload = {
        task_id: taskId,
        file_url: publicUrlData.publicUrl,
        file_name: file.name,
        file_type: (isVideo ? 'video' : 'image') as 'image' | 'video',
      }

      const { data: savedAtt, error: attSaveErr } = await supabase
        .from('planner_task_attachments' as any)
        .insert(attachmentPayload as any)
        .select('*')
        .single()

      if (!attSaveErr && savedAtt) {
        uploaded.push(savedAtt as unknown as PlannerAttachment)
      }
    }

    setUploadProgress(100)
    return uploaded
  }

  // Deletar um anexo
  const handleDeleteAttachment = async (attachmentId: string) => {
    try {
      const { error } = await supabase
        .from('planner_task_attachments' as any)
        .delete()
        .eq('id', attachmentId)

      if (error) throw error

      setCurrentAttachments((prev) => prev.filter((a) => a.id !== attachmentId))
      setTasks((prev) =>
        prev.map((t) =>
          t.attachments
            ? { ...t, attachments: t.attachments.filter((a) => a.id !== attachmentId) }
            : t,
        ),
      )
      if (previewTask && previewTask.attachments) {
        setPreviewTask({
          ...previewTask,
          attachments: previewTask.attachments.filter((a) => a.id !== attachmentId),
        })
      }
      toast({ title: 'Anexo removido' })
    } catch (err: any) {
      toast({
        title: 'Erro ao remover anexo',
        description: err.message,
        variant: 'destructive',
      })
    }
  }

  // Salvar tarefa (criar ou editar)
  const handleSubmitTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formTitle.trim()) {
      toast({ title: 'Título é obrigatório', variant: 'destructive' })
      return
    }

    setSaving(true)
    try {
      const taskPayload = {
        title: formTitle.trim(),
        description: formDescription.trim() || null,
        status: formStatus,
        priority: formPriority,
        progress_percentage: formProgress,
        work_id: formWorkId === 'none' ? null : formWorkId,
        assignee_id: formAssigneeId === 'none' ? null : formAssigneeId,
        start_date: formStartDate || null,
        due_date: formDueDate || null,
        created_by: user?.id || null,
      }

      let targetTaskId: string

      if (editingTask) {
        targetTaskId = editingTask.id
        const { error: updateErr } = await supabase
          .from('planner_tasks' as any)
          .update(taskPayload)
          .eq('id', targetTaskId)

        if (updateErr) throw updateErr
        toast({ title: 'Tarefa atualizada com sucesso!' })
      } else {
        const { data: created, error: insertErr } = await supabase
          .from('planner_tasks' as any)
          .insert(taskPayload)
          .select('id')
          .single()

        if (insertErr) throw insertErr
        targetTaskId = (created as any).id
        toast({ title: 'Tarefa criada com sucesso!' })
      }

      // Upload de novos arquivos
      if (newFiles.length > 0) {
        await uploadFiles(newFiles, targetTaskId)
      }

      setDialogOpen(false)
      resetForm()
      await fetchTasks()
    } catch (err: any) {
      console.error('Erro ao salvar tarefa:', err)
      toast({
        title: 'Erro ao salvar',
        description: formatSupabaseError(err),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
      setUploadProgress(null)
    }
  }

  // Atualização rápida de status (ex: arrastar ou clique)
  const handleQuickStatusChange = async (taskId: string, newStatus: PlannerTaskStatus) => {
    try {
      const current = tasks.find((t) => t.id === taskId)
      const newProgress = progressFromStatus(newStatus, current ? taskProgress(current) : 0)
      const { error } = await supabase
        .from('planner_tasks' as any)
        .update({ status: newStatus, progress_percentage: newProgress })
        .eq('id', taskId)

      if (error) throw error

      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, status: newStatus, progress_percentage: newProgress } : t,
        ),
      )
      if (previewTask && previewTask.id === taskId) {
        setPreviewTask({ ...previewTask, status: newStatus, progress_percentage: newProgress })
      }
      toast({
        title: `Status alterado para ${STATUS_COLUMNS.find((c) => c.key === newStatus)?.label}`,
      })
    } catch (err: any) {
      toast({
        title: 'Erro ao alterar status',
        description: formatSupabaseError(err),
        variant: 'destructive',
      })
    }
  }

  // Deletar tarefa
  const handleDeleteTask = async (task: PlannerTask) => {
    if (!confirm(`Tem certeza que deseja excluir a tarefa "${task.title}"?`)) return
    try {
      const { error } = await supabase
        .from('planner_tasks' as any)
        .delete()
        .eq('id', task.id)

      if (error) throw error

      setTasks((prev) => prev.filter((t) => t.id !== task.id))
      if (previewTask?.id === task.id) setPreviewTask(null)
      toast({ title: 'Tarefa excluída com sucesso!' })
    } catch (err: any) {
      toast({
        title: 'Erro ao excluir tarefa',
        description: formatSupabaseError(err),
        variant: 'destructive',
      })
    }
  }

  // Filtros aplicados
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      // Busca por título ou descrição
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        const matchTitle = task.title.toLowerCase().includes(query)
        const matchDesc = task.description?.toLowerCase().includes(query) || false
        const matchAssignee = task.team_members?.name.toLowerCase().includes(query) || false
        const matchWork = task.works?.name.toLowerCase().includes(query) || false
        if (!matchTitle && !matchDesc && !matchAssignee && !matchWork) return false
      }

      // Filtro de status
      if (statusFilter !== 'all' && task.status !== statusFilter) {
        return false
      }

      // Filtro de responsável
      if (assigneeFilter !== 'all') {
        if (assigneeFilter === 'unassigned' && task.assignee_id) return false
        if (assigneeFilter !== 'unassigned' && task.assignee_id !== assigneeFilter) return false
      }

      // Filtro de obra
      if (workFilter !== 'all') {
        if (workFilter === 'none' && task.work_id) return false
        if (workFilter !== 'none' && task.work_id !== workFilter) return false
      }

      return true
    })
  }, [tasks, searchQuery, statusFilter, assigneeFilter, workFilter])

  // Contadores
  const counts = useMemo(() => {
    return {
      total: tasks.length,
      pending: tasks.filter((t) => t.status === 'pending').length,
      inProgress: tasks.filter((t) => t.status === 'in_progress').length,
      completed: tasks.filter((t) => t.status === 'completed').length,
    }
  }, [tasks])

  return (
    <div className="space-y-6">
      {/* Banner caso o script SQL ainda não tenha sido aplicado no Supabase */}
      {isTableMissing && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800">
          <CardContent className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Database className="h-6 w-6 text-amber-600 shrink-0" />
              <div>
                <h3 className="font-semibold text-amber-900 dark:text-amber-200">
                  Tabelas do Planner aguardando execução SQL
                </h3>
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  As tabelas <code className="font-mono">planner_tasks</code> e{' '}
                  <code className="font-mono">planner_task_attachments</code> foram incluídas na
                  Etapa 12 do <code className="font-mono">supabase_schema.sql</code>. Execute o
                  script no SQL Editor do Supabase para ativar a sincronização em nuvem.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchTasks()}
              className="border-amber-300 text-amber-900 dark:text-amber-100 hover:bg-amber-100 dark:hover:bg-amber-900"
            >
              Verificar Conexão
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Header do Planner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <CalendarDays className="h-8 w-8 text-primary" /> Planner de Tarefas
          </h1>
          <p className="text-muted-foreground text-sm">
            Planejamento operacional com fotos, vídeos, prazos e pessoas responsáveis vinculadas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border bg-muted p-1">
            <Button
              type="button"
              variant={viewMode === 'kanban' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('kanban')}
              className="h-8 gap-1.5 text-xs"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Kanban
            </Button>
            <Button
              type="button"
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className="h-8 gap-1.5 text-xs"
            >
              <ListIcon className="h-3.5 w-3.5" />
              Lista
            </Button>
          </div>
          <Button onClick={() => handleOpenCreate()} className="gap-2 shrink-0">
            <Plus className="h-4 w-4" /> Nova Tarefa
          </Button>
        </div>
      </div>

      {/* Métricas / Contadores */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="shadow-none border">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase">
                Total de Tarefas
              </p>
              <h3 className="text-2xl font-bold mt-1">{counts.total}</h3>
            </div>
            <div className="p-2.5 rounded-full bg-primary/10 text-primary">
              <CalendarDays className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-none border">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase">Pendentes</p>
              <h3 className="text-2xl font-bold mt-1 text-amber-600">{counts.pending}</h3>
            </div>
            <div className="p-2.5 rounded-full bg-amber-500/10 text-amber-600">
              <Clock className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-none border">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase">Em Andamento</p>
              <h3 className="text-2xl font-bold mt-1 text-blue-600">{counts.inProgress}</h3>
            </div>
            <div className="p-2.5 rounded-full bg-blue-500/10 text-blue-600">
              <Play className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-none border">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase">Concluídas</p>
              <h3 className="text-2xl font-bold mt-1 text-emerald-600">{counts.completed}</h3>
            </div>
            <div className="p-2.5 rounded-full bg-emerald-500/10 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Barra de Filtros e Busca */}
      <Card className="shadow-none">
        <CardContent className="p-3 sm:p-4 space-y-3">
          <div className="flex flex-col md:flex-row gap-3">
            {/* Campo de Busca */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por título, descrição, responsável ou obra..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-sm"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Filtros em Linha */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {/* Filtro por Status */}
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="text-xs sm:text-sm h-9">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Status</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="in_progress">Em Andamento</SelectItem>
                  <SelectItem value="completed">Concluída</SelectItem>
                </SelectContent>
              </Select>

              {/* Filtro por Responsável */}
              <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                <SelectTrigger className="text-xs sm:text-sm h-9">
                  <SelectValue placeholder="Responsável" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Responsáveis</SelectItem>
                  <SelectItem value="unassigned">Sem Responsável</SelectItem>
                  {teamMembers.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name} {member.role ? `(${member.role})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Filtro por Obra */}
              <Select value={workFilter} onValueChange={setWorkFilter}>
                <SelectTrigger className="text-xs sm:text-sm h-9">
                  <SelectValue placeholder="Obra" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as Obras</SelectItem>
                  <SelectItem value="none">Geral / Sem Obra</SelectItem>
                  {works.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Conteúdo Principal: Visualização Kanban ou Lista */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : filteredTasks.length === 0 && tasks.length > 0 ? (
        <div className="text-center py-12 border rounded-lg bg-card">
          <Filter className="h-10 w-10 mx-auto text-muted-foreground opacity-50 mb-3" />
          <p className="text-base font-medium">Nenhuma tarefa encontrada com os filtros atuais.</p>
          <Button
            variant="link"
            size="sm"
            onClick={() => {
              setSearchQuery('')
              setStatusFilter('all')
              setAssigneeFilter('all')
              setWorkFilter('all')
            }}
          >
            Limpar Filtros
          </Button>
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-16 border rounded-lg bg-card space-y-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <CalendarDays className="h-8 w-8" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Nenhuma tarefa criada ainda</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-1">
              Crie sua primeira tarefa operacional, vincule a uma pessoa da equipe e adicione fotos
              ou vídeos de acompanhamento.
            </p>
          </div>
          <Button onClick={() => handleOpenCreate()} className="gap-2">
            <Plus className="h-4 w-4" /> Criar Primeira Tarefa
          </Button>
        </div>
      ) : viewMode === 'kanban' ? (
        /* Visualização Kanban */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {STATUS_COLUMNS.map((col) => {
            const colTasks = filteredTasks.filter((t) => t.status === col.key)
            const ColIcon = col.icon
            return (
              <div key={col.key} className="flex flex-col gap-3 bg-muted/40 p-3 rounded-lg border">
                {/* Cabeçalho da Coluna */}
                <div className="flex items-center justify-between pb-1">
                  <div className="flex items-center gap-2">
                    <ColIcon className={`h-4 w-4 ${col.color}`} />
                    <span className="font-semibold text-sm">{col.label}</span>
                    <Badge variant="secondary" className="h-5 px-1.5 text-xs font-bold">
                      {colTasks.length}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => handleOpenCreate(col.key)}
                    title={`Adicionar tarefa em ${col.label}`}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                {/* Lista de Cards da Coluna */}
                <div className="flex flex-col gap-2.5 min-h-[300px]">
                  {colTasks.length === 0 ? (
                    <div className="h-28 border border-dashed rounded-md flex items-center justify-center text-xs text-muted-foreground">
                      Nenhuma tarefa nesta etapa
                    </div>
                  ) : (
                    colTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        onEdit={() => handleOpenEdit(task)}
                        onDelete={() => handleDeleteTask(task)}
                        onView={() => setPreviewTask(task)}
                        onStatusChange={(newStatus) => handleQuickStatusChange(task.id, newStatus)}
                      />
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* Visualização em Lista */
        <div className="space-y-3">
          {filteredTasks.map((task) => (
            <TaskListItem
              key={task.id}
              task={task}
              onEdit={() => handleOpenEdit(task)}
              onDelete={() => handleDeleteTask(task)}
              onView={() => setPreviewTask(task)}
              onStatusChange={(newStatus) => handleQuickStatusChange(task.id, newStatus)}
            />
          ))}
        </div>
      )}

      {/* Modal de Criação / Edição de Tarefa */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTask ? 'Editar Tarefa' : 'Nova Tarefa no Planner'}</DialogTitle>
            <DialogDescription>
              Preencha os detalhes da atividade, selecione o responsável e anexe fotos ou vídeos.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmitTask} className="space-y-4 py-2">
            {/* Título */}
            <div className="space-y-1.5">
              <Label htmlFor="task-title">Título da Tarefa *</Label>
              <Input
                id="task-title"
                required
                placeholder="Ex.: Instalar esquadrias de alumínio no 2º andar"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
              />
            </div>

            {/* Descrição */}
            <div className="space-y-1.5">
              <Label htmlFor="task-desc">Descrição / Instruções</Label>
              <Textarea
                id="task-desc"
                rows={3}
                placeholder="Descreva o que deve ser feito, detalhes técnicos ou materiais necessários..."
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
              />
            </div>

            {/* Status e Prioridade */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={formStatus}
                  onValueChange={(val: PlannerTaskStatus) => {
                    setFormStatus(val)
                    setFormProgress(progressFromStatus(val, formProgress))
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="in_progress">Em Andamento</SelectItem>
                    <SelectItem value="completed">Concluída</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Prioridade</Label>
                <Select
                  value={formPriority}
                  onValueChange={(val: PlannerTaskPriority) => setFormPriority(val)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baixa</SelectItem>
                    <SelectItem value="medium">Média</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Porcentagem de conclusão (espelhada nas Etapas do Projeto da obra) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="task-progress">Progresso da tarefa</Label>
                <div className="flex items-center gap-1">
                  <Input
                    id="task-progress"
                    type="number"
                    min={0}
                    max={100}
                    step={5}
                    value={formProgress}
                    onChange={(e) => {
                      const p = clampProgress(e.target.value)
                      setFormProgress(p)
                      setFormStatus((cur) => statusFromProgress(p, cur))
                    }}
                    className="h-8 w-20 text-right"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
              <Slider
                min={0}
                max={100}
                step={5}
                value={[formProgress]}
                onValueChange={([p]) => {
                  setFormProgress(p)
                  setFormStatus((cur) => statusFromProgress(p, cur))
                }}
              />
              <p className="text-xs text-muted-foreground">
                Essa porcentagem aparece na aba &quot;Etapas do Projeto&quot; da obra vinculada.
              </p>
            </div>

            {/* Responsável e Obra */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Pessoa Responsável</Label>
                <Select value={formAssigneeId} onValueChange={setFormAssigneeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um membro da equipe" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum responsável atribuído</SelectItem>
                    {teamMembers.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name} {m.role ? `• ${m.role}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Vincular a uma Obra (Opcional)</Label>
                <Select value={formWorkId} onValueChange={setFormWorkId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma obra" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Geral / Nenhuma Obra</SelectItem>
                    {works.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Prazos: Início e Conclusão */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="task-start">Data de Início</Label>
                <Input
                  id="task-start"
                  type="date"
                  value={formStartDate}
                  onChange={(e) => setFormStartDate(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="task-due">Prazo Final (Due Date)</Label>
                <Input
                  id="task-due"
                  type="date"
                  value={formDueDate}
                  onChange={(e) => setFormDueDate(e.target.value)}
                />
              </div>
            </div>

            {/* Anexos Existentes (se editando) */}
            {currentAttachments.length > 0 && (
              <div className="space-y-2 pt-2 border-t">
                <Label className="text-xs uppercase text-muted-foreground font-semibold">
                  Anexos Salvos ({currentAttachments.length})
                </Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {currentAttachments.map((att) => (
                    <div
                      key={att.id}
                      className="group relative border rounded-md p-1.5 bg-muted/30 flex flex-col items-center text-center overflow-hidden"
                    >
                      {att.file_type === 'image' ? (
                        <img
                          src={att.file_url}
                          alt={att.file_name}
                          className="w-full h-20 object-cover rounded"
                        />
                      ) : (
                        <div className="w-full h-20 bg-slate-900 rounded flex flex-col items-center justify-center text-white">
                          <Film className="h-6 w-6 text-primary mb-1" />
                          <span className="text-[10px] text-slate-300">Vídeo</span>
                        </div>
                      )}
                      <span className="text-[10px] text-muted-foreground truncate w-full mt-1">
                        {att.file_name}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteAttachment(att.id)}
                        className="absolute top-1 right-1 p-1 bg-rose-600 text-white rounded-full opacity-80 hover:opacity-100"
                        title="Remover anexo"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upload de Fotos e Vídeos */}
            <div className="space-y-2 pt-2 border-t">
              <Label className="flex items-center gap-1.5">
                <UploadCloud className="h-4 w-4 text-primary" /> Anexar Fotos e Vídeos
              </Label>
              <div className="border border-dashed rounded-lg p-4 text-center hover:bg-muted/30 transition-colors">
                <input
                  type="file"
                  id="planner-file-upload"
                  multiple
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || [])
                    setNewFiles((prev) => [...prev, ...files])
                  }}
                />
                <label
                  htmlFor="planner-file-upload"
                  className="cursor-pointer flex flex-col items-center justify-center gap-1.5 text-sm"
                >
                  <Paperclip className="h-6 w-6 text-muted-foreground" />
                  <span className="font-medium text-primary hover:underline">
                    Clique para selecionar arquivos
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Formatos aceitos: JPG, PNG, WEBP, MP4, MOV, WEBM
                  </span>
                </label>
              </div>

              {/* Fila de novos arquivos a serem enviados */}
              {newFiles.length > 0 && (
                <div className="space-y-1.5 mt-2">
                  <p className="text-xs font-semibold text-muted-foreground">
                    Novos arquivos selecionados ({newFiles.length}):
                  </p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {newFiles.map((file, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-1.5 text-xs bg-muted rounded border"
                      >
                        <div className="flex items-center gap-2 truncate">
                          {file.type.startsWith('video/') ? (
                            <Film className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                          ) : (
                            <ImageIcon className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                          )}
                          <span className="truncate">{file.name}</span>
                          <span className="text-muted-foreground shrink-0">
                            ({(file.size / (1024 * 1024)).toFixed(2)} MB)
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setNewFiles((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-muted-foreground hover:text-rose-600 p-0.5"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Barra de Progresso no Upload */}
              {uploadProgress !== null && (
                <div className="space-y-1 pt-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Enviando anexos para o Supabase...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} className="h-1.5" />
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => setDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...
                  </>
                ) : editingTask ? (
                  'Salvar Alterações'
                ) : (
                  'Criar Tarefa'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal de Detalhes da Tarefa com Galeria de Mídias */}
      {previewTask && (
        <Dialog open={!!previewTask} onOpenChange={(open) => !open && setPreviewTask(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <Badge
                  variant="outline"
                  className={STATUS_COLUMNS.find((s) => s.key === previewTask.status)?.bg}
                >
                  {STATUS_COLUMNS.find((s) => s.key === previewTask.status)?.label}
                </Badge>
                <Badge
                  variant="outline"
                  className={PRIORITY_CONFIG[previewTask.priority].badgeClass}
                >
                  Prioridade: {PRIORITY_CONFIG[previewTask.priority].label}
                </Badge>
                {previewTask.works && (
                  <Badge variant="secondary" className="gap-1">
                    <Building className="h-3 w-3" />
                    {previewTask.works.name}
                  </Badge>
                )}
              </div>
              <DialogTitle className="text-xl font-bold">{previewTask.title}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Descrição */}
              {previewTask.description ? (
                <div className="text-sm text-foreground/90 bg-muted/30 p-3 rounded-lg border whitespace-pre-wrap">
                  {previewTask.description}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">Sem descrição detalhada.</p>
              )}

              {/* Progresso */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-xs text-muted-foreground">Progresso</span>
                  <span className="font-semibold">{taskProgress(previewTask)}%</span>
                </div>
                <Progress value={taskProgress(previewTask)} className="h-2" />
              </div>

              {/* Informações de Responsável e Datas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-muted/20 rounded-lg border text-sm">
                <div>
                  <span className="text-xs text-muted-foreground block">Pessoa Responsável:</span>
                  <div className="flex items-center gap-2 mt-1">
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="text-xs font-semibold bg-primary/20 text-primary">
                        {previewTask.team_members?.name
                          ? previewTask.team_members.name.substring(0, 2).toUpperCase()
                          : '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <span className="font-medium text-sm">
                        {previewTask.team_members?.name || 'Não atribuído'}
                      </span>
                      {previewTask.team_members?.role && (
                        <p className="text-xs text-muted-foreground">
                          {previewTask.team_members.role}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Prazos de Execução:</div>
                  <div className="text-xs">
                    <span className="text-muted-foreground">Início: </span>
                    <span className="font-medium">
                      {previewTask.start_date ? formatDate(previewTask.start_date) : 'Não definido'}
                    </span>
                  </div>
                  <div className="text-xs">
                    <span className="text-muted-foreground">Prazo Final: </span>
                    <span className="font-medium">
                      {previewTask.due_date ? formatDate(previewTask.due_date) : 'Sem prazo'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Galeria de Fotos e Vídeos Anexados */}
              <div>
                <h4 className="text-sm font-semibold flex items-center gap-2 mb-3">
                  <Paperclip className="h-4 w-4 text-primary" /> Anexos e Mídias (
                  {previewTask.attachments?.length || 0})
                </h4>

                {!previewTask.attachments || previewTask.attachments.length === 0 ? (
                  <div className="text-center py-6 border border-dashed rounded-lg text-xs text-muted-foreground">
                    Nenhuma foto ou vídeo anexado a esta tarefa.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {previewTask.attachments.map((att) => (
                      <div
                        key={att.id}
                        className="group relative border rounded-lg overflow-hidden bg-card shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() =>
                          setMediaPreview({
                            url: att.file_url,
                            type: att.file_type,
                            name: att.file_name,
                          })
                        }
                      >
                        {att.file_type === 'image' ? (
                          <div className="aspect-video w-full bg-slate-100 dark:bg-slate-900 overflow-hidden">
                            <img
                              src={att.file_url}
                              alt={att.file_name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          </div>
                        ) : (
                          <div className="aspect-video w-full bg-slate-900 flex flex-col items-center justify-center text-white relative">
                            <Film className="h-8 w-8 text-primary group-hover:scale-110 transition-transform" />
                            <span className="text-[11px] mt-1 text-slate-300">
                              Reproduzir Vídeo
                            </span>
                          </div>
                        )}
                        <div className="p-2 text-xs truncate bg-background/90 border-t flex items-center justify-between">
                          <span className="truncate">{att.file_name}</span>
                          <span className="text-[10px] uppercase font-semibold text-muted-foreground shrink-0 ml-1">
                            {att.file_type}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="flex flex-col sm:flex-row gap-2 justify-between">
              <div className="flex gap-1.5 flex-wrap">
                {STATUS_COLUMNS.map((col) => (
                  <Button
                    key={col.key}
                    type="button"
                    size="sm"
                    variant={previewTask.status === col.key ? 'default' : 'outline'}
                    className="text-xs h-8"
                    onClick={() => handleQuickStatusChange(previewTask.id, col.key)}
                  >
                    {col.label}
                  </Button>
                ))}
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const taskToEdit = previewTask
                    setPreviewTask(null)
                    handleOpenEdit(taskToEdit)
                  }}
                  className="gap-1.5"
                >
                  <Edit2 className="h-3.5 w-3.5" /> Editar
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPreviewTask(null)}
                >
                  Fechar
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Modal Lightbox de Preview de Foto / Vídeo em alta resolução */}
      {mediaPreview && (
        <Dialog open={!!mediaPreview} onOpenChange={(open) => !open && setMediaPreview(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] p-2 bg-black/95 text-white border-slate-800">
            <div className="flex justify-between items-center p-2 border-b border-slate-800">
              <span className="text-sm font-medium truncate">{mediaPreview.name}</span>
              <a
                href={mediaPreview.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary hover:underline ml-4 shrink-0"
              >
                Abrir Original
              </a>
            </div>
            <div className="flex items-center justify-center p-2 min-h-[300px]">
              {mediaPreview.type === 'image' ? (
                <img
                  src={mediaPreview.url}
                  alt={mediaPreview.name}
                  className="max-h-[70vh] w-auto max-w-full object-contain rounded"
                />
              ) : (
                <video
                  src={mediaPreview.url}
                  controls
                  autoPlay
                  className="max-h-[70vh] w-full rounded"
                />
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

/**
 * Card Individual de Tarefa no modo Kanban
 */
function TaskCard({
  task,
  onEdit,
  onDelete,
  onView,
  onStatusChange,
}: {
  task: PlannerTask
  onEdit: () => void
  onDelete: () => void
  onView: () => void
  onStatusChange: (status: PlannerTaskStatus) => void
}) {
  const images = task.attachments?.filter((a) => a.file_type === 'image') || []
  const videos = task.attachments?.filter((a) => a.file_type === 'video') || []

  return (
    <Card className="shadow-sm hover:shadow-md transition-shadow bg-card border group">
      {/* Miniatura do Primeiro Anexo se existir */}
      {images.length > 0 && (
        <div
          className="h-28 w-full overflow-hidden rounded-t-lg bg-muted cursor-pointer"
          onClick={onView}
        >
          <img
            src={images[0].file_url}
            alt={images[0].file_name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        </div>
      )}

      <CardContent className="p-3 space-y-2.5">
        {/* Badges de Obra e Prioridade */}
        <div className="flex items-center justify-between gap-1 flex-wrap">
          <Badge
            variant="outline"
            className={`text-[10px] px-1.5 py-0 h-4 ${PRIORITY_CONFIG[task.priority].badgeClass}`}
          >
            {PRIORITY_CONFIG[task.priority].label}
          </Badge>

          {task.works && (
            <Badge
              variant="secondary"
              className="text-[10px] px-1.5 py-0 h-4 truncate max-w-[140px]"
              title={task.works.name}
            >
              <Building className="h-2.5 w-2.5 mr-1 shrink-0" />
              <span className="truncate">{task.works.name}</span>
            </Badge>
          )}
        </div>

        {/* Título da Tarefa */}
        <h4
          className="font-semibold text-sm leading-snug cursor-pointer hover:text-primary transition-colors line-clamp-2"
          onClick={onView}
        >
          {task.title}
        </h4>

        {/* Descrição resumida */}
        {task.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>
        )}

        {/* Progresso */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Progresso</span>
            <span className="font-semibold text-foreground">{taskProgress(task)}%</span>
          </div>
          <Progress value={taskProgress(task)} className="h-1.5" />
        </div>

        {/* Pessoa Responsável e Prazos */}
        <div className="flex items-center justify-between pt-1 border-t text-xs">
          {/* Responsável */}
          <div className="flex items-center gap-1.5 min-w-0">
            <Avatar className="h-6 w-6 shrink-0">
              <AvatarFallback className="text-[10px] font-semibold bg-primary/10 text-primary">
                {task.team_members?.name
                  ? task.team_members.name.substring(0, 2).toUpperCase()
                  : '?'}
              </AvatarFallback>
            </Avatar>
            <span
              className="truncate text-[11px] font-medium text-foreground/80 max-w-[90px]"
              title={task.team_members?.name || 'Sem responsável'}
            >
              {task.team_members?.name || 'Sem resp.'}
            </span>
          </div>

          {/* Prazo */}
          {task.due_date && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
              <Calendar className="h-3 w-3" />
              <span>{formatDate(task.due_date)}</span>
            </div>
          )}
        </div>

        {/* Rodapé: Contagem de Anexos e Ações Rápidas */}
        <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            {images.length > 0 && (
              <span className="flex items-center gap-0.5 text-[11px]">
                <ImageIcon className="h-3 w-3 text-emerald-600" /> {images.length}
              </span>
            )}
            {videos.length > 0 && (
              <span className="flex items-center gap-0.5 text-[11px]">
                <Film className="h-3 w-3 text-blue-600" /> {videos.length}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-primary"
              onClick={onEdit}
              title="Editar"
            >
              <Edit2 className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-rose-600"
              onClick={onDelete}
              title="Excluir"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Item Individual de Tarefa no modo Lista
 */
function TaskListItem({
  task,
  onEdit,
  onDelete,
  onView,
  onStatusChange,
}: {
  task: PlannerTask
  onEdit: () => void
  onDelete: () => void
  onView: () => void
  onStatusChange: (status: PlannerTaskStatus) => void
}) {
  const images = task.attachments?.filter((a) => a.file_type === 'image') || []
  const videos = task.attachments?.filter((a) => a.file_type === 'video') || []

  return (
    <Card className="shadow-none border hover:bg-muted/20 transition-colors">
      <CardContent className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {/* Indicador de Status como Botão de Conclusão Rápida */}
          <button
            type="button"
            onClick={() => onStatusChange(task.status === 'completed' ? 'pending' : 'completed')}
            className={`mt-0.5 p-1 rounded-full border transition-colors shrink-0 ${
              task.status === 'completed'
                ? 'bg-emerald-600 border-emerald-600 text-white'
                : 'border-muted-foreground/40 hover:border-primary text-transparent'
            }`}
            title={task.status === 'completed' ? 'Reabrir tarefa' : 'Marcar como concluída'}
          >
            <Check className="h-3.5 w-3.5" />
          </button>

          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4
                className={`font-semibold text-sm cursor-pointer hover:text-primary transition-colors ${
                  task.status === 'completed' ? 'line-through text-muted-foreground' : ''
                }`}
                onClick={onView}
              >
                {task.title}
              </h4>
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 h-4 ${PRIORITY_CONFIG[task.priority].badgeClass}`}
              >
                {PRIORITY_CONFIG[task.priority].label}
              </Badge>
              {task.works && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                  <Building className="h-2.5 w-2.5 mr-1" />
                  {task.works.name}
                </Badge>
              )}
            </div>

            {task.description && (
              <p className="text-xs text-muted-foreground line-clamp-1">{task.description}</p>
            )}

            <div className="flex items-center gap-2 max-w-sm pt-1">
              <Progress value={taskProgress(task)} className="h-1.5 flex-1" />
              <span className="text-[11px] font-semibold w-9 text-right">{taskProgress(task)}%</span>
            </div>

            {/* Informações de rodapé da linha */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1 flex-wrap">
              {/* Responsável */}
              <div className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                <span>{task.team_members?.name || 'Sem responsável'}</span>
              </div>

              {/* Prazo */}
              {task.due_date && (
                <div className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>Prazo: {formatDate(task.due_date)}</span>
                </div>
              )}

              {/* Anexos */}
              {(images.length > 0 || videos.length > 0) && (
                <div className="flex items-center gap-2">
                  {images.length > 0 && (
                    <span className="flex items-center gap-0.5">
                      <ImageIcon className="h-3 w-3 text-emerald-600" /> {images.length}
                    </span>
                  )}
                  {videos.length > 0 && (
                    <span className="flex items-center gap-0.5">
                      <Film className="h-3 w-3 text-blue-600" /> {videos.length}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Coluna Direita: Status Selector e Ações */}
        <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0">
          <Select
            value={task.status}
            onValueChange={(val: PlannerTaskStatus) => onStatusChange(val)}
          >
            <SelectTrigger className="h-8 text-xs w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pendente</SelectItem>
              <SelectItem value="in_progress">Em Andamento</SelectItem>
              <SelectItem value="completed">Concluída</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-primary"
            onClick={onEdit}
            title="Editar tarefa"
          >
            <Edit2 className="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-rose-600"
            onClick={onDelete}
            title="Excluir tarefa"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
