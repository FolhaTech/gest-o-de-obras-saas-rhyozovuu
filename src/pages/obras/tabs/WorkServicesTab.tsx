import { useState, useEffect } from 'react'
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
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { Trash, Plus } from 'lucide-react'

export default function WorkServicesTab({ obraId }: { obraId: string }) {
  const [services, setServices] = useState<any[]>([])
  const [catalog, setCatalog] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  const [open, setOpen] = useState(false)
  const [selectedService, setSelectedService] = useState('')
  const [quantity, setQuantity] = useState('')

  const fetchData = async () => {
    setLoading(true)
    const [wsRes, catRes] = await Promise.all([
      supabase.from('work_services').select('*, services(name, unit)').eq('work_id', obraId),
      supabase.from('services').select('*'),
    ])
    setServices(wsRes.data || [])
    setCatalog(catRes.data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [obraId])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedService || !quantity) return
    const { error } = await supabase.from('work_services').insert({
      work_id: obraId,
      service_id: selectedService,
      target_quantity: Number(quantity),
      status: 'planned',
    })
    if (!error) {
      toast({ title: 'Serviço adicionado à obra!' })
      setOpen(false)
      setSelectedService('')
      setQuantity('')
      fetchData()
    } else {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' })
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja remover este serviço? O histórico de materiais dele também será apagado.'))
      return
    await supabase.from('work_services').delete().eq('id', id)
    fetchData()
  }

  return (
    <div className="space-y-4 animate-fade-in-up">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Serviços Planejados</h3>
          <p className="text-sm text-muted-foreground">
            Adicione serviços para calcular automaticamente as receitas de insumos.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" /> Lançar Serviço
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Serviço</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Serviço (Catálogo)</Label>
                <Select value={selectedService} onValueChange={setSelectedService}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o serviço..." />
                  </SelectTrigger>
                  <SelectContent>
                    {catalog.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} ({c.unit})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Quantidade Planejada</Label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full">
                Adicionar Serviço
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
              <TableHead>Unidade</TableHead>
              <TableHead className="text-right">Qtd Planejada</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="w-[80px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {services.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.services?.name}</TableCell>
                <TableCell>{s.services?.unit}</TableCell>
                <TableCell className="text-right">{s.target_quantity}</TableCell>
                <TableCell className="text-center">{s.status}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => handleDelete(s.id)}
                  >
                    <Trash className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {services.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-4 text-muted-foreground">
                  Nenhum serviço lançado nesta obra.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
