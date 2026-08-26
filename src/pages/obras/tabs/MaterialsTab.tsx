import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Plus, Edit2, Database, RefreshCw, WifiOff } from 'lucide-react'
import { isMissingTableError, isNetworkOrFetchError } from '@/hooks/use-data'
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
  areaKg: number
  actualKg: number
  stockKg: number
  servicesUsing: { wsId: string; name: string }[]
  extraMaterialId?: string
  extraConsumptionPerM2?: number | null
}

export default function MaterialsTab({ obraId, workArea }: { obraId: string; workArea?: number }) {
  const [loading, setLoading] = useState(true)
  const [isTableMissing, setIsTableMissing] = useState(false)
  const [isNetworkError, setIsNetworkError] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [rawData, setRawData] = useState<{
    workServices: any[]
    extraMaterials: any[]
    consumptionData: any[]
  } | null>(null)

  const [openConsume, setOpenConsume] = useState(false)
  const [consumeMat, setConsumeMat] = useState('')
  const [consumeWs, setConsumeWs] = useState('')
  const [consumeQty, setConsumeQty] = useState('')
  const [openEdit, setOpenEdit] = useState(false)
  const [editingItem, setEditingItem] = useState<ConsolidateItem | null>(null)
  const [editConsumption, setEditConsumption] = useState('')
  const { toast } = useToast()

  const fetchData = useCallback(async () => {
    setLoading(true)
    setErrorMsg(null)
    setIsTableMissing(false)
    setIsNetworkError(false)
    try {
      const [wsRes, exRes] = await Promise.all([
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

      if (wsRes.error || exRes.error) {
        const anyErr = wsRes.error || exRes.error
        console.warn('[MaterialsTab] Supabase error:', anyErr)
        if (isMissingTableError(anyErr)) {
          setIsTableMissing(true)
        } else if (isNetworkOrFetchError(anyErr)) {
          setIsNetworkError(true)
        } else {
          setErrorMsg(anyErr?.message || 'Erro ao carregar materiais')
        }
      }

      const workServices = wsRes.data || []
      const extraMaterials = exRes.data || []

      const wsIds = workServices.map((ws) => ws.id) || []
      let consumptionData: any[] = []
      if (wsIds.length > 0) {
        const { data: cData, error: cErr } = await supabase
          .from('consumption_tracking')
          .select('*')
          .in('work_service_id', wsIds)
        if (!cErr && cData) {
          consumptionData = cData
        }
      }

      setRawData({
        workServices,
        extraMaterials,
        consumptionData,
      })
    } catch (e: any) {
      console.warn('[MaterialsTab] Exception fetching:', e)
      if (isMissingTableError(e)) {
        setIsTableMissing(true)
      } else if (isNetworkOrFetchError(e)) {
        setIsNetworkError(true)
      } else {
        setErrorMsg(e?.message || 'Falha ao carregar materiais')
      }
      setRawData({
        workServices: [],
        extraMaterials: [],
        consumptionData: [],
      })
    } finally {
      setLoading(false)
    }
  }, [obraId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const items = useMemo(() => {
    if (!rawData) return []

    const totalArea = workArea || 0

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

    rawData.workServices.forEach((ws) => {
      ws.compositions_history?.forEach((comp: any) => {
        const mat = Array.isArray(comp.materials) ? comp.materials[0] : comp.materials
        if (!mat) return
        const densInfo = Array.isArray(mat.densidades_insumo)
          ? mat.densidades_insumo[0]
          : mat.densidades_insumo

        const qtyNativeService =
          (ws.target_quantity || 0) *
          (comp.coefficient || 0) *
          (1 + (comp.waste_percentage || 0) / 100)

        const qtyNativeArea =
          totalArea * (comp.coefficient || 0) * (1 + (comp.waste_percentage || 0) / 100)

        const qtyKgService = toKg(
          qtyNativeService,
          mat.unidade_nativa || mat.unit_of_measure,
          densInfo?.densidade_kg_m3,
          densInfo?.peso_unitario_kg,
        )

        const qtyKgArea = toKg(
          qtyNativeArea,
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
            areaKg: 0,
            actualKg: 0,
            stockKg: stockKg,
            servicesUsing: [],
          })
        }
        const item = map.get(mat.id)!
        item.plannedKg += qtyKgService
        item.areaKg += qtyKgArea

        if (!item.servicesUsing.find((s) => s.wsId === ws.id)) {
          item.servicesUsing.push({
            wsId: ws.id,
            name: Array.isArray(ws.services) ? ws.services[0].name : ws.services?.name || 'Serviço',
          })
        }
      })
    })

    rawData.extraMaterials.forEach((ex) => {
      const mat = Array.isArray(ex.materials) ? ex.materials[0] : ex.materials
      if (!mat) return
      const densInfo = Array.isArray(mat.densidades_insumo)
        ? mat.densidades_insumo[0]
        : mat.densidades_insumo

      const qtyNativeArea = totalArea * (Number(ex.consumption_per_m2) || 0)

      const qtyKgArea = toKg(
        qtyNativeArea,
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
          areaKg: 0,
          actualKg: 0,
          stockKg: stockKg,
          servicesUsing: [],
        })
      }
      const item = map.get(mat.id)!
      item.areaKg += qtyKgArea
      item.extraMaterialId = ex.id
      item.extraConsumptionPerM2 = ex.consumption_per_m2
    })

    rawData.consumptionData.forEach((c) => {
      if (map.has(c.material_id)) {
        map.get(c.material_id)!.actualKg += Number(c.quantity_actual) || 0
      }
    })

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [rawData, workArea])

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

  if (loading && !rawData) return <Skeleton className="h-48 w-full" />

  return (
    <div className="space-y-4 animate-fade-in-up">
      {isTableMissing && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900">
          <Database className="h-5 w-5 text-amber-600" />
          <AlertTitle className="font-semibold text-amber-900">
            Tabelas de materiais ainda não inicializadas no Supabase
          </AlertTitle>
          <AlertDescription className="text-amber-800 text-sm mt-1">
            As tabelas de materiais (
            <code className="font-mono">materials, work_services, consumption_tracking</code>) ainda
            não foram criadas no banco de dados. Execute o script SQL no Supabase para habilitar o
            controle de insumos.
            <div className="mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchData}
                className="gap-2 border-amber-300 bg-white hover:bg-amber-100 text-amber-900"
              >
                <RefreshCw className="h-4 w-4" /> Recarregar
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {isNetworkError && !isTableMissing && (
        <Alert variant="destructive">
          <WifiOff className="h-5 w-5" />
          <AlertTitle className="font-semibold">Erro de conexão</AlertTitle>
          <AlertDescription className="text-sm mt-1">
            Não foi possível carregar os materiais. Verifique sua conexão com o Supabase.
            <div className="mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchData}
                className="gap-2 bg-white text-destructive hover:bg-red-50"
              >
                <RefreshCw className="h-4 w-4" /> Tentar Novamente
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
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
                  área total ({workArea || 0} m²).
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
                  <TableHead className="text-right">Consumo por Serviço</TableHead>
                  <TableHead className="text-right">Necessário p/ Área (m²)</TableHead>
                  <TableHead className="text-right">Total Geral</TableHead>
                  <TableHead className="text-right">Sacos Comerciais</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const totalKg = item.plannedKg + item.areaKg
                  const bags = item.pesoSaco ? Math.ceil(totalKg / item.pesoSaco) : null
                  const needsStockArea = item.areaKg > item.stockKg
                  return (
                    <TableRow
                      key={item.materialId}
                      className={needsStockArea ? 'text-red-500' : ''}
                    >
                      <TableCell
                        className={`font-medium max-w-[200px] truncate ${needsStockArea ? 'text-red-500' : ''}`}
                        title={item.name}
                      >
                        {item.name}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.plannedKg.toLocaleString('pt-BR', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{' '}
                        kg
                      </TableCell>
                      <TableCell
                        className={`text-right ${needsStockArea ? 'text-red-500 font-bold' : ''}`}
                      >
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex items-center justify-end gap-2">
                            <span>
                              {item.areaKg.toLocaleString('pt-BR', {
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
                          {needsStockArea && (
                            <div className="text-xs font-normal mt-1 flex flex-col items-end">
                              <span className="text-red-500 font-medium">Estoque insuficiente</span>
                              <span className="text-muted-foreground">
                                Atual:{' '}
                                {item.stockKg.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}{' '}
                                kg
                              </span>
                            </div>
                          )}
                          {item.extraConsumptionPerM2 !== null &&
                            item.extraConsumptionPerM2 !== undefined && (
                              <span className="text-xs text-muted-foreground">
                                Extra: (
                                {item.extraConsumptionPerM2.toLocaleString('pt-BR', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 4,
                                })}{' '}
                                {item.nativeUnit}/m²)
                              </span>
                            )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {totalKg.toLocaleString('pt-BR', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{' '}
                        kg
                      </TableCell>
                      <TableCell
                        className={`text-right ${needsStockArea ? 'text-red-500/70' : 'text-muted-foreground'}`}
                      >
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
                  const planned = item.plannedKg + item.areaKg
                  const dev = planned > 0 ? ((item.actualKg - planned) / planned) * 100 : 0
                  const isOver = item.actualKg > planned
                  const needsStockArea = item.areaKg > item.stockKg

                  return (
                    <TableRow
                      key={item.materialId}
                      className={needsStockArea ? 'text-red-500' : ''}
                    >
                      <TableCell className={`font-medium ${needsStockArea ? 'text-red-500' : ''}`}>
                        {item.name}
                      </TableCell>
                      <TableCell
                        className={`text-right ${needsStockArea ? 'text-red-500 font-semibold' : ''}`}
                      >
                        {planned.toLocaleString('pt-BR', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{' '}
                        kg
                        {needsStockArea && (
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
                        className={`text-right ${isOver ? 'text-red-600 font-bold' : 'text-emerald-600'}`}
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
