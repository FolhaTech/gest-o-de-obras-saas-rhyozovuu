import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Building, Edit, Trash } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { getStatusColor, translateStatus } from '@/lib/formatters'
import { useDataFilter } from '@/hooks/use-data'
import { Obra } from '@/types'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import OverviewTab from './tabs/OverviewTab'
import StagesTab from './tabs/StagesTab'
import MaterialsTab from './tabs/MaterialsTab'
import RevenuesTab from './tabs/RevenuesTab'
import ScheduleTab from './tabs/ScheduleTab'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import NotesTab from './tabs/NotesTab'

export default function ObraDetail() {
  const { id } = useParams<{ id: string }>()
  const [activeTab, setActiveTab] = useState('visao-geral')
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data: works, loading, refetch } = useDataFilter<Obra>('works', 'id', id)
  const obra = works?.[0]

  const [editOpen, setEditOpen] = useState(false)
  const [formData, setFormData] = useState<Partial<Obra>>({})

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (!obra) {
    return <div className="p-8 text-center text-muted-foreground">Obra não encontrada.</div>
  }

  const openEdit = () => {
    setFormData({
      name: obra.name,
      client: obra.client,
      manager: obra.manager,
      address: obra.address,
      start_date: obra.start_date,
      end_date_planned: obra.end_date_planned,
      budget_planned: obra.budget_planned,
      total_area: obra.total_area,
    })
    setEditOpen(true)
  }

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    const { error } = await supabase.from('works').update(formData).eq('id', obra.id)
    if (!error) {
      toast({ title: 'Obra atualizada com sucesso!' })
      setEditOpen(false)
      refetch()
    } else {
      toast({ title: 'Erro ao atualizar', description: error.message, variant: 'destructive' })
    }
  }

  const handleDelete = async () => {
    if (
      !confirm(
        'Tem certeza que deseja excluir esta obra? Todas as informações associadas serão perdidas.',
      )
    )
      return
    const { error } = await supabase.from('works').delete().eq('id', obra.id)
    if (!error) {
      toast({ title: 'Obra excluída!' })
      navigate('/obras')
    } else {
      toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-6 animate-slide-in-right">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/obras" className="p-2 hover:bg-muted rounded-full transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{obra.name}</h1>
              <Badge variant="outline" className={getStatusColor(obra.status)}>
                {translateStatus(obra.status)}
              </Badge>
            </div>
            <p className="text-muted-foreground flex items-center gap-2 mt-1">
              <Building className="h-4 w-4" /> {obra.client}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={openEdit}>
            <Edit className="h-4 w-4" /> Editar
          </Button>
          <Button variant="destructive" size="sm" className="gap-2" onClick={handleDelete}>
            <Trash className="h-4 w-4" /> Excluir
          </Button>
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Obra</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Nome da Obra</Label>
              <Input
                required
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Cliente</Label>
              <Input
                required
                value={formData.client || ''}
                onChange={(e) => setFormData({ ...formData, client: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Gerente/Engenheiro</Label>
              <Input
                value={formData.manager || ''}
                onChange={(e) => setFormData({ ...formData, manager: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Data de Início</Label>
              <Input
                type="date"
                value={formData.start_date || ''}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Previsão de Término</Label>
              <Input
                type="date"
                value={formData.end_date_planned || ''}
                onChange={(e) => setFormData({ ...formData, end_date_planned: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Área Total (m²)</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.total_area || ''}
                onChange={(e) => setFormData({ ...formData, total_area: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>Orçamento Planejado</Label>
              <Input
                type="number"
                value={formData.budget_planned || ''}
                onChange={(e) =>
                  setFormData({ ...formData, budget_planned: Number(e.target.value) })
                }
              />
            </div>
            <Button type="submit" className="w-full">
              Salvar Alterações
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent mb-6 overflow-x-auto">
          <TabsTrigger
            value="visao-geral"
            className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-2"
          >
            Visão Geral
          </TabsTrigger>
          <TabsTrigger
            value="notas"
            className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-2"
          >
            Notas
          </TabsTrigger>
          <TabsTrigger
            value="etapas"
            className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-2"
          >
            Etapas do Projeto
          </TabsTrigger>
          <TabsTrigger
            value="materiais"
            className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-2"
          >
            Materiais Alocados
          </TabsTrigger>
          <TabsTrigger
            value="receitas"
            className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-2"
          >
            Receitas
          </TabsTrigger>
          <TabsTrigger
            value="cronograma"
            className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-2"
          >
            Cronograma
          </TabsTrigger>
        </TabsList>

        <TabsContent value="visao-geral" className="mt-0">
          <OverviewTab obra={obra} onAddNote={() => setActiveTab('notas')} />
        </TabsContent>
        <TabsContent value="notas" className="mt-0">
          <NotesTab obraId={obra.id} />
        </TabsContent>
        <TabsContent value="etapas" className="mt-0">
          <StagesTab obraId={obra.id} />
        </TabsContent>
        <TabsContent value="materiais" className="mt-0">
          <MaterialsTab obraId={obra.id} />
        </TabsContent>
        <TabsContent value="receitas" className="mt-0">
          <RevenuesTab obraId={obra.id} />
        </TabsContent>
        <TabsContent value="cronograma" className="mt-0">
          <ScheduleTab obraId={obra.id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
