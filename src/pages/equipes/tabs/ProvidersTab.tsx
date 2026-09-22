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
import { ServiceProvider } from '@/types'
import { Plus, Edit, Trash } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'

export default function ProvidersTab() {
  const { data: providers, loading, refetch } = useData<ServiceProvider>('service_providers')
  const { toast } = useToast()

  const [open, setOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)

  const [formData, setFormData] = useState<Partial<ServiceProvider>>({
    name: '',
    service_type: '',
    contact_phone: '',
    email: '',
    responsible_person: '',
    quality_rating: '',
    deadline_rating: '',
    team_level: '',
    observations: '',
  })

  const handleSave = async (e: React.FormEvent, isEdit: boolean) => {
    e.preventDefault()
    const insertPayload = { ...formData, name: formData.name || '' }
    const { error } = isEdit
      ? await supabase.from('service_providers').update(formData).eq('id', editId)
      : await supabase.from('service_providers').insert([insertPayload])

    if (!error) {
      toast({ title: isEdit ? 'Prestador atualizado!' : 'Prestador salvo!' })
      setOpen(false)
      setEditOpen(false)
      refetch()
    } else {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' })
    }
  }

  const openEdit = (p: ServiceProvider) => {
    setEditId(p.id)
    setFormData(p)
    setEditOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja excluir?')) return
    const { error } = await supabase.from('service_providers').delete().eq('id', id)
    if (!error) {
      toast({ title: 'Excluído' })
      refetch()
    }
  }

  const renderFormFields = () => (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Nome / Empresa</Label>
          <Input
            required
            value={formData.name || ''}
            onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Ex: Empreiteira Silva, João Eletricista"
          />
        </div>
        <div className="space-y-2">
          <Label>Tipo de Serviço</Label>
          <Input
            value={formData.service_type || ''}
            onChange={(e) => setFormData((prev) => ({ ...prev, service_type: e.target.value }))}
            placeholder="Ex: Elétrica, Hidráulica, Pintura"
          />
        </div>
        <div className="space-y-2">
          <Label>Contato / Telefone</Label>
          <Input
            value={formData.contact_phone || ''}
            onChange={(e) => setFormData((prev) => ({ ...prev, contact_phone: e.target.value }))}
            placeholder="(00) 00000-0000"
          />
        </div>
        <div className="space-y-2">
          <Label>Responsável</Label>
          <Input
            value={formData.responsible_person || ''}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, responsible_person: e.target.value }))
            }
            placeholder="Nome do encarregado ou mestre"
          />
        </div>
        <div className="space-y-2">
          <Label>Email</Label>
          <Input
            type="email"
            value={formData.email || ''}
            onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
            placeholder="contato@empresa.com"
          />
        </div>
        <div className="space-y-2">
          <Label>Nível da Equipe</Label>
          <Input
            value={formData.team_level || ''}
            placeholder="Ex: Alto, Médio"
            onChange={(e) => setFormData((prev) => ({ ...prev, team_level: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label>Qualidade</Label>
          <Input
            value={formData.quality_rating || ''}
            placeholder="Ex: 5 estrelas, Excelente"
            onChange={(e) => setFormData((prev) => ({ ...prev, quality_rating: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label>Prazo</Label>
          <Input
            value={formData.deadline_rating || ''}
            placeholder="Ex: Pontual, Cumpre prazos"
            onChange={(e) => setFormData((prev) => ({ ...prev, deadline_rating: e.target.value }))}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Observações</Label>
        <Input
          value={formData.observations || ''}
          placeholder="Notas adicionais sobre o prestador..."
          onChange={(e) => setFormData((prev) => ({ ...prev, observations: e.target.value }))}
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
            <Button onClick={() => setFormData({})}>
              <Plus className="mr-2 h-4 w-4" /> Novo Prestador
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Adicionar Prestador</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => handleSave(e, false)} className="space-y-4 mt-4">
              {renderFormFields()}
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
              <TableHead>Empresa / Responsável</TableHead>
              <TableHead>Serviço</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>Equipe / Qualidade</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {providers.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                  Nenhum prestador.
                </TableCell>
              </TableRow>
            )}
            {providers.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.responsible_person}</div>
                </TableCell>
                <TableCell>{p.service_type}</TableCell>
                <TableCell>
                  <div className="text-sm">{p.contact_phone}</div>
                  <div className="text-xs text-muted-foreground">{p.email}</div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">Eqp: {p.team_level || '-'}</div>
                  <div className="text-xs text-muted-foreground">
                    Quali: {p.quality_rating || '-'}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    onClick={() => handleDelete(p.id)}
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
            <DialogTitle>Editar Prestador</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => handleSave(e, true)} className="space-y-4 mt-4">
            {renderFormFields()}
            <Button type="submit" className="w-full">
              Atualizar
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
