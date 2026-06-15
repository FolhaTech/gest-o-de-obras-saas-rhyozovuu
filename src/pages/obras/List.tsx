import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, MapPin, Plus } from 'lucide-react'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
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
import { useData } from '@/hooks/use-data'
import { Obra } from '@/types'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'

export default function ObrasList() {
  const { data: obras, loading, refetch } = useData<Obra>('works')
  const [open, setOpen] = useState(false)
  const { toast } = useToast()
  const [formData, setFormData] = useState({
    name: '',
    client: '',
    budget: '',
    endDate: '',
    totalArea: '',
  })

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const { error } = await supabase.from('works').insert({
      name: formData.name,
      client: formData.client,
      budget_planned: Number(formData.budget),
      end_date_planned: formData.endDate,
      total_area: Number(formData.totalArea) || 0,
      status: 'planned',
    })
    if (!error) {
      toast({ title: 'Obra criada com sucesso!' })
      setOpen(false)
      refetch()
    } else {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' })
    }
  }

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Obras</h1>
          <p className="text-muted-foreground">Gerencie todos os seus projetos de construção.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> Nova Obra
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Nova Obra</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Nome da Obra</Label>
                <Input
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Cliente</Label>
                <Input
                  required
                  value={formData.client}
                  onChange={(e) => setFormData({ ...formData, client: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Data Fim (Previsão)</Label>
                <Input
                  type="date"
                  required
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Área Total (m²)</Label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  value={formData.totalArea}
                  onChange={(e) => setFormData({ ...formData, totalArea: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Orçamento Planejado</Label>
                <Input
                  type="number"
                  required
                  value={formData.budget}
                  onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                />
              </div>
              <Button type="submit" className="w-full">
                Salvar
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {obras.map((obra) => (
          <Link key={obra.id} to={`/obras/${obra.id}`}>
            <Card className="hover:shadow-md transition-all cursor-pointer h-full flex flex-col group">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start mb-2">
                  <Badge variant="outline" className={getStatusColor(obra.status)}>
                    {translateStatus(obra.status)}
                  </Badge>
                </div>
                <CardTitle className="text-xl group-hover:text-primary transition-colors">
                  {obra.name}
                </CardTitle>
                <p className="text-sm text-muted-foreground">{obra.client}</p>
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
                    <span>{obra.progress_percentage}%</span>
                  </div>
                  <Progress value={obra.progress_percentage} className="h-2" />
                </div>
              </CardContent>
              <CardFooter className="bg-muted/30 border-t py-3">
                <div className="w-full flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Orçamento</span>
                  <span className="font-semibold">{formatCurrency(obra.budget_planned)}</span>
                </div>
              </CardFooter>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
