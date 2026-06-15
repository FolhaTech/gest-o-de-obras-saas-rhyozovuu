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
import { Skeleton } from '@/components/ui/skeleton'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Plus, Trash, Check, ChevronsUpDown } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

type ConsolidateItem = {
  materialId: string
  name: string
  unit: string
  category: string
  calculatedQty: number
  manualQty: number
  totalQty: number
  manualIds: string[]
}

export default function MaterialsTab({ obraId }: { obraId: string }) {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<ConsolidateItem[]>([])
  const [allMaterials, setAllMaterials] = useState<any[]>([])

  const [openAdd, setOpenAdd] = useState(false)
  const [openCombo, setOpenCombo] = useState(false)
  const [selectedMaterial, setSelectedMaterial] = useState('')
  const [quantity, setQuantity] = useState('')
  const [notes, setNotes] = useState('')

  const { toast } = useToast()

  const fetchData = async () => {
    setLoading(true)
    try {
      const [{ data: workServices }, { data: extraMaterials }, { data: materialsList }] =
        await Promise.all([
          supabase
            .from('work_services')
            .select(`
            id,
            target_quantity,
            compositions_history (
              material_id,
              coefficient,
              waste_percentage,
              materials (id, name, unit_of_measure, category)
            )
          `)
            .eq('work_id', obraId),
          supabase
            .from('work_extra_materials')
            .select(`
            id,
            material_id,
            quantity,
            materials (id, name, unit_of_measure, category)
          `)
            .eq('work_id', obraId),
          supabase
            .from('materials')
            .select('id, name, unit_of_measure, category')
            .eq('status', 'active'),
        ])

      setAllMaterials(materialsList || [])

      const consolidated = new Map<string, ConsolidateItem>()

      workServices?.forEach((ws: any) => {
        ws.compositions_history?.forEach((comp: any) => {
          const mat = comp.materials || (Array.isArray(comp.materials) ? comp.materials[0] : null)
          if (!mat) return

          const matId = comp.material_id
          const reqQty =
            (ws.target_quantity || 0) *
            (comp.coefficient || 0) *
            (1 + (comp.waste_percentage || 0) / 100)

          if (!consolidated.has(matId)) {
            consolidated.set(matId, {
              materialId: matId,
              name: mat.name,
              unit: mat.unit_of_measure || '',
              category: mat.category || '',
              calculatedQty: 0,
              manualQty: 0,
              totalQty: 0,
              manualIds: [],
            })
          }
          const item = consolidated.get(matId)!
          item.calculatedQty += reqQty
          item.totalQty += reqQty
        })
      })

      extraMaterials?.forEach((extra: any) => {
        const mat = extra.materials || (Array.isArray(extra.materials) ? extra.materials[0] : null)
        if (!mat) return
        const matId = extra.material_id
        const qty = Number(extra.quantity) || 0

        if (!consolidated.has(matId)) {
          consolidated.set(matId, {
            materialId: matId,
            name: mat.name,
            unit: mat.unit_of_measure || '',
            category: mat.category || '',
            calculatedQty: 0,
            manualQty: 0,
            totalQty: 0,
            manualIds: [],
          })
        }
        const item = consolidated.get(matId)!
        item.manualQty += qty
        item.totalQty += qty
        item.manualIds.push(extra.id)
      })

      setItems(Array.from(consolidated.values()).sort((a, b) => a.name.localeCompare(b.name)))
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [obraId])

  const handleAddManual = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedMaterial || !quantity) return

    const { error } = await supabase.from('work_extra_materials').insert({
      work_id: obraId,
      material_id: selectedMaterial,
      quantity: Number(quantity),
      notes,
    })

    if (!error) {
      toast({ title: 'Material vinculado com sucesso!' })
      setOpenAdd(false)
      setSelectedMaterial('')
      setQuantity('')
      setNotes('')
      fetchData()
    } else {
      toast({ title: 'Erro ao vincular', description: error.message, variant: 'destructive' })
    }
  }

  const handleDeleteManual = async (ids: string[]) => {
    if (!ids.length) return
    if (!confirm('Deseja remover as adições vinculadas deste material?')) return

    const { error } = await supabase.from('work_extra_materials').delete().in('id', ids)
    if (!error) {
      toast({ title: 'Material vinculado removido!' })
      fetchData()
    } else {
      toast({ title: 'Erro ao remover', description: error.message, variant: 'destructive' })
    }
  }

  if (loading) return <Skeleton className="h-48 w-full" />

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Materiais Alocados Consolidados</h3>
        <Dialog open={openAdd} onOpenChange={setOpenAdd}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" /> Vincular Material
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Vincular Material à Obra</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddManual} className="space-y-4 mt-4">
              <div className="space-y-2 flex flex-col">
                <Label>Material</Label>
                <Popover open={openCombo} onOpenChange={setOpenCombo}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={openCombo}
                      className="justify-between font-normal"
                    >
                      {selectedMaterial
                        ? allMaterials.find((m) => m.id === selectedMaterial)?.name
                        : 'Buscar e selecionar material...'}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar material..." />
                      <CommandList>
                        <CommandEmpty>Nenhum material encontrado.</CommandEmpty>
                        <CommandGroup>
                          {allMaterials.map((m) => (
                            <CommandItem
                              key={m.id}
                              value={m.name}
                              onSelect={() => {
                                setSelectedMaterial(m.id)
                                setOpenCombo(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  'mr-2 h-4 w-4',
                                  selectedMaterial === m.id ? 'opacity-100' : 'opacity-0',
                                )}
                              />
                              {m.name} ({m.unit_of_measure})
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Quantidade</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Notas (Opcional)</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={!selectedMaterial}>
                Vincular
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {items.length === 0 ? (
        <p className="text-muted-foreground p-4 border rounded-md text-center">
          Nenhum material alocado para esta obra.
        </p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Material</TableHead>
                <TableHead>Unidade</TableHead>
                <TableHead className="text-right">Qtd Calculada</TableHead>
                <TableHead className="text-right">Qtd Manual</TableHead>
                <TableHead className="text-right">Qtd Total</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.materialId}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className="text-muted-foreground">{item.unit}</TableCell>
                  <TableCell className="text-right">
                    {item.calculatedQty > 0 ? item.calculatedQty.toFixed(2) : '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    {item.manualQty > 0 ? item.manualQty.toFixed(2) : '-'}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {item.totalQty.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      {item.calculatedQty > 0 && <Badge variant="outline">Calculado</Badge>}
                      {item.manualQty > 0 && <Badge variant="secondary">Vinculado</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    {item.manualIds.length > 0 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDeleteManual(item.manualIds)}
                        title="Remover materiais vinculados"
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
