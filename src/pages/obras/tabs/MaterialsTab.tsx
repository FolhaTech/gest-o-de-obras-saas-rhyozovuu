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
import { Plus, Trash, Check, ChevronsUpDown, Pencil, Save, X, Info } from 'lucide-react'
import { CatalogSelectionDialog } from './CatalogSelectionDialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
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
  consumptionPerM2?: number
}

export default function MaterialsTab({ obraId }: { obraId: string }) {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<ConsolidateItem[]>([])
  const [allMaterials, setAllMaterials] = useState<any[]>([])
  const [catalogMaterials, setCatalogMaterials] = useState<any[]>([])
  const [totalArea, setTotalArea] = useState<number>(0)

  const [openAdd, setOpenAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editQty, setEditQty] = useState('')
  const [openCombo, setOpenCombo] = useState(false)
  const [selectedMaterial, setSelectedMaterial] = useState('')
  const [quantity, setQuantity] = useState('')
  const [notes, setNotes] = useState('')

  const { toast } = useToast()

  const fetchData = async () => {
    setLoading(true)
    try {
      const [
        { data: workData },
        { data: workServices },
        { data: extraMaterials },
        { data: materialsList },
        { data: catalogList },
      ] = await Promise.all([
        supabase.from('works').select('total_area').eq('id', obraId).single(),
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
            consumption_per_m2,
            materials (id, name, unit_of_measure, category)
          `)
          .eq('work_id', obraId),
        supabase
          .from('materials')
          .select('id, name, unit_of_measure, category')
          .eq('status', 'active'),
        supabase
          .from('materials')
          .select('id, name, unit_of_measure, category')
          .eq('status', 'active')
          .is('work_id', null),
      ])

      setTotalArea(workData?.total_area || 0)
      setAllMaterials(materialsList || [])
      setCatalogMaterials(catalogList || [])

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
            consumptionPerM2: extra.consumption_per_m2
              ? Number(extra.consumption_per_m2)
              : undefined,
          })
        }
        const item = consolidated.get(matId)!
        item.manualQty += qty
        item.totalQty += qty
        item.manualIds.push(extra.id)
        if (extra.consumption_per_m2 && item.consumptionPerM2 === undefined) {
          item.consumptionPerM2 = Number(extra.consumption_per_m2)
        }
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

    const consumption = Number(quantity) || 0
    const calculatedQty = totalArea > 0 && consumption > 0 ? consumption * totalArea : 1

    const { error } = await supabase.from('work_extra_materials').insert({
      work_id: obraId,
      material_id: selectedMaterial,
      quantity: calculatedQty,
      consumption_per_m2: consumption > 0 ? consumption : null,
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

  const handleSaveEditQty = async (materialId: string, currentIds: string[]) => {
    const consumption = Number(editQty)
    if (isNaN(consumption) || consumption < 0) return

    if (currentIds.length > 0) {
      await supabase.from('work_extra_materials').delete().in('id', currentIds)
    }

    if (consumption > 0) {
      const calculatedQty = totalArea > 0 ? consumption * totalArea : 1
      await supabase.from('work_extra_materials').insert({
        work_id: obraId,
        material_id: materialId,
        quantity: calculatedQty,
        consumption_per_m2: consumption,
        notes: 'Atualizado manualmente',
      })
    }

    setEditingId(null)
    toast({ title: 'Consumo atualizado com sucesso!' })
    fetchData()
  }

  if (loading) return <Skeleton className="h-48 w-full" />

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Materiais Alocados</h3>
        <div className="flex gap-2">
          <CatalogSelectionDialog
            obraId={obraId}
            totalArea={totalArea}
            catalogMaterials={catalogMaterials}
            existingMaterialIds={items
              .filter((i) => i.manualIds.length > 0)
              .map((i) => i.materialId)}
            onSuccess={fetchData}
          />
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
                  <Label className="flex items-center gap-2">
                    Consumo por m²
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild type="button">
                          <Info className="h-3 w-3 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="w-[200px] text-xs font-normal">
                            Coeficiente referenciado por normas técnicas (ex: NBR 12721).
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </Label>
                  <Input
                    type="number"
                    step="0.0001"
                    min="0"
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="0.00"
                  />
                  {totalArea > 0 && quantity && (
                    <p className="text-xs text-muted-foreground">
                      Quantidade total calculada: {(Number(quantity) * totalArea).toFixed(2)}
                    </p>
                  )}
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
      </div>

      {items.length === 0 ? (
        <p className="text-muted-foreground p-4 border rounded-md text-center">
          Nenhum material alocado para esta obra. Vincule materiais do catálogo ou adicione
          serviços.
        </p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Material</TableHead>
                <TableHead>Unidade</TableHead>
                <TableHead className="text-right">Qtd Calculada</TableHead>
                <TableHead className="text-right">Consumo/m²</TableHead>
                <TableHead className="text-right">Qtd Total Necessária</TableHead>
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
                    {editingId === item.materialId ? (
                      <Input
                        type="number"
                        step="0.0001"
                        min="0"
                        className="w-24 h-8 ml-auto text-right"
                        value={editQty}
                        onChange={(e) => setEditQty(e.target.value)}
                        autoFocus
                        placeholder="0.00"
                      />
                    ) : item.consumptionPerM2 !== undefined ? (
                      <div className="flex flex-col items-end">
                        <span>{item.consumptionPerM2}</span>
                        {totalArea > 0 && (
                          <span className="text-xs text-muted-foreground">(× {totalArea} m²)</span>
                        )}
                      </div>
                    ) : item.manualQty > 0 ? (
                      <span className="text-muted-foreground text-xs">Fixo</span>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {editingId === item.materialId
                      ? (
                          item.calculatedQty +
                          (totalArea > 0 && Number(editQty) > 0 ? Number(editQty) * totalArea : 1)
                        ).toFixed(2)
                      : item.totalQty.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      {item.calculatedQty > 0 && <Badge variant="outline">Calculado</Badge>}
                      {item.manualQty > 0 && <Badge variant="secondary">Vinculado</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      {editingId === item.materialId ? (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-100"
                            onClick={() => handleSaveEditQty(item.materialId, item.manualIds)}
                          >
                            <Save className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:bg-muted"
                            onClick={() => setEditingId(null)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        item.manualIds.length > 0 && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-100"
                              onClick={() => {
                                setEditingId(item.materialId)
                                setEditQty(
                                  item.consumptionPerM2 !== undefined
                                    ? item.consumptionPerM2.toString()
                                    : '0',
                                )
                              }}
                              title="Editar consumo por m²"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => handleDeleteManual(item.manualIds)}
                              title="Remover materiais vinculados"
                            >
                              <Trash className="h-4 w-4" />
                            </Button>
                          </>
                        )
                      )}
                    </div>
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
