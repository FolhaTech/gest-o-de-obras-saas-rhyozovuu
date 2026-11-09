import { useState, useEffect } from 'react'
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
import { Plus, Search, Edit, Trash } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import MaterialLossesPanel from '@/components/materials/MaterialLossesPanel'
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
  const [materiais, setMateriais] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  const [tab, setTab] = useState('all')
  // Estoque (catálogo) ou Controle de Perdas
  const [view, setView] = useState<'estoque' | 'perdas'>('estoque')
  const [search, setSearch] = useState('')

  const [open, setOpen] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    unidade_nativa: 'kg',
    peso_saco_kg: '',
    densidade_kg_m3: '',
    peso_unitario_kg: '',
    stock_quantity: '',
    min_quantity: '',
    supplier: '',
    unit_price: '',
  })

  const [editOpen, setEditOpen] = useState(false)
  const [editFormData, setEditFormData] = useState({
    id: '',
    name: '',
    category: '',
    unidade_nativa: 'kg',
    unit_of_measure: '',
    peso_saco_kg: '',
    estoque_minimo_kg: '',
    stock_quantity: '',
    min_quantity: '',
    supplier: '',
    unit_price: '',
  })

  const fetchData = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('materials')
        .select('*, densidades_insumo(densidade_kg_m3, peso_unitario_kg)')
        .order('name')
      if (!error && data) {
        setMateriais(data)
      } else {
        setMateriais([])
      }
    } catch (err) {
      console.warn('[MateriaisList] Error fetching materials:', err)
      setMateriais([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const { data, error } = await supabase
      .from('materials')
      .insert({
        name: formData.name,
        category: formData.category,
        unidade_nativa: formData.unidade_nativa,
        unit_of_measure: formData.unidade_nativa,
        peso_saco_kg: formData.peso_saco_kg ? Number(formData.peso_saco_kg) : null,
        stock_quantity: Number(formData.stock_quantity),
        min_quantity: Number(formData.min_quantity),
        supplier: formData.supplier || null,
        unit_price: formData.unit_price ? Number(formData.unit_price) : null,
      })
      .select()
      .single()

    if (!error && data) {
      if (formData.densidade_kg_m3 || formData.peso_unitario_kg) {
        await supabase.from('densidades_insumo').insert({
          material_id: data.id,
          densidade_kg_m3: formData.densidade_kg_m3 ? Number(formData.densidade_kg_m3) : null,
          peso_unitario_kg: formData.peso_unitario_kg ? Number(formData.peso_unitario_kg) : null,
        })
      }
      toast({ title: 'Material cadastrado!' })
      setOpen(false)
      setFormData({
        name: '',
        category: '',
        unidade_nativa: 'kg',
        peso_saco_kg: '',
        densidade_kg_m3: '',
        peso_unitario_kg: '',
        stock_quantity: '',
        min_quantity: '',
        supplier: '',
        unit_price: '',
      })
      fetchData()
    } else {
      toast({ title: 'Erro', description: error?.message, variant: 'destructive' })
    }
  }

  const handleEditClick = (material: any) => {
    setEditFormData({
      id: material.id,
      name: material.name || '',
      category: material.category || '',
      unidade_nativa: material.unidade_nativa || 'kg',
      unit_of_measure: material.unit_of_measure || '',
      peso_saco_kg: material.peso_saco_kg?.toString() || '',
      estoque_minimo_kg: material.estoque_minimo_kg?.toString() || '',
      stock_quantity: material.stock_quantity?.toString() || '',
      min_quantity: material.min_quantity?.toString() || '',
      supplier: material.supplier || '',
      unit_price: material.unit_price?.toString() || '',
    })
    setEditOpen(true)
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    const { error } = await supabase
      .from('materials')
      .update({
        name: editFormData.name,
        category: editFormData.category,
        unidade_nativa: editFormData.unidade_nativa,
        unit_of_measure: editFormData.unit_of_measure || editFormData.unidade_nativa,
        peso_saco_kg: editFormData.peso_saco_kg ? Number(editFormData.peso_saco_kg) : null,
        estoque_minimo_kg: editFormData.estoque_minimo_kg
          ? Number(editFormData.estoque_minimo_kg)
          : null,
        stock_quantity: editFormData.stock_quantity ? Number(editFormData.stock_quantity) : null,
        min_quantity: editFormData.min_quantity ? Number(editFormData.min_quantity) : null,
        supplier: editFormData.supplier || null,
        unit_price: editFormData.unit_price ? Number(editFormData.unit_price) : null,
      })
      .eq('id', editFormData.id)

    if (!error) {
      toast({ title: 'Material atualizado com sucesso!' })
      setEditOpen(false)
      fetchData()
    } else {
      toast({ title: 'Erro', description: error?.message, variant: 'destructive' })
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja excluir este material?')) return
    await supabase.from('materials').delete().eq('id', id)
    toast({ title: 'Material excluído' })
    fetchData()
  }

  const filteredMaterials = materiais.filter((m) => {
    if (search && !m.name.toLowerCase().includes(search.toLowerCase())) return false
    if (tab === 'general' && m.work_id) return false
    if (tab === 'allocated' && !m.work_id) return false
    return true
  })

  if (loading) return <Skeleton className="h-64 w-full" />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Estoque e Materiais</h1>
          <p className="text-muted-foreground">Catálogo de insumos e conversões para KG.</p>
        </div>
        {view === 'estoque' && (
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
                  <Label>Unidade Nativa</Label>
                  <Select
                    value={formData.unidade_nativa}
                    onValueChange={(v) => setFormData({ ...formData, unidade_nativa: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kg">Quilograma (kg)</SelectItem>
                      <SelectItem value="m3">Metro Cúbico (m³)</SelectItem>
                      <SelectItem value="l">Litro (L)</SelectItem>
                      <SelectItem value="un">Unidade (un)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Peso Saco (kg)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.peso_saco_kg}
                    onChange={(e) => setFormData({ ...formData, peso_saco_kg: e.target.value })}
                    placeholder="Opcional"
                  />
                </div>
                {formData.unidade_nativa === 'm3' && (
                  <div className="space-y-2">
                    <Label>Densidade (kg/m³)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.densidade_kg_m3}
                      onChange={(e) =>
                        setFormData({ ...formData, densidade_kg_m3: e.target.value })
                      }
                    />
                  </div>
                )}
                {formData.unidade_nativa === 'un' && (
                  <div className="space-y-2">
                    <Label>Peso Unitário (kg)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.peso_unitario_kg}
                      onChange={(e) =>
                        setFormData({ ...formData, peso_unitario_kg: e.target.value })
                      }
                    />
                  </div>
                )}
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
        )}
      </div>

      <div className="inline-flex rounded-lg border bg-muted p-1">
        <Button
          type="button"
          size="sm"
          variant={view === 'estoque' ? 'default' : 'ghost'}
          className="h-8 text-xs"
          onClick={() => setView('estoque')}
        >
          Estoque
        </Button>
        <Button
          type="button"
          size="sm"
          variant={view === 'perdas' ? 'default' : 'ghost'}
          className="h-8 text-xs"
          onClick={() => setView('perdas')}
        >
          Controle de Perdas
        </Button>
      </div>

      {view === 'perdas' && <MaterialLossesPanel />}

      {view === 'estoque' && (
      <Tabs value={tab} onValueChange={setTab} className="w-full space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <TabsList>
            <TabsTrigger value="all">Todos</TabsTrigger>
            <TabsTrigger value="general">Catálogo Geral</TabsTrigger>
            <TabsTrigger value="allocated">Específicos de Obra</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Buscar material..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Material</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Unidade</TableHead>
                <TableHead className="text-right">Qtd Atual</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMaterials.map((item) => {
                const isLow = item.stock_quantity <= item.min_quantity
                const dens = Array.isArray(item.densidades_insumo)
                  ? item.densidades_insumo[0]
                  : item.densidades_insumo
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {item.name}
                      {item.peso_saco_kg && (
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          Saco: {item.peso_saco_kg}kg
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{item.category}</TableCell>
                    <TableCell>
                      {item.unidade_nativa || item.unit_of_measure}
                      {dens?.densidade_kg_m3 && (
                        <span className="block text-xs text-muted-foreground">
                          {dens.densidade_kg_m3} kg/m³
                        </span>
                      )}
                    </TableCell>
                    <TableCell
                      className={`text-right font-bold text-lg ${isLow ? 'text-red-600' : ''}`}
                    >
                      {item.stock_quantity}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.status === 'inactive' ? (
                        <Badge variant="outline">Inativo</Badge>
                      ) : isLow ? (
                        <Badge variant="destructive">Atenção</Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">
                          Normal
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-blue-600 hover:bg-blue-600/10"
                        onClick={() => handleEditClick(item)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() => handleDelete(item.id)}
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
              {filteredMaterials.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                    Nenhum material encontrado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Tabs>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Material</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4 mt-4 px-1">
            <div className="space-y-2">
              <Label>Nome do Material</Label>
              <Input
                required
                value={editFormData.name}
                onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Input
                  required
                  value={editFormData.category}
                  onChange={(e) => setEditFormData({ ...editFormData, category: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Unidade Nativa</Label>
                <Select
                  value={editFormData.unidade_nativa}
                  onValueChange={(v) => setEditFormData({ ...editFormData, unidade_nativa: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kg">Quilograma (kg)</SelectItem>
                    <SelectItem value="m3">Metro Cúbico (m³)</SelectItem>
                    <SelectItem value="l">Litro (L)</SelectItem>
                    <SelectItem value="un">Unidade (un)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Unidade de Medida</Label>
                <Input
                  value={editFormData.unit_of_measure}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, unit_of_measure: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Fornecedor</Label>
                <Input
                  value={editFormData.supplier}
                  onChange={(e) => setEditFormData({ ...editFormData, supplier: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Preço Unitário (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editFormData.unit_price}
                  onChange={(e) => setEditFormData({ ...editFormData, unit_price: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Peso Saco (kg)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editFormData.peso_saco_kg}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, peso_saco_kg: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Estoque Atual</Label>
                <Input
                  type="number"
                  required
                  step="0.01"
                  value={editFormData.stock_quantity}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, stock_quantity: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Estoque Mínimo</Label>
                <Input
                  type="number"
                  required
                  step="0.01"
                  value={editFormData.min_quantity}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, min_quantity: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Estoque Mínimo (kg)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editFormData.estoque_minimo_kg}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, estoque_minimo_kg: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Salvar</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
