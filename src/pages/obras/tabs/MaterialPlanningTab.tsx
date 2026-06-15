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
import { Plus, Trash, ClipboardEdit } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { Service, WorkService, CompositionHistory } from '@/types'
import { useData } from '@/hooks/use-data'
import ConsumptionDialog from './ConsumptionDialog'

export default function MaterialPlanningTab({ obraId }: { obraId: string }) {
  const { data: services } = useData<Service>('services')
  const { toast } = useToast()

  const [workServices, setWorkServices] = useState<WorkService[]>([])
  const [compositionsHistory, setCompositionsHistory] = useState<CompositionHistory[]>([])
  const [open, setOpen] = useState(false)

  const [serviceId, setServiceId] = useState('')
  const [targetQty, setTargetQty] = useState('')
  const [trackWs, setTrackWs] = useState<WorkService | null>(null)

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
    const { error } = await supabase.from('work_services').insert({
      work_id: obraId,
      service_id: serviceId,
      target_quantity: Number(targetQty),
    })
    if (!error) {
      toast({ title: 'Adicionado com sucesso!' })
      setOpen(false)
      fetchWorkServices()
    }
  }

  const handleDel = async (id: string) => {
    await supabase.from('work_services').delete().eq('id', id)
    fetchWorkServices()
  }

  const shoppingList = useMemo(() => {
    const list: Record<string, { name: string; unit: string; qty: number }> = {}
    compositionsHistory.forEach((comp) => {
      const ws = workServices.find((w) => w.id === comp.work_service_id)
      if (!ws || !comp.materials) return
      const rawQty = ws.target_quantity * comp.coefficient * (1 + comp.waste_percentage / 100)
      const unit = comp.materials.unit_of_measure?.toLowerCase() || ''
      const finalQty = ['un', 'sc', 'cx', 'lata', 'gl'].includes(unit)
        ? Math.ceil(rawQty)
        : Number(rawQty.toFixed(2))
      const matId = comp.material_id
      if (!list[matId])
        list[matId] = {
          name: comp.materials.name,
          unit: comp.materials.unit_of_measure || '',
          qty: 0,
        }
      list[matId].qty += finalQty
    })
    return Object.values(list)
  }, [workServices, compositionsHistory])

  return (
    <div className="space-y-6">
      <Tabs defaultValue="services">
        <TabsList className="mb-4">
          <TabsTrigger value="services">Serviços Planejados</TabsTrigger>
          <TabsTrigger value="shopping">Lista de Compras</TabsTrigger>
        </TabsList>

        <TabsContent value="services" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={open} onOpenChange={setOpen}>
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
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        {services.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Quantidade Alvo</Label>
                    <Input
                      type="number"
                      step="0.01"
                      required
                      value={targetQty}
                      onChange={(e) => setTargetQty(e.target.value)}
                    />
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
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workServices.map((ws) => (
                  <TableRow key={ws.id}>
                    <TableCell className="font-medium">{ws.services?.name}</TableCell>
                    <TableCell className="text-right font-semibold">{ws.target_quantity}</TableCell>
                    <TableCell>{ws.services?.unit}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => setTrackWs(ws)}>
                        <ClipboardEdit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => handleDel(ws.id)}
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
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
                  <TableHead className="text-right">Quantidade Necessária</TableHead>
                  <TableHead>Unidade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shoppingList.map((item, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-right font-bold">
                      {item.qty.toLocaleString('pt-BR')}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{item.unit}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

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
