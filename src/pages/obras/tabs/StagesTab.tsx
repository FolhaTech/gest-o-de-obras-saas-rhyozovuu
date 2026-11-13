import { useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CheckCircle2, CircleDashed, Clock, Plus, Trash, Edit } from 'lucide-react'
import { useData, useDataFilter } from '@/hooks/use-data'
import { Stage } from '@/types'
import { Skeleton } from '@/components/ui/skeleton'
import { translateStatus } from '@/lib/formatters'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Database, RefreshCw, WifiOff } from 'lucide-react'
import { isMissingTableError } from '@/hooks/use-data'
import PlannerTasksSection from './PlannerTasksSection'

export default function StagesTab({ obraId }: { obraId: string }) {
  const {
    data: obraStages,
    loading,
    isTableMissing,
    isNetworkError,
    refetch,
  } = useDataFilter<Stage>('work_stages', 'work_id', obraId)
  const { toast } = useToast()
  // Prestador só visualiza as etapas (o banco também bloqueia alterações).
  // Financeiro também só consulta (readOnly).
  const { role, readOnly } = useAuth()
  const canEdit = role !== 'prestador' && !readOnly
  // Responsável = pessoa da Equipe
  const { data: teamMembers } = useData<{ id: string; name: string; provider_id?: string | null }>('team_members')

  const [open, setOpen] = useState(false)
  const [formData, setFormData] = useState({ name: '', manager: '', progress: 0 })

  const [editOpen, setEditOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editFormData, setEditFormData] = useState({
    name: '',
    manager: '',
    progress: 0,
    status: 'pending',
    notes: '',
    start_date: '',
    end_date_planned: '',
    end_date_real: '',
  })

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-emerald-500" />
      case 'in_progress':
        return <Clock className="h-5 w-5 text-blue-500" />
      default:
        return <CircleDashed className="h-5 w-5 text-muted-foreground" />
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const status =
      formData.progress === 100 ? 'completed' : formData.progress > 0 ? 'in_progress' : 'pending'
    try {
      const { error } = await supabase.from('work_stages').insert({
        work_id: obraId,
        name: formData.name,
        manager: formData.manager,
        progress_percentage: formData.progress,
        status: status,
      })

      if (!error) {
        toast({ title: 'Etapa adicionada!', description: 'Ela também aparece no Planner.' })
        setOpen(false)
        setFormData({ name: '', manager: '', progress: 0 })
        refetch()
      } else {
        if (isMissingTableError(error)) {
          toast({
            title: 'Tabela ausente no Supabase',
            description: 'A tabela work_stages precisa ser criada no Supabase.',
            variant: 'destructive',
          })
        } else {
          toast({ title: 'Erro', description: error.message, variant: 'destructive' })
        }
      }
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: err?.message || 'Falha ao salvar',
        variant: 'destructive',
      })
    }
  }

  const openEdit = (stage: Stage) => {
    setEditId(stage.id)
    setEditFormData({
      name: stage.name,
      manager: stage.manager || '',
      progress: stage.progress_percentage || 0,
      status: stage.status || 'pending',
      notes: stage.notes || '',
      start_date: stage.start_date || '',
      end_date_planned: stage.end_date_planned || '',
      end_date_real: stage.end_date_real || '',
    })
    setEditOpen(true)
  }

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editId) return
    const { error } = await supabase
      .from('work_stages')
      .update({
        name: editFormData.name,
        manager: editFormData.manager,
        progress_percentage: editFormData.progress,
        status: editFormData.status,
        notes: editFormData.notes,
        start_date: editFormData.start_date || null,
        end_date_planned: editFormData.end_date_planned || null,
        end_date_real: editFormData.end_date_real || null,
      })
      .eq('id', editId)

    if (!error) {
      toast({ title: 'Etapa atualizada!' })
      setEditOpen(false)
      refetch()
    } else {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' })
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja excluir esta etapa?')) return
    const { error } = await supabase.from('work_stages').delete().eq('id', id)
    if (!error) {
      toast({ title: 'Etapa excluída' })
      refetch()
    } else {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' })
    }
  }

  if (loading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )

  return (
    <div className="space-y-4">
      <datalist id="stg-team-members">
        {(teamMembers || []).map((m) => (
          <option key={m.id} value={m.name.trim()} label={m.provider_id ? 'Prestador' : undefined} />
        ))}
      </datalist>
      {isTableMissing && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900">
          <Database className="h-5 w-5 text-amber-600" />
          <AlertTitle className="font-semibold text-amber-900">
            Tabela de etapas ainda não criada no Supabase
          </AlertTitle>
          <AlertDescription className="text-amber-800 text-sm mt-1">
            A tabela <code className="font-mono">work_stages</code> ainda não existe. Execute o
            script de migração no Supabase para salvar e gerenciar etapas da obra.
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
      )}

      {isNetworkError && !isTableMissing && (
        <Alert variant="destructive">
          <WifiOff className="h-5 w-5" />
          <AlertTitle className="font-semibold">Erro de conexão</AlertTitle>
          <AlertDescription className="text-sm mt-1">
            Não foi possível carregar as etapas da obra.
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

      <div className="flex justify-between items-center pb-2">
        <h3 className="text-lg font-semibold">Etapas da Obra</h3>
        {canEdit && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" /> Nova Etapa
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Etapa</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Nome da Etapa</Label>
                <Input
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Responsável</Label>
                <Input
                  list="stg-team-members"
                  value={formData.manager}
                  onChange={(e) => setFormData({ ...formData, manager: e.target.value })}
                  placeholder="Escolha um membro da equipe"
                />
              </div>
              <div className="space-y-2">
                <Label>Progresso Atual (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={formData.progress}
                  onChange={(e) => setFormData({ ...formData, progress: Number(e.target.value) })}
                />
              </div>
              <Button type="submit" className="w-full">
                Salvar Etapa
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        )}
      </div>

      {obraStages.length === 0 ? (
        <p className="text-muted-foreground p-4">Nenhuma etapa cadastrada.</p>
      ) : (
        obraStages.map((stage) => (
          <Card key={stage.id} className="overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 md:p-6">
              <div className="flex items-center gap-3 w-full sm:w-1/3">
                {getStatusIcon(stage.status)}
                <div>
                  <h4 className="font-medium text-base">{stage.name}</h4>
                  <p className="text-xs text-muted-foreground">Resp: {stage.manager || '-'}</p>
                </div>
              </div>
              <div className="flex-1 w-full space-y-2">
                <div className="flex justify-between text-sm">
                  <Badge variant="secondary" className="font-normal">
                    {translateStatus(stage.status)}
                  </Badge>
                  <span className="font-medium">{stage.progress_percentage}%</span>
                </div>
                <Progress value={stage.progress_percentage} className="h-2" />
              </div>
              {canEdit && (
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => openEdit(stage)}
                  className="text-muted-foreground hover:text-primary"
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(stage.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash className="h-4 w-4" />
                </Button>
              </div>
              )}
            </div>
          </Card>
        ))
      )}

      {/* Financeiro não lê o Planner (RLS): sem a seção de tarefas do Planner */}
      {!readOnly && (
      <div className="pt-6 border-t">
        <PlannerTasksSection obraId={obraId} />
      </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Etapa</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4 mt-4 px-1">
            <div className="space-y-2">
              <Label>Nome da Etapa</Label>
              <Input
                required
                value={editFormData.name}
                onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Responsável</Label>
              <Input
                list="stg-team-members"
                value={editFormData.manager}
                onChange={(e) => setEditFormData({ ...editFormData, manager: e.target.value })}
                placeholder="Escolha um membro da equipe"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Início</Label>
                <Input
                  type="date"
                  value={editFormData.start_date}
                  onChange={(e) => setEditFormData({ ...editFormData, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Progresso Atual (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={editFormData.progress}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, progress: Number(e.target.value) })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fim (Planejado)</Label>
                <Input
                  type="date"
                  value={editFormData.end_date_planned}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, end_date_planned: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Fim (Real)</Label>
                <Input
                  type="date"
                  value={editFormData.end_date_real}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, end_date_real: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={editFormData.status}
                onValueChange={(val) => setEditFormData({ ...editFormData, status: val })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="in_progress">Em Andamento</SelectItem>
                  <SelectItem value="delayed">Atrasado</SelectItem>
                  <SelectItem value="completed">Concluído</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Input
                value={editFormData.notes}
                onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
              />
            </div>
            <Button type="submit" className="w-full">
              Atualizar Etapa
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
