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
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, ArrowRightLeft, Search } from 'lucide-react'
import { useData } from '@/hooks/use-data'
import { Material } from '@/types'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase/client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'

export default function MateriaisList() {
  const { data: materiais, loading, refetch } = useData<Material>('materials')
  const { toast } = useToast()

  const [open, setOpen] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    unit_of_measure: '',
    stock_quantity: '',
    min_quantity: '',
  })

  const handleSimulateMovement = async (id: string, name: string) => {
    const { error } = await supabase.from('material_movements').insert({
      material_id: id,
      type: 'output',
      quantity: 10,
      date: new Date().toISOString().split('T')[0],
    })
    if (!error) {
      toast({
        title: 'Saída de estoque registrada',
        description: `10 unidades de ${name} removidas.`,
      })
      refetch()
    } else {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' })
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const { error } = await supabase.from('materials').insert({
      name: formData.name,
      category: formData.category,
      unit_of_measure: formData.unit_of_measure,
      stock_quantity: Number(formData.stock_quantity),
      min_quantity: Number(formData.min_quantity),
    })
    if (!error) {
      toast({ title: 'Material cadastrado com sucesso!' })
      setOpen(false)
      setFormData({
        name: '',
        category: '',
        unit_of_measure: '',
        stock_quantity: '',
        min_quantity: '',
      })
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
          <h1 className="text-3xl font-bold tracking-tight">Estoque e Materiais</h1>
          <p className="text-muted-foreground">Controle de inventário e movimentações.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2">
            <ArrowRightLeft className="h-4 w-4" /> Movimentação
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" /> Novo Material
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Cadastrar Material</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Nome do Material</Label>
                  <Input
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Categoria</Label>
                    <Input
                      required
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Unidade de Medida</Label>
                    <Input
                      required
                      placeholder="Ex: Saco, m³, Unidade"
                      value={formData.unit_of_measure}
                      onChange={(e) =>
                        setFormData({ ...formData, unit_of_measure: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Estoque Inicial</Label>
                    <Input
                      type="number"
                      required
                      value={formData.stock_quantity}
                      onChange={(e) => setFormData({ ...formData, stock_quantity: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Estoque Mínimo</Label>
                    <Input
                      type="number"
                      required
                      value={formData.min_quantity}
                      onChange={(e) => setFormData({ ...formData, min_quantity: e.target.value })}
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full">
                  Salvar Material
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex items-center py-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input type="search" placeholder="Buscar material..." className="pl-9" />
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Material</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead className="text-right">Qtd Atual</TableHead>
              <TableHead className="text-right">Estoque Min.</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {materiais.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                  Nenhum material cadastrado.
                </TableCell>
              </TableRow>
            )}
            {materiais.map((item) => {
              const isLow = item.stock_quantity <= item.min_quantity
              return (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    {item.name}
                    <span className="block text-xs text-muted-foreground">
                      {item.unit_of_measure}
                    </span>
                  </TableCell>
                  <TableCell>{item.category}</TableCell>
                  <TableCell
                    className={`text-right font-bold text-lg ${isLow ? 'text-red-600' : ''}`}
                  >
                    {item.stock_quantity}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {item.min_quantity}
                  </TableCell>
                  <TableCell className="text-center">
                    {isLow ? (
                      <Badge variant="destructive" className="bg-red-500">
                        Atenção
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">
                        Normal
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSimulateMovement(item.id, item.name)}
                      disabled={item.stock_quantity < 10}
                    >
                      Simular Saída
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
