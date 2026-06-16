import { useState, useEffect } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Plus, Edit2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type ConsolidateItem = {
  materialId: string
  name: string
  nativeUnit: string
  pesoSaco: number | null
  plannedKg: number
  actualKg: number
  extraKg: number
  stockKg: number
  servicesUsing: { wsId: string; name: string }[]
  extraMaterialId?: string
  extraConsumptionPerM2?: number | null
}

export default function MaterialsTab({ obraId, workArea }: { obraId: string; workArea?: number }) {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<ConsolidateItem[]>([])
  const [openConsume, setOpenConsume] = useState(false)
  const [consumeMat, setConsumeMat] = useState('')
  const [consumeWs, setConsumeWs] = useState('')
  const [consumeQty, setConsumeQty] = useState('')
  const [totalArea, setTotalArea] = useState(workArea || 0)
  const [openEdit, setOpenEdit] = useState(false)
  const [editingItem, setEditingItem] = useState<ConsolidateItem | null>(null)
  const [editConsumption, setEditConsumption] = useState('')
  const { toast } = useToast()

  const fetchData = async () => {
    setLoading(true)
    try {
      const [{ data: workServices }, { data: extraMaterials }] = await Promise.all([
        supabase
          .from('work_services')
          .select(`
          id, target_quantity, services (name, unit),
          compositions_history (
            material_id, coefficient, waste_percentage,
            materials (id, name, unidade_nativa, peso_saco_kg, unit_of_measure, stock_quantity, densidades_insumo (densidade_kg_m3, peso_unitario_kg))
          )
        `)
          .eq('work_id', obraId),
        supabase
          .from('work_extra_materials')
          .select(`
          id, material_id, quantity, consumption_per_m2,
          materials (id, name, unidade_nativa, peso_saco_kg, unit_of_measure, stock_quantity, densidades_insumo (densidade_kg_m3, peso_unitario_kg))
        `)
          .eq('work_id', obraId),
      ])

      setTotalArea(workArea || 0)

      const wsIds = workServices?.map((ws) => ws.id) || []
      const { data: consumptionData } = wsIds.length
        ? await supabase.from('consumption_tracking').select('*').in('work_service_id', wsIds)
        : { data: [] }

      const toKg = (qty: number, nativeUnit: string, dens?: number, weight?: number) => {
        if (!qty) return 0
        const u = (nativeUnit || '').toLowerCase()
        if (u === 'kg' || u === 'quilo' || u === 'kilograma') return qty
        if (u === 'm3' || u === 'm³') return qty * (dens || 1)
        if (u === 'l' || u === 'litro') return qty * ((dens || 1000) / 1000)
        if (u === 'un' || u === 'unidade') return qty * (weight || 1)
        return qty
      }

      const map = new Map<string, ConsolidateItem>()

      workServices?.forEach((ws) => {
        ws.compositions_history?.forEach((comp) => {
          const mat = Array.isArray(comp.materials) ? comp.materials[0] : comp.materials
          if (!mat) return
          const densInfo = Array.isArray(mat.densidades_insumo)
            ? mat.densidades_insumo[0]
            : mat.densidades_insumo
          const qtyNative =
            (ws.target_quantity || 0) *
            (comp.coefficient || 0) *
            (1 + (comp.waste_percentage || 0) / 100)
          const qtyKg = toKg(
            qtyNative,
            mat.unidade_nativa || mat.unit_of_measure,
            densInfo?.densidade_kg_m3,
            densInfo?.peso_unitario_kg,
          )

          const stockKg = toKg(
            Number(mat.stock_quantity) || 0,
            mat.unidade_nativa || mat.unit_of_measure,
            densInfo?.densidade_kg_m3,
            densInfo?.peso_unitario_kg,
          )

          if (!map.has(mat.id)) {
            map.set(mat.id, {
              materialId: mat.id,
              name: mat.name,
              nativeUnit: mat.unidade_nativa || mat.unit_of_measure || 'kg',
              pesoSaco: mat.peso_saco_kg,
              plannedKg: 0,
              actualKg: 0,
              extraKg: 0,
              stockKg: stockKg,
              servicesUsing: [],
            })
          }
          const item = map.get(mat.id)!
          item.plannedKg += qtyKg
          if (!item.servicesUsing.find((s) => s.wsId === ws.id)) {
            item.servicesUsing.push({
              wsId: ws.id,
              name: Array.isArray(ws.services)
                ? ws.services[0].name
                : ws.services?.name || 'Serviço',
            })
          }
        })
      })

      extraMaterials?.forEach((ex) => {
        const mat = Array.isArray(ex.materials) ? ex.materials[0] : ex.materials
        if (!mat) return
        const densInfo = Array.isArray(mat.densidades_insumo)
          ? mat.densidades_insumo[0]
          : mat.densidades_insumo
        const qtyNative = Number(ex.quantity) || 0
        const qtyKg = toKg(
          qtyNative,
          mat.unidade_nativa || mat.unit_of_measure,
          densInfo?.densidade_kg_m3,
          densInfo?.peso_unitario_kg,
        )

        const stockKg = toKg(
          Number(mat.stock_quantity) || 0,
          mat.unidade_nativa || mat.unit_of_measure,
          densInfo?.densidade_kg_m3,
          densInfo?.peso_unitario_kg,
        )

        if (!map.has(mat.id)) {
          map.set(mat.id, {
            materialId: mat.id,
            name: mat.name,
            nativeUnit: mat.unidade_nativa || mat.unit_of_measure || 'kg',
            pesoSaco: mat.peso_saco_kg,
            plannedKg: 0,
            actualKg: 0,
            extraKg: 0,
            stockKg: stockKg,
            servicesUsing: [],
          })
        }
        const item = map.get(mat.id)!
        item.extraKg += qtyKg
        item.extraMaterialId = ex.id
        item.extraConsumptionPerM2 = ex.consumption_per_m2
      })

      consumptionData?.forEach((c) => {
        if (map.has(c.material_id)) {
          map.get(c.material_id)!.actualKg += Number(c.quantity_actual) || 0
        }
      })

      setItems(Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name)))
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [obraId, workArea])

  const handleEditClick = (item: ConsolidateItem) => {
    setEditingItem(item)
    setEditConsumption(item.extraConsumptionPerM2 ? item.extraConsumptionPerM2.toString() : '0')
    setOpenEdit(true)
  }

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingItem) return

    const val = Number(editConsumption)
    if (editingItem.extraMaterialId) {
      const { error } = await supabase
        .from('work_extra_materials')
        .update({ consumption_per_m2: val, quantity: 0 })
        .eq('id', editingItem.extraMaterialId)

      if (error) {
        toast({ title: 'Erro', description: error.message, variant: 'destructive' })
        return
      }
    } else {
      const { error } = await supabase.from('work_extra_materials').insert({
        work_id: obraId,
        material_id: editingItem.materialId,
        consumption_per_m2: val,
        quantity: 0,
      })

      if (error) {
        toast({ title: 'Erro', description: error.message, variant: 'destructive' })
        return
      }
    }

    toast({ title: 'Consumo ajustado com sucesso!' })
    setOpenEdit(false)
    fetchData()
  }

  const handleConsume = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!consumeMat || !consumeWs || !consumeQty) return
    const { error } = await supabase.from('consumption_tracking').insert({
      work_service_id: consumeWs,
      material_id: consumeMat,
      quantity_actual: Number(consumeQty),
      date: new Date().toISOString().split('T')[0],
    })
    if (!error) {
      toast({ title: 'Consumo registrado!' })
      setOpenConsume(false)
      setConsumeMat('')
      setConsumeWs('')
      setConsumeQty('')
      fetchData()
    } else {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' })
    }
  }

  const selectedMatItem = items.find((i) => i.materialId === consumeMat)

  if (loading) return <Skeleton className="h-48 w-full" />

  return (
    <div className="space-y-4 animate-fade-in-up">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-medium">Gestão de Materiais (KG)</h3>
          <p className="text-sm text-muted-foreground">
            Cálculo convertido com base em área, coeficientes e densidades.
          </p>
        </div>

        <Dialog open={openEdit} onOpenChange={setOpenEdit}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ajustar Consumo Adicional por m²</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSaveEdit} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Material</Label>
                <div className="font-medium">{editingItem?.name}</div>
              </div>
              <div className="space-y-2">
                <Label>Consumo Adicional (Unidade: {editingItem?.nativeUnit}/m²)</Label>
                <Input
                  type="number"
                  step="0.0001"
                  required
                  value={editConsumption}
                  onChange={(e) => setEditConsumption(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Isto adicionará/ajustará a quantidade extra deste material para a obra com base na
                  área total ({totalArea} m²).
                </p>
              </div>
              <Button type="submit" className="w-full">
                Salvar
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={openConsume} onOpenChange={setOpenConsume}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" /> Lançar Consumo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Registrar Consumo Real (KG)</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleConsume} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Material</Label>
                <Select
                  value={consumeMat}
                  onValueChange={(v) => {
                    setConsumeMat(v)
                    setConsumeWs('')
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {items.map((i) => (
                      <SelectItem key={i.materialId} value={i.materialId}>
                        {i.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Serviço Vinculado</Label>
                <Select
                  value={consumeWs}
                  onValueChange={setConsumeWs}
                  disabled={!consumeMat || !selectedMatItem?.servicesUsing.length}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedMatItem?.servicesUsing.map((s) => (
                      <SelectItem key={s.wsId} value={s.wsId}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!selectedMatItem?.servicesUsing.length && consumeMat && (
                  <p className="text-xs text-muted-foreground text-destructive">
                    Nenhum serviço planejou este material.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Quantidade Consumida (KG)</Label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  value={consumeQty}
                  onChange={(e) => setConsumeQty(e.target.value)}
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={!consumeMat || !consumeWs || !consumeQty}
              >
                Registrar
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="shopping" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="shopping">Lista de Compras</TabsTrigger>
          <TabsTrigger value="consumption">Acompanhamento de Consumo</TabsTrigger>
        </TabsList>

        <TabsContent value="shopping">
          <div className="rounded-md border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Material</TableHead>
                  <TableHead className="text-right">Necessário p/ Serviços</TableHead>
                  <TableHead className="text-right">Necessário p/ Área (m²)</TableHead>
                  <TableHead className="text-right">Total Geral</TableHead>
                  <TableHead className="text-right">Sacos Comerciais</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const totalKg = item.plannedKg + item.extraKg
                  const bags = item.pesoSaco ? Math.ceil(totalKg / item.pesoSaco) : null
                  const needsStock = totalKg > item.stockKg
                  return (
                    <TableRow key={item.materialId}>
                      <TableCell className="font-medium max-w-[200px] truncate" title={item.name}>
                        {item.name}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.plannedKg.toLocaleString('pt-BR', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{' '}
                        kg
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex items-center justify-end gap-2">
                            <span>
                              {item.extraKg.toLocaleString('pt-BR', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}{' '}
                              kg
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => handleEditClick(item)}
                              title="Ajustar consumo extra por m²"
                            >
                              <Edit2 className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </div>
                          {item.extraConsumptionPerM2 !== null &&
                            item.extraConsumptionPerM2 !== undefined && (
                              <span className="text-xs text-muted-foreground">
                                (
                                {item.extraConsumptionPerM2.toLocaleString('pt-BR', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 4,
                                })}{' '}
                                {item.nativeUnit}/m²)
                              </span>
                            )}
                        </div>
                      </TableCell>
                      <TableCell
                        className={`text-right font-bold ${needsStock ? 'text-red-500' : ''}`}
                      >
                        {totalKg.toLocaleString('pt-BR', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{' '}
                        kg
                        {needsStock && (
                          <div className="text-xs font-normal mt-1 flex flex-col items-end">
                            <span className="text-red-500 font-medium">Estoque insuficiente</span>
                            <span className="text-muted-foreground">
                              Atual:{' '}
                              {item.stockKg.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}{' '}
                              kg
                            </span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {bags !== null ? `${bags} un (${item.pesoSaco}kg)` : '-'}
                      </TableCell>
                    </TableRow>
                  )
                })}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-4">
                      Nenhum material planejado.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="consumption">
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Material</TableHead>
                  <TableHead className="text-right">Planejado (KG)</TableHead>
                  <TableHead className="text-right">Realizado (KG)</TableHead>
                  <TableHead className="text-right">Desvio (%)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const planned = item.plannedKg + item.extraKg
                  const dev = planned > 0 ? ((item.actualKg - planned) / planned) * 100 : 0
                  const isOver = item.actualKg > planned
                  const needsStock = planned > item.stockKg

                  return (
                    <TableRow key={item.materialId}>
                      <TableCell className={`font-medium ${needsStock ? 'text-destructive' : ''}`}>
                        {item.name}
                      </TableCell>
                      <TableCell
                        className={`text-right ${needsStock ? 'text-destructive font-semibold' : ''}`}
                      >
                        {planned.toLocaleString('pt-BR', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{' '}
                        kg
                        {needsStock && (
                          <div className="text-xs font-normal">
                            Estoque atual:{' '}
                            {item.stockKg.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {item.actualKg.toLocaleString('pt-BR', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{' '}
                        kg
                      </TableCell>
                      <TableCell
                        className={`text-right ${isOver ? 'text-destructive font-bold' : 'text-emerald-600'}`}
                      >
                        {item.actualKg > 0 ? `${dev > 0 ? '+' : ''}${dev.toFixed(1)}%` : '-'}
                      </TableCell>
                    </TableRow>
                  )
                })}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-4">
                      Nenhum material planejado.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
