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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Trash } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { Service, Composition, Material } from '@/types'
import { useData } from '@/hooks/use-data'

export default function CompositionsDialog({
  service,
  open,
  onOpenChange,
}: {
  service: Service
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [compositions, setCompositions] = useState<Composition[]>([])
  const { data: materials } = useData<Material>('materials')
  const { toast } = useToast()

  const [matId, setMatId] = useState('')
  const [coef, setCoeff] = useState('')
  const [waste, setWaste] = useState('')

  useEffect(() => {
    if (open) fetchComps()
  }, [open, service.id])

  const fetchComps = async () => {
    const { data } = await supabase
      .from('compositions')
      .select('*, materials(name, unidade_nativa, unit_of_measure)')
      .eq('service_id', service.id)
    if (data) setCompositions(data)
  }

  const handleAdd = async () => {
    if (!matId || !coef || !waste) return
    const { error } = await supabase.from('compositions').insert({
      service_id: service.id,
      material_id: matId,
      coefficient: Number(coef),
      waste_percentage: Number(waste),
    })
    if (!error) {
      setMatId('')
      setCoeff('')
      setWaste('')
      fetchComps()
      toast({ title: 'Adicionado à composição!' })
    } else {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' })
    }
  }

  const handleDel = async (id: string) => {
    await supabase.from('compositions').delete().eq('id', id)
    fetchComps()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Composições: {service.name}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-4 gap-2 items-end mt-4">
          <div className="col-span-2">
            <label className="text-xs font-medium">Insumo</label>
            <Select value={matId} onValueChange={setMatId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {materials.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name} ({m.unidade_nativa || m.unit_of_measure})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium">Coefic. / {service.unit}</label>
            <Input
              type="number"
              step="0.001"
              value={coef}
              onChange={(e) => setCoeff(e.target.value)}
            />
          </div>
          <div className="flex gap-2 items-center">
            <div className="flex-1">
              <label className="text-xs font-medium">Perda (%)</label>
              <Input type="number" value={waste} onChange={(e) => setWaste(e.target.value)} />
            </div>
            <Button onClick={handleAdd} className="mt-5">
              Add
            </Button>
          </div>
        </div>

        <div className="mt-6 border rounded-md max-h-[400px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Insumo</TableHead>
                <TableHead>Coeficiente</TableHead>
                <TableHead>Perda (%)</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {compositions.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    {c.materials?.name} (
                    {c.materials?.unidade_nativa || c.materials?.unit_of_measure})
                  </TableCell>
                  <TableCell>{c.coefficient}</TableCell>
                  <TableCell>{c.waste_percentage}%</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDel(c.id)}
                      className="text-destructive"
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {compositions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                    Nenhum insumo cadastrado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  )
}
