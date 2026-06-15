import { useState } from 'react'
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
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Settings } from 'lucide-react'
import { useData } from '@/hooks/use-data'
import { Service } from '@/types'
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
import CompositionsDialog from './CompositionsDialog'

export default function ServicesTab() {
  const { data: services, loading, refetch } = useData<Service>('services')
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('')

  const [selectedService, setSelectedService] = useState<Service | null>(null)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const { error } = await supabase.from('services').insert({ name, unit })
    if (!error) {
      toast({ title: 'Serviço cadastrado!' })
      setOpen(false)
      setName('')
      setUnit('')
      refetch()
    } else {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' })
    }
  }

  if (loading) return <Skeleton className="h-64 w-full" />

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Catálogo de Serviços</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> Novo Serviço
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cadastrar Serviço</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input required value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Unidade de Medida</Label>
                <Input
                  required
                  placeholder="Ex: m2, m3, un"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full">
                Salvar
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
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {services.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>{s.unit}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2"
                    onClick={() => setSelectedService(s)}
                  >
                    <Settings className="h-4 w-4" /> Composições
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {services.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-4 text-muted-foreground">
                  Nenhum serviço cadastrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {selectedService && (
        <CompositionsDialog
          service={selectedService}
          open={!!selectedService}
          onOpenChange={(v) => !v && setSelectedService(null)}
        />
      )}
    </div>
  )
}
