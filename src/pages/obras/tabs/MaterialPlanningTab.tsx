import { useEffect, useState, useMemo } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus, Trash, ClipboardEdit, Pencil, List } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { Service, WorkService, CompositionHistory, Material } from '@/types'
import { useData } from '@/hooks/use-data'
import ConsumptionDialog from './ConsumptionDialog'

export default function MaterialPlanningTab({
  obraId,
  obraArea = 0,
}: {
  obraId: string
  obraArea?: number
}) {
  const { data: services } = useData<Service>('services')
  const { data: materials } = useData<Material>('materials')
  const { toast } = useToast()

  const [workServices, setWorkServices] = useState<WorkService[]>([])
  const [compositionsHistory, setCompositionsHistory] = useState<CompositionHistory[]>([])
  const [open, setOpen] = useState(false)

  const [serviceId, setServiceId] = useState('')
  const [targetQty, setTargetQty] = useState('')
  const [manualItems, setManualItems] = useState<
    { material_id: string; coefficient: string; waste_percentage: string }[]
  >([])

  const [trackWs, setTrackWs] = useState<WorkService | null>(null)

  // Edit state
  const [editWs, setEditWs] = useState<WorkService | null>(null)
  const [editQty, setEditQty] = useState('')

  // Breakdown state
  const [breakdownWs, setBreakdownWs] = useState<WorkService | null>(null)

  const fetchWorkServices = async () => {
    const { data: wsData } = await supabase
      .from('work_services')
      .select('*, services(name, unit)')
      .eq('work_id', obraId)
    if (wsData) {
      setWorkServices(wsData)
      if (wsData.length > 0) {
        const wsIds = wsData.map((ws) => ws.id)
        const { data: compData } = await supabase
          .from('compositions_history')
          .select('*, materials(id, name, unit_of_measure)')
          .in('work_service_id', wsIds)
        if (compData) setCompositionsHistory(compData)
      } else {
        setCompositionsHistory([])
      }
    }
  }

  useEffect(() => {
    fetchWorkServices()
  }, [obraId])

  const handleLinkService = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!serviceId || !targetQty) return

    const validManualItems = manualItems.filter((item) => item.material_id && item.coefficient)

    const { data: newWs, error } = await supabase
      .from('work_services')
      .insert({
        work_id: obraId,
        service_id: serviceId,
        target_quantity: Number(targetQty),
      })
      .select()
      .single()

    if (!error && newWs) {
      if (validManualItems.length > 0) {
        const manualInserts = validManualItems.map((item) => ({
          work_service_id: newWs.id,
          material_id: item.material_id,
          coefficient: Number(item.coefficient),
          waste_percentage: Number(item.waste_percentage) || 0,
        }))
        await supabase.from('compositions_history').insert(manualInserts)
      }

      toast({ title: 'Adicionado com sucesso!' })
      setOpen(false)
      setServiceId('')
      setTargetQty('')
      setManualItems([])
      fetchWorkServices()
    } else {
      toast({ title: 'Erro ao adicionar serviço', variant: 'destructive' })
    }
  }

  const handleEditQty = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editWs || !editQty) return
    const { error } = await supabase
      .from('work_services')
      .update({ target_quantity: Number(editQty) })
      .eq('id', editWs.id)
    if (!error) {
      toast({ title: 'Quantidade atualizada com sucesso!' })
      setEditWs(null)
      setEditQty('')
      fetchWorkServices()
    }
  }

  const handleDel = async (id: string) => {
    await supabase.from('work_services').delete().eq('id', id)
    fetchWorkServices()
  }

  const calculateMaterialQuantity = (comp: CompositionHistory, targetQuantity: number) => {
    const rawQty = targetQuantity * comp.coefficient * (1 + comp.waste_percentage / 100)
    const unit = comp.materials?.unit_of_measure?.toLowerCase() || ''
    const isWhole = ['un', 'sc', 'cx', 'lata', 'gl'].includes(unit)
    return isWhole ? Math.round(rawQty) : Number(rawQty.toFixed(2))
  }

  const shoppingList = useMemo(() => {
    const list: Record<string, { name: string; unit: string; qty: number }> = {}
    compositionsHistory.forEach((comp) => {
      const ws = workServices.find((w) => w.id === comp.work_service_id)
      if (!ws || !comp.materials) return

      const finalQty = calculateMaterialQuantity(comp, ws.target_quantity)
      const matId = comp.material_id

      if (!list[matId]) {
        list[matId] = {
          name: comp.materials.name,
          unit: comp.materials.unit_of_measure || '',
          qty: 0,
        }
      }
      list[matId].qty += finalQty
    })
    return Object.values(list).sort((a, b) => a.name.localeCompare(b.name))
  }, [workServices, compositionsHistory])

  const getBreakdown = (ws: WorkService) => {
    return compositionsHistory
      .filter((c) => c.work_service_id === ws.id)
      .map((c) => ({
        name: c.materials?.name || '',
        unit: c.materials?.unit_of_measure || '',
        qty: calculateMaterialQuantity(c, ws.target_quantity),
        coef: c.coefficient,
        waste: c.waste_percentage,
      }))
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="services">
        <TabsList className="mb-4">
          <TabsTrigger value="services">Serviços Planejados</TabsTrigger>
          <TabsTrigger value="shopping">Lista de Compras (Materiais Totais)</TabsTrigger>
        </TabsList>

        <TabsContent value="services" className="space-y-4">
          <div className="flex justify-end">
            <Dialog
              open={open}
              onOpenChange={(v) => {
                setOpen(v)
                if (!v) setManualItems([])
              }}
            >
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" /> Adicionar Serviço
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Vincular Serviço à Obra</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleLinkService} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Serviço Base</Label>
                    <Select value={serviceId} onValueChange={setServiceId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um serviço..." />
                      </SelectTrigger>
                      <SelectContent>
                        {services.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name} ({s.unit})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Quantidade Alvo (Área/Volume/Unid.)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      required
                      value={targetQty}
                      onChange={(e) => setTargetQty(e.target.value)}
                    />
                  </div>

                  <div className="space-y-3 pt-2 border-t">
                    <div className="flex items-center justify-between">
                      <Label>Itens Manuais Adicionais (Opcional)</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setManualItems([
                            ...manualItems,
                            { material_id: '', coefficient: '', waste_percentage: '' },
                          ])
                        }
                      >
                        <Plus className="h-3 w-3 mr-1" /> Adicionar
                      </Button>
                    </div>
                    {manualItems.length > 0 && (
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {manualItems.map((item, index) => (
                          <div
                            key={index}
                            className="flex items-end gap-2 border p-2 rounded-md bg-muted/30"
                          >
                            <div className="space-y-1 flex-1">
                              <Label className="text-xs">Material</Label>
                              <Select
                                value={item.material_id}
                                onValueChange={(val) => {
                                  const newItems = [...manualItems]
                                  newItems[index].material_id = val
                                  setManualItems(newItems)
                                }}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="Selecione..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {materials.map((m) => (
                                    <SelectItem key={m.id} value={m.id}>
                                      {m.name} ({m.unit_of_measure})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1 w-20">
                              <Label className="text-xs">Coef.</Label>
                              <Input
                                type="number"
                                step="0.0001"
                                className="h-8 text-xs px-2"
                                value={item.coefficient}
                                onChange={(e) => {
                                  const newItems = [...manualItems]
                                  newItems[index].coefficient = e.target.value
                                  setManualItems(newItems)
                                }}
                              />
                            </div>
                            <div className="space-y-1 w-16">
                              <Label className="text-xs">Perda %</Label>
                              <Input
                                type="number"
                                step="0.1"
                                className="h-8 text-xs px-2"
                                value={item.waste_percentage}
                                onChange={(e) => {
                                  const newItems = [...manualItems]
                                  newItems[index].waste_percentage = e.target.value
                                  setManualItems(newItems)
                                }}
                              />
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() => {
                                const newItems = [...manualItems]
                                newItems.splice(index, 1)
                                setManualItems(newItems)
                              }}
                            >
                              <Trash className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <Button type="submit" className="w-full">
                    Adicionar
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Serviço</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workServices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      Nenhum serviço vinculado a esta obra.
                    </TableCell>
                  </TableRow>
                ) : (
                  workServices.map((ws) => (
                    <TableRow key={ws.id}>
                      <TableCell className="font-medium">{ws.services?.name}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {ws.target_quantity}
                      </TableCell>
                      <TableCell>{ws.services?.unit}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Editar Quantidade"
                          onClick={() => {
                            setEditWs(ws)
                            setEditQty(ws.target_quantity.toString())
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Ver Materiais (Composição)"
                          onClick={() => setBreakdownWs(ws)}
                        >
                          <List className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Acompanhar Consumo"
                          onClick={() => setTrackWs(ws)}
                        >
                          <ClipboardEdit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          title="Remover Serviço"
                          onClick={() => handleDel(ws.id)}
                        >
                          <Trash className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="shopping">
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Material / Insumo</TableHead>
                  <TableHead className="text-right">Quantidade Total Necessária</TableHead>
                  <TableHead>Unidade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shoppingList.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                      Nenhum material necessário (adicione serviços com composições).
                    </TableCell>
                  </TableRow>
                ) : (
                  shoppingList.map((item, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="text-right font-bold">
                        {item.qty.toLocaleString('pt-BR')}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{item.unit}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Quantity Dialog */}
      <Dialog open={!!editWs} onOpenChange={(v) => !v && setEditWs(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Quantidade Alvo</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditQty} className="space-y-4">
            <div className="space-y-2">
              <Label>Serviço</Label>
              <Input value={editWs?.services?.name || ''} disabled />
            </div>
            <div className="space-y-2">
              <Label>Nova Quantidade ({editWs?.services?.unit})</Label>
              <Input
                type="number"
                step="0.01"
                required
                value={editQty}
                onChange={(e) => setEditQty(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full">
              Salvar Alteração
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Breakdown Dialog */}
      <Dialog open={!!breakdownWs} onOpenChange={(v) => !v && setBreakdownWs(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Materiais Necessários: {breakdownWs?.services?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Quantidade Alvo:{' '}
              <span className="font-bold text-foreground">
                {breakdownWs?.target_quantity} {breakdownWs?.services?.unit}
              </span>
            </div>
            <div className="rounded-md border bg-card max-h-[60vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead className="text-right">
                      Coef. (p/ {breakdownWs?.services?.unit})
                    </TableHead>
                    <TableHead className="text-right">Perda (%)</TableHead>
                    <TableHead className="text-right">Qtd. Total</TableHead>
                    <TableHead>Unid.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {breakdownWs &&
                    getBreakdown(breakdownWs).map((item, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className="text-right">{item.coef}</TableCell>
                        <TableCell className="text-right">{item.waste}%</TableCell>
                        <TableCell className="text-right font-bold">
                          {item.qty.toLocaleString('pt-BR')}
                        </TableCell>
                        <TableCell>{item.unit}</TableCell>
                      </TableRow>
                    ))}
                  {breakdownWs && getBreakdown(breakdownWs).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-4 text-muted-foreground">
                        Nenhuma composição encontrada para este serviço.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {trackWs && (
        <ConsumptionDialog
          workService={trackWs}
          compositions={compositionsHistory.filter((c) => c.work_service_id === trackWs.id)}
          open={!!trackWs}
          onOpenChange={(v) => !v && setTrackWs(null)}
        />
      )}
    </div>
  )
}
