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
import { Skeleton } from '@/components/ui/skeleton'
import { useData } from '@/hooks/use-data'
import { ExternalContract, ServiceProvider } from '@/types'
import { Plus, Edit, Trash, CheckCircle2, Clock } from 'lucide-react'
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
import { formatCurrency, formatDate } from '@/lib/formatters'
import { Badge } from '@/components/ui/badge'

export default function ContractsTab() {
  const {
    data: contracts,
    loading,
    refetch,
  } = useData<ExternalContract>('external_contracts', '*, service_providers(name)')
  const { data: providers } = useData<ServiceProvider>('service_providers')
  const { toast } = useToast()

  const [open, setOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)

  const [formData, setFormData] = useState<Partial<ExternalContract>>({
    provider_id: '',
    service_description: '',
    unit: '',
    total_value: 0,
    executed_quantity: 0,
    target_date: '',
    is_completed: false,
    notes: '',
  })

  const handleSave = async (e: React.FormEvent, isEdit: boolean) => {
    e.preventDefault()
    if (!formData.provider_id) {
      toast({ title: 'Selecione um prestador', variant: 'destructive' })
      return
    }

    const { service_providers: _sp, ...rest } = formData
    const payload = {
      ...rest,
      total_value: Number(formData.total_value),
      executed_quantity: Number(formData.executed_quantity),
    }

    const { error } = isEdit
      ? await supabase.from('external_contracts').update(payload).eq('id', editId)
      : await supabase.from('external_contracts').insert([payload])

    if (!error) {
      toast({ title: isEdit ? 'Contrato atualizado!' : 'Contrato salvo!' })
      setOpen(false)
      setEditOpen(false)
      refetch()
    } else {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' })
    }
  }

  const openEdit = (c: ExternalContract) => {
    setEditId(c.id)
    setFormData(c)
    setEditOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja excluir?')) return
    const { error } = await supabase.from('external_contracts').delete().eq('id', id)
    if (!error) {
      toast({ title: 'Excluído' })
      refetch()
    }
  }

  const FormContent = () => (
    <>
      <div className="space-y-2">
        <Label>Prestador de Serviço</Label>
        <Select
          value={formData.provider_id}
          onValueChange={(val) => setFormData({ ...formData, provider_id: val })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecione..." />
          </SelectTrigger>
          <SelectContent>
            {providers.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Descrição do Serviço</Label>
        <Input
          required
          value={formData.service_description || ''}
          onChange={(e) => setFormData({ ...formData, service_description: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Unidade / Ref</Label>
          <Input
            value={formData.unit || ''}
            onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Valor Total (R$)</Label>
          <Input
            type="number"
            step="0.01"
            value={formData.total_value || ''}
            onChange={(e) => setFormData({ ...formData, total_value: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-2">
          <Label>Qtd Executada</Label>
          <Input
            type="number"
            step="0.01"
            value={formData.executed_quantity || ''}
            onChange={(e) =>
              setFormData({ ...formData, executed_quantity: Number(e.target.value) })
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Data Meta / Prazo</Label>
          <Input
            type="date"
            value={formData.target_date || ''}
            onChange={(e) => setFormData({ ...formData, target_date: e.target.value })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 items-center">
        <div className="space-y-2">
          <Label>Status</Label>
          <Select
            value={formData.is_completed ? 'true' : 'false'}
            onValueChange={(val) => setFormData({ ...formData, is_completed: val === 'true' })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="false">Em Andamento</SelectItem>
              <SelectItem value="true">Concluído</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Notas / Pagamentos</Label>
        <Input
          value={formData.notes || ''}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
        />
      </div>
    </>
  )

  if (loading) return <Skeleton className="h-64 w-full" />

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setFormData({ is_completed: false })}>
              <Plus className="mr-2 h-4 w-4" /> Novo Contrato
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Adicionar Serviço Contratado</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => handleSave(e, false)} className="space-y-4 mt-4">
              <FormContent />
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
              <TableHead>Prestador / Serviço</TableHead>
              <TableHead>Unidade / Executado</TableHead>
              <TableHead>Valor Total</TableHead>
              <TableHead>Prazo</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contracts.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                  Nenhum contrato.
                </TableCell>
              </TableRow>
            )}
            {contracts.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <div className="font-medium">{c.service_providers?.name}</div>
                  <div className="text-xs text-muted-foreground line-clamp-2 max-w-[250px]">
                    {c.service_description}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{c.unit || '-'}</div>
                  <div className="text-xs text-muted-foreground">Exec: {c.executed_quantity}</div>
                </TableCell>
                <TableCell className="font-medium text-primary">
                  {formatCurrency(c.total_value)}
                </TableCell>
                <TableCell className="text-sm">
                  {c.target_date ? formatDate(c.target_date) : '-'}
                </TableCell>
                <TableCell className="text-center">
                  {c.is_completed ? (
                    <Badge
                      variant="outline"
                      className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1"
                    >
                      <CheckCircle2 className="h-3 w-3" /> Concluído
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="bg-amber-50 text-amber-700 border-amber-200 gap-1"
                    >
                      <Clock className="h-3 w-3" /> Em Andamento
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    onClick={() => handleDelete(c.id)}
                  >
                    <Trash className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar Contrato</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => handleSave(e, true)} className="space-y-4 mt-4">
            <FormContent />
            <Button type="submit" className="w-full">
              Atualizar
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
