import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/hooks/use-auth'
import { WorkService, CompositionHistory, ConsumptionTracking } from '@/types'

export default function ConsumptionDialog({
  workService,
  compositions,
  open,
  onOpenChange,
}: {
  workService: WorkService
  compositions: CompositionHistory[]
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const { toast } = useToast()
  // Financeiro só consulta: não lança consumo.
  const { readOnly } = useAuth()
  const [trackings, setTrackings] = useState<ConsumptionTracking[]>([])
  const [consumptions, setConsumptions] = useState<Record<string, string>>({})

  useEffect(() => {
    if (open) fetchTrackings()
  }, [open, workService.id])

  const fetchTrackings = async () => {
    const { data } = await supabase
      .from('consumption_tracking')
      .select('*')
      .eq('work_service_id', workService.id)
    if (data) setTrackings(data)
  }

  const handleSave = async (materialId: string) => {
    const val = consumptions[materialId]
    if (!val) return

    const { error } = await supabase.from('consumption_tracking').insert({
      work_service_id: workService.id,
      material_id: materialId,
      quantity_actual: Number(val),
      date: new Date().toISOString().split('T')[0],
    })

    if (!error) {
      toast({ title: 'Consumo registrado!' })
      setConsumptions({ ...consumptions, [materialId]: '' })
      fetchTrackings()
    } else {
      toast({ title: 'Erro ao registrar', variant: 'destructive' })
    }
  }

  if (readOnly) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Lançar Consumo: {workService.services?.name}</DialogTitle>
        </DialogHeader>

        <div className="mt-4 border rounded-md max-h-[500px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Insumo</TableHead>
                <TableHead className="text-right">Previsto</TableHead>
                <TableHead className="text-right">Consumido</TableHead>
                <TableHead>Novo Lançamento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {compositions.map((c) => {
                const rawQty =
                  workService.target_quantity * c.coefficient * (1 + c.waste_percentage / 100)
                const isCeil = ['un', 'sc', 'cx', 'lata', 'gl'].includes(
                  c.materials?.unit_of_measure?.toLowerCase() || '',
                )
                const previsto = isCeil ? Math.ceil(rawQty) : Number(rawQty.toFixed(2))

                const consumido = trackings
                  .filter((t) => t.material_id === c.material_id)
                  .reduce((acc, curr) => acc + curr.quantity_actual, 0)

                return (
                  <TableRow key={c.id}>
                    <TableCell>{c.materials?.name}</TableCell>
                    <TableCell className="text-right">
                      {previsto} {c.materials?.unit_of_measure}
                    </TableCell>
                    <TableCell className="text-right">
                      {consumido} {c.materials?.unit_of_measure}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          step="0.01"
                          className="w-24"
                          value={consumptions[c.material_id] || ''}
                          onChange={(e) =>
                            setConsumptions({ ...consumptions, [c.material_id]: e.target.value })
                          }
                        />
                        <Button size="sm" onClick={() => handleSave(c.material_id)}>
                          Ok
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  )
}
