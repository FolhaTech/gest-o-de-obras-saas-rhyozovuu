import { useState, useMemo } from 'react'
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
import { useAuth } from '@/hooks/use-auth'
import { useData } from '@/hooks/use-data'
import { Equipe, WorkerGroup } from '@/types'
import { Plus, UserCheck, UserMinus, Edit, Trash, Filter, Layers, Search, Eye } from 'lucide-react'
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
  const { canSeeValues, readOnly } = useAuth() // pagamento (diária/mensal e valor) só para o administrador
  const { data: equipes, loading, refetch } = useData<Equipe>('team_members')
  const { data: groups, refetch: refetchGroups } = useData<WorkerGroup>('worker_groups')
  const { toast } = useToast()

  const [open, setOpen] = useState(false)
  const [formData, setFormData] = useState<Partial<Equipe>>({
    name: '',
    role: '',
    phone: '',
    group_id: 'none',
    type: 'internal',
    daily_cost: 0,
    status: 'active',
    payment_type: 'daily',
    pix_key: '',
    admission_date: '',
  })

  // Filtros
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('all')

  const [editOpen, setEditOpen] = useState(false)
  const [selectedWorker, setSelectedWorker] = useState<Equipe | null>(null)

  // Map de id -> nome do grupo para renderização rápida
  const groupMap = useMemo(() => {
    const map = new Map<string, string>()
    groups.forEach((g) => map.set(g.id, g.name))
    return map
  }, [groups])

  // Lista filtrada por busca e por grupo
  const filteredEquipes = useMemo(() => {
    return equipes.filter((worker) => {
      if (worker.provider_id) return false // espelho de Prestadores: não é funcionário
      // Filtro de texto (nome ou função)
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase()
        const matchName = worker.name?.toLowerCase().includes(query)
        const matchRole = worker.role?.toLowerCase().includes(query)
        if (!matchName && !matchRole) return false
      }

      // Filtro de grupo
      if (selectedGroupFilter !== 'all') {
        if (selectedGroupFilter === 'none') {
          if (worker.group_id) return false
        } else {
          if (worker.group_id !== selectedGroupFilter) return false
        }
      }

      return true
    })
  }, [equipes, searchTerm, selectedGroupFilter])

  const handleSave = async (e: React.FormEvent, isEdit: boolean) => {
    e.preventDefault()
    const resolvedGroupId =
      !formData.group_id || formData.group_id === 'none' ? null : formData.group_id

    const payload: any = {
      name: formData.name,
      role: formData.role,
      phone: formData.phone || null,
      group_id: resolvedGroupId,
      type: formData.type,
      daily_cost: Number(formData.daily_cost),
      status: formData.status,
      payment_type: formData.payment_type,
      pix_key: formData.pix_key || null,
      admission_date: formData.admission_date || null,
    }

    let { error } = isEdit
      ? await supabase.from('team_members').update(payload).eq('id', selectedWorker?.id)
      : await supabase.from('team_members').insert([payload])

    // Caso a coluna group_id ainda não exista no Supabase (não migrado), tenta salvar sem o campo
    if (error && String(error.message || '').includes('group_id')) {
      delete payload.group_id
      const retry = isEdit
        ? await supabase.from('team_members').update(payload).eq('id', selectedWorker?.id)
        : await supabase.from('team_members').insert([payload])
      error = retry.error
    }

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
      {/* Barra de Ações: Busca, Filtro de Grupo e Botão Novo */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {/* Busca por texto */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Buscar por nome ou função..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>

          {/* Filtro por Grupo */}
          <div className="flex items-center gap-2 min-w-[200px]">
            <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
            <Select
              value={selectedGroupFilter}
              onValueChange={(val) => setSelectedGroupFilter(val)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Filtrar por Grupo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Grupos</SelectItem>
                <SelectItem value="none">Sem grupo atribuído</SelectItem>
                {groups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Modal de Criação */}
        {!readOnly && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button
              onClick={() => {
                setFormData({
                  type: 'internal',
                  payment_type: 'daily',
                  status: 'active',
                  group_id: 'none',
                  daily_cost: 0,
                })
                refetchGroups()
              }}
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

              {/* Campo de Grupo de Trabalho */}
              <div className="space-y-2">
                <Label htmlFor="worker-group" className="flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-primary" /> Grupo / Frente de Trabalho
                </Label>
                <Select
                  value={formData.group_id || 'none'}
                  onValueChange={(val) => setFormData((prev) => ({ ...prev, group_id: val }))}
                >
                  <SelectTrigger id="worker-group">
                    <SelectValue placeholder="Selecione um grupo (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem grupo (nenhum)</SelectItem>
                    {groups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Vincule o colaborador a uma especialidade ou equipe (gerencie na aba Grupos).
                </p>
              </div>

              <div className="grid grid-cols-3 gap-4">
                {canSeeValues && (
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
                )}
                {canSeeValues && (
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
                )}
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
        )}
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome / Função</TableHead>
              <TableHead>Grupo</TableHead>
              <TableHead>Contato / PIX</TableHead>
              <TableHead>Admissão</TableHead>
              {canSeeValues && <TableHead>Pagamento</TableHead>}
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEquipes.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                  {equipes.length === 0
                    ? 'Nenhum funcionário cadastrado.'
                    : 'Nenhum funcionário encontrado com os filtros selecionados.'}
                </TableCell>
              </TableRow>
            )}
            {filteredEquipes.map((eq) => {
              const groupName = eq.group_id ? groupMap.get(eq.group_id) : null

              return (
                <TableRow key={eq.id}>
                  <TableCell>
                    <div className="font-medium">{eq.name}</div>
                    <div className="text-xs text-muted-foreground">{eq.role}</div>
                  </TableCell>
                  <TableCell>
                    {groupName ? (
                      <Badge variant="secondary" className="font-medium text-xs">
                        <Layers className="mr-1 h-3 w-3 text-primary" />
                        {groupName}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">Sem grupo</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{eq.phone || '-'}</div>
                    <div className="text-xs text-muted-foreground">Pix: {eq.pix_key || '-'}</div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {eq.admission_date ? formatDate(eq.admission_date) : '-'}
                  </TableCell>
                  <TableCell>
                    {canSeeValues && (
                      <div className="font-medium">
                        {eq.payment_type === 'monthly' ? 'Mensal' : formatCurrency(eq.daily_cost)}
                      </div>
                    )}
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
                    {readOnly ? (
                      // Financeiro: abre a ficha só para consulta (sem editar nem excluir)
                      <Button variant="ghost" size="icon" onClick={() => openEdit(eq)} title="Ver ficha">
                        <Eye className="h-4 w-4" />
                      </Button>
                    ) : (
                      <>
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
                      </>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {selectedWorker && (
        <WorkerDetailSheet
          open={editOpen}
          onOpenChange={setEditOpen}
          worker={selectedWorker}
          onUpdated={() => {
            refetch()
            refetchGroups()
          }}
        />
      )}
    </div>
  )
}
