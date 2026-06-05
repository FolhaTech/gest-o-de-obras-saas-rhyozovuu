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
import { Plus, ArrowRightLeft, Search, Edit, Trash } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

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
    supplier: '',
    unit_price: '',
  })

  const [editOpen, setEditOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editData, setEditData] = useState({
    name: '',
    category: '',
    unit_of_measure: '',
    stock_quantity: '',
    min_quantity: '',
    supplier: '',
    unit_price: '',
    status: 'active',
  })

  const handleSimulateMovement = async (id: string, name: string) => {
    const { error } = await supabase.from('material_movements').insert({
      material_id: id,
      type: 'output',
      quantity: 10,
      date: new Date().toISOString().split('T')[0],
    })
    if (!error) {
      toast({ title: 'Saída registrada', description: `10 unidades de ${name} removidas.` })
      refetch()
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
      supplier: formData.supplier || null,
      unit_price: formData.unit_price ? Number(formData.unit_price) : null,
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
        supplier: '',
        unit_price: '',
      })
      refetch()
    } else {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' })
    }
  }

  const openEdit = (mat: Material) => {
    setEditId(mat.id)
    setEditData({
      name: mat.name,
      category: mat.category || '',
      unit_of_measure: mat.unit_of_measure || '',
      stock_quantity: String(mat.stock_quantity || 0),
      min_quantity: String(mat.min_quantity || 0),
      supplier: mat.supplier || '',
      unit_price: mat.unit_price ? String(mat.unit_price) : '',
      status: mat.status || 'active',
    })
    setEditOpen(true)
  }

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editId) return
    const { error } = await supabase
      .from('materials')
      .update({
        name: editData.name,
        category: editData.category,
        unit_of_measure: editData.unit_of_measure,
        stock_quantity: Number(editData.stock_quantity),
        min_quantity: Number(editData.min_quantity),
        supplier: editData.supplier || null,
        unit_price: editData.unit_price ? Number(editData.unit_price) : null,
        status: editData.status,
      })
      .eq('id', editId)

    if (!error) {
      toast({ title: 'Material atualizado!' })
      setEditOpen(false)
      refetch()
    } else {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' })
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja excluir este material?')) return
    const { error } = await supabase.from('materials').delete().eq('id', id)
    if (!error) {
      toast({ title: 'Material excluído' })
      refetch()
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
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Cadastrar Material</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 mt-4 px-1">
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
                    <Label>Fornecedor</Label>
                    <Input
                      value={formData.supplier}
                      onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Preço Unitário (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.unit_price}
                      onChange={(e) => setFormData({ ...formData, unit_price: e.target.value })}
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
                    {item.status === 'inactive' ? (
                      <Badge variant="outline">Inativo</Badge>
                    ) : isLow ? (
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
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(item)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(item.id)}
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Material</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4 mt-4 px-1">
            <div className="space-y-2">
              <Label>Nome do Material</Label>
              <Input
                required
                value={editData.name}
                onChange={(e) => setEditData({ ...editData, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Input
                  required
                  value={editData.category}
                  onChange={(e) => setEditData({ ...editData, category: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Unidade de Medida</Label>
                <Input
                  required
                  value={editData.unit_of_measure}
                  onChange={(e) => setEditData({ ...editData, unit_of_measure: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fornecedor</Label>
                <Input
                  value={editData.supplier}
                  onChange={(e) => setEditData({ ...editData, supplier: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Preço Unitário (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editData.unit_price}
                  onChange={(e) => setEditData({ ...editData, unit_price: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Estoque Atual</Label>
                <Input
                  type="number"
                  required
                  value={editData.stock_quantity}
                  onChange={(e) => setEditData({ ...editData, stock_quantity: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Estoque Mínimo</Label>
                <Input
                  type="number"
                  required
                  value={editData.min_quantity}
                  onChange={(e) => setEditData({ ...editData, min_quantity: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={editData.status}
                onValueChange={(val) => setEditData({ ...editData, status: val })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="inactive">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full">
              Atualizar Material
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
