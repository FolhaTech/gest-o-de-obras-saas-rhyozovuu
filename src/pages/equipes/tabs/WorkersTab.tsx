import { useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency, formatDate } from '@/lib/formatters'
import { useData } from '@/hooks/use-data'
import { Equipe } from '@/types'
import { Plus, UserCheck, UserMinus, Edit, Trash } from 'lucide-react'
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
import WorkerDetailSheet from './WorkerDetailSheet'

export default function WorkersTab() {
  const { data: equipes, loading, refetch } = useData<Equipe>('team_members')
  const { toast } = useToast()

  const [open, setOpen] = useState(false)
  const [formData, setFormData] = useState<Partial<Equipe>>({
    name: '',
    role: '',
    phone: '',
    type: 'internal',
    daily_cost: 0,
    status: 'active',
    payment_type: 'daily',
    pix_key: '',
    admission_date: '',
  })

  const [editOpen, setEditOpen] = useState(false)
  const [selectedWorker, setSelectedWorker] = useState<Equipe | null>(null)

  const handleSave = async (e: React.FormEvent, isEdit: boolean) => {
    e.preventDefault()
    const payload = {
      name: formData.name,
      role: formData.role,
      phone: formData.phone || null,
      type: formData.type,
      daily_cost: Number(formData.daily_cost),
      status: formData.status,
      payment_type: formData.payment_type,
      pix_key: formData.pix_key || null,
      admission_date: formData.admission_date || null,
    }

    const { error } = isEdit
      ? await supabase.from('team_members').update(payload).eq('id', selectedWorker?.id)
      : await supabase.from('team_members').insert([payload])

    if (!error) {
      toast({ title: isEdit ? 'Atualizado!' : 'Registrado com sucesso!' })
      setOpen(false)
      setEditOpen(false)
      refetch()
    } else {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' })
    }
  }

  const openEdit = (eq: Equipe) => {
    setSelectedWorker(eq)
    setEditOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja excluir este registro?')) return
    const { error } = await supabase.from('team_members').delete().eq('id', id)
    if (!error) {
      toast({ title: 'Registro excluído' })
      refetch()
    }
  }

  if (loading) return <Skeleton className="h-64 w-full" />

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button
              onClick={() =>
                setFormData({ type: 'internal', payment_type: 'daily', status: 'active' })
              }
            >
              <Plus className="mr-2 h-4 w-4" /> Novo Funcionário
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Adicionar Funcionário</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => handleSave(e, false)} className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="worker-name">Nome</Label>
                  <Input
                    id="worker-name"
                    required
                    value={formData.name || ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Nome completo do colaborador"
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="worker-role">Função</Label>
                  <Input
                    id="worker-role"
                    required
                    value={formData.role || ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, role: e.target.value }))}
                    placeholder="Ex: Pedreiro, Eletricista"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="worker-phone">Telefone</Label>
                  <Input
                    id="worker-phone"
                    value={formData.phone || ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                    placeholder="(00) 00000-0000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="worker-pix">Chave PIX</Label>
                  <Input
                    id="worker-pix"
                    value={formData.pix_key || ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, pix_key: e.target.value }))}
                    placeholder="CPF, telefone, e-mail ou aleatória"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="worker-admission">Data de Admissão</Label>
                  <Input
                    id="worker-admission"
                    type="date"
                    value={formData.admission_date || ''}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, admission_date: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Equipe / Tipo</Label>
                  <Select
                    value={formData.type || 'internal'}
                    onValueChange={(val) => setFormData((prev) => ({ ...prev, type: val }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="internal">Própria</SelectItem>
                      <SelectItem value="outsourced">Terceirizada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Tipo Pagamento</Label>
                  <Select
                    value={formData.payment_type || 'daily'}
                    onValueChange={(val) => setFormData((prev) => ({ ...prev, payment_type: val }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Diária</SelectItem>
                      <SelectItem value="monthly">Mensal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="worker-cost">Valor (R$)</Label>
                  <Input
                    id="worker-cost"
                    type="number"
                    step="0.01"
                    value={formData.daily_cost === undefined ? '' : formData.daily_cost}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        daily_cost: e.target.value === '' ? 0 : Number(e.target.value),
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={formData.status || 'active'}
                    onValueChange={(val) => setFormData((prev) => ({ ...prev, status: val }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Ativo</SelectItem>
                      <SelectItem value="inactive">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
              <TableHead>Nome / Função</TableHead>
              <TableHead>Contato / PIX</TableHead>
              <TableHead>Admissão</TableHead>
              <TableHead>Pagamento</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {equipes.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                  Nenhum funcionário.
                </TableCell>
              </TableRow>
            )}
            {equipes.map((eq) => (
              <TableRow key={eq.id}>
                <TableCell>
                  <div className="font-medium">{eq.name}</div>
                  <div className="text-xs text-muted-foreground">{eq.role}</div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{eq.phone || '-'}</div>
                  <div className="text-xs text-muted-foreground">Pix: {eq.pix_key || '-'}</div>
                </TableCell>
                <TableCell className="text-sm">
                  {eq.admission_date ? formatDate(eq.admission_date) : '-'}
                </TableCell>
                <TableCell>
                  <div className="font-medium">
                    {eq.payment_type === 'monthly' ? 'Mensal' : formatCurrency(eq.daily_cost)}
                  </div>
                  <Badge variant="outline" className="mt-1 text-[10px]">
                    {eq.type === 'internal' ? 'Própria' : 'Terceira'}
                  </Badge>
                </TableCell>
                <TableCell className="text-center">
                  {eq.status === 'active' ? (
                    <div className="flex items-center justify-center gap-1 text-emerald-600 text-sm font-medium">
                      <UserCheck className="h-4 w-4" /> Ativo
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-1 text-muted-foreground text-sm font-medium">
                      <UserMinus className="h-4 w-4" /> Inativo
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(eq)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    onClick={() => handleDelete(eq.id)}
                  >
                    <Trash className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {selectedWorker && (
        <WorkerDetailSheet
          open={editOpen}
          onOpenChange={setEditOpen}
          worker={selectedWorker}
          onUpdated={refetch}
        />
      )}
    </div>
  )
}
