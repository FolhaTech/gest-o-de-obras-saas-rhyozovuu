import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CheckCircle2, CircleDashed, Clock, Plus, Trash } from 'lucide-react'
import { useDataFilter } from '@/hooks/use-data'
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

export default function StagesTab({ obraId }: { obraId: string }) {
  const {
    data: obraStages,
    loading,
    refetch,
  } = useDataFilter<Stage>('work_stages', 'work_id', obraId)
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [formData, setFormData] = useState({ name: '', manager: '', progress: 0 })

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
    const { error } = await supabase.from('work_stages').insert({
      work_id: obraId,
      name: formData.name,
      manager: formData.manager,
      progress_percentage: formData.progress,
      status: status,
    })

    if (!error) {
      toast({ title: 'Etapa adicionada!' })
      setOpen(false)
      setFormData({ name: '', manager: '', progress: 0 })
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
      <div className="flex justify-between items-center pb-2">
        <h3 className="text-lg font-semibold">Etapas da Obra</h3>
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
                  value={formData.manager}
                  onChange={(e) => setFormData({ ...formData, manager: e.target.value })}
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
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDelete(stage.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        ))
      )}
    </div>
  )
}
