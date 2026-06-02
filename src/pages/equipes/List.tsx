import { useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency } from '@/lib/formatters'
import { useData } from '@/hooks/use-data'
import { Equipe } from '@/types'
import { Plus, UserCheck, UserMinus } from 'lucide-react'
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
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'

export default function EquipesList() {
  const { data: equipes, loading, refetch } = useData<Equipe>('team_members')
  const { toast } = useToast()

  const [open, setOpen] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    type: 'internal',
    daily_cost: '',
  })

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const { error } = await supabase.from('team_members').insert({
      name: formData.name,
      role: formData.role,
      type: formData.type,
      daily_cost: Number(formData.daily_cost),
      status: 'active',
    })

    if (!error) {
      toast({ title: 'Equipe registrada com sucesso!' })
      setOpen(false)
      setFormData({ name: '', role: '', type: 'internal', daily_cost: '' })
      refetch()
    } else {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' })
    }
  }

  if (loading) return <Skeleton className="h-64 w-full" />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Equipes e Mão de Obra</h1>
          <p className="text-muted-foreground">Gestão de equipes próprias e terceirizadas.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> Nova Equipe
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Equipe / Funcionário</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Nome / Empresa</Label>
                <Input
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Função / Especialidade</Label>
                <Input
                  required
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select
                  value={formData.type}
                  onValueChange={(val) => setFormData({ ...formData, type: val })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internal">Própria</SelectItem>
                    <SelectItem value="outsourced">Terceirizada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Custo Diário (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  value={formData.daily_cost}
                  onChange={(e) => setFormData({ ...formData, daily_cost: e.target.value })}
                />
              </div>
              <Button type="submit" className="w-full">
                Salvar
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome da Equipe</TableHead>
              <TableHead>Especialidade</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Custo Diário</TableHead>
              <TableHead className="text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {equipes.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                  Nenhuma equipe cadastrada.
                </TableCell>
              </TableRow>
            )}
            {equipes.map((equipe) => (
              <TableRow key={equipe.id}>
                <TableCell className="font-medium">{equipe.name}</TableCell>
                <TableCell className="text-muted-foreground">{equipe.role}</TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={
                      equipe.type === 'internal'
                        ? 'bg-blue-50 text-blue-700'
                        : 'bg-orange-50 text-orange-700'
                    }
                  >
                    {equipe.type === 'internal' ? 'Própria' : 'Terceirizada'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(equipe.daily_cost)}
                </TableCell>
                <TableCell className="text-center">
                  {equipe.status === 'active' ? (
                    <div className="flex items-center justify-center gap-1 text-emerald-600 text-sm font-medium">
                      <UserCheck className="h-4 w-4" /> Ativo
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-1 text-muted-foreground text-sm font-medium">
                      <UserMinus className="h-4 w-4" /> Inativo
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
