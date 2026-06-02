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
import { Plus, Filter } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/formatters'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useData } from '@/hooks/use-data'
import { Despesa, Obra } from '@/types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'

export default function DespesasList() {
  const { data: despesas, loading, refetch } = useData<Despesa>('expenses', '*, works(name)')
  const { data: works } = useData<Obra>('works', 'id, name')
  const { toast } = useToast()

  const [open, setOpen] = useState(false)
  const [formData, setFormData] = useState({
    work_id: '',
    description: '',
    category: 'Materiais',
    value: '',
    date: new Date().toISOString().split('T')[0],
  })

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const { error } = await supabase.from('expenses').insert({
      work_id: formData.work_id === 'none' ? null : formData.work_id,
      description: formData.description,
      category: formData.category,
      value: Number(formData.value),
      date: formData.date,
    })

    if (!error) {
      toast({ title: 'Despesa registrada!' })
      setOpen(false)
      setFormData({
        work_id: '',
        description: '',
        category: 'Materiais',
        value: '',
        date: new Date().toISOString().split('T')[0],
      })
      refetch()
    } else {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' })
    }
  }

  if (loading) return <Skeleton className="h-64 w-full" />

  const totalDespesas = despesas.reduce((acc, d) => acc + Number(d.value), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Despesas Financeiras</h1>
          <p className="text-muted-foreground">Controle de custos por obra e categoria.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> Nova Despesa
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Registrar Despesa</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Obra (Opcional)</Label>
                <Select
                  value={formData.work_id}
                  onValueChange={(val) => setFormData({ ...formData, work_id: val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Geral / Nenhuma" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Geral / Nenhuma</SelectItem>
                    {works?.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Input
                  required
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select
                  value={formData.category}
                  onValueChange={(val) => setFormData({ ...formData, category: val })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Materiais">Materiais</SelectItem>
                    <SelectItem value="Mão de Obra">Mão de Obra</SelectItem>
                    <SelectItem value="Equipamentos">Equipamentos</SelectItem>
                    <SelectItem value="Administrativo">Administrativo</SelectItem>
                    <SelectItem value="Outros">Outros</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Data</Label>
                  <Input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Valor (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    required
                    value={formData.value}
                    onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                  />
                </div>
              </div>
              <Button type="submit" className="w-full">
                Salvar Despesa
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-1 bg-primary text-primary-foreground">
          <CardContent className="p-6">
            <h3 className="text-primary-foreground/80 text-sm font-medium mb-2">
              Total Realizado (Geral)
            </h3>
            <p className="text-3xl font-bold">{formatCurrency(totalDespesas)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Obra</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead className="text-right">Valor (R$)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {despesas.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                  Nenhuma despesa registrada.
                </TableCell>
              </TableRow>
            )}
            {despesas.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="text-muted-foreground">{formatDate(d.date)}</TableCell>
                <TableCell className="font-medium">{d.description}</TableCell>
                <TableCell className="text-sm">{d.works?.name || '-'}</TableCell>
                <TableCell>
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
                    {d.category}
                  </span>
                </TableCell>
                <TableCell className="text-right font-bold">{formatCurrency(d.value)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
