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
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useData } from '@/hooks/use-data'
import { Equipe, WorkerGroup } from '@/types'
import { Plus, Edit, Trash2, Users2, Database, AlertCircle, Layers } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { formatDate, formatSupabaseError } from '@/lib/formatters'

interface GroupFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialData?: WorkerGroup | null
  onSuccess: () => void
}

function GroupFormDialog({ open, onOpenChange, initialData, onSuccess }: GroupFormDialogProps) {
  const { toast } = useToast()
  const [name, setName] = useState(initialData?.name || '')
  const [description, setDescription] = useState(initialData?.description || '')
  const [submitting, setSubmitting] = useState(false)

  // Reset form when opened with initialData
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setName(initialData?.name || '')
      setDescription(initialData?.description || '')
    }
    onOpenChange(isOpen)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) {
      toast({
        title: 'Nome obrigatório',
        description: 'Informe o nome do grupo.',
        variant: 'destructive',
      })
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        name: trimmedName,
        description: description.trim() || null,
      }

      if (initialData?.id) {
        const { error } = await supabase
          .from('worker_groups')
          .update(payload)
          .eq('id', initialData.id)

        if (error) throw error
        toast({ title: 'Grupo atualizado com sucesso!' })
      } else {
        const { error } = await supabase.from('worker_groups').insert([payload])

        if (error) throw error
        toast({ title: 'Grupo criado com sucesso!' })
      }

      onSuccess()
      onOpenChange(false)
    } catch (err: any) {
      console.error('Erro ao salvar grupo:', err)
      const isUniqueErr =
        err?.code === '23505' ||
        String(err?.message || '')
          .toLowerCase()
          .includes('unique')
      toast({
        title: isUniqueErr ? 'Grupo já cadastrado' : 'Erro ao salvar grupo',
        description: isUniqueErr
          ? 'Já existe um grupo com este nome. Escolha outro nome.'
          : formatSupabaseError(err),
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initialData ? 'Editar Grupo' : 'Novo Grupo de Funcionários'}</DialogTitle>
          <DialogDescription>
            Organize os colaboradores por especialidade ou equipe (ex: Alvenaria, Elétrica,
            Hidráulica).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="group-name">Nome do Grupo *</Label>
            <Input
              id="group-name"
              required
              placeholder="Ex: Alvenaria, Elétrica, Pintura"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="group-desc">Descrição (opcional)</Label>
            <Input
              id="group-desc"
              placeholder="Ex: Equipe de assentamento e estruturas"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Salvando...' : initialData ? 'Salvar Alterações' : 'Criar Grupo'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function GroupsTab() {
  const {
    data: groups,
    loading,
    isTableMissing,
    refetch: refetchGroups,
  } = useData<WorkerGroup>('worker_groups')
  const { data: teamMembers, refetch: refetchTeam } = useData<Equipe>('team_members')
  const { toast } = useToast()

  const [createOpen, setCreateOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<WorkerGroup | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Map count of workers per group
  const workerCountByGroup = useMemo(() => {
    const counts: Record<string, number> = {}
    teamMembers.forEach((m) => {
      if (m.group_id) {
        counts[m.group_id] = (counts[m.group_id] || 0) + 1
      }
    })
    return counts
  }, [teamMembers])

  const handleDelete = async (group: WorkerGroup) => {
    const linkedCount = workerCountByGroup[group.id] || 0
    const msg =
      linkedCount > 0
        ? `Excluir o grupo "${group.name}"? ${linkedCount} funcionário(s) vinculado(s) ficarão sem grupo (nenhum colaborador será excluído).`
        : `Excluir o grupo "${group.name}"?`

    if (!confirm(msg)) return

    setDeletingId(group.id)
    try {
      // 1. Desvincular colaboradores caso ON DELETE SET NULL não tenha sido executado
      await supabase
        .from('team_members')
        .update({ group_id: null } as any)
        .eq('group_id', group.id)

      // 2. Excluir o grupo
      const { error } = await supabase.from('worker_groups').delete().eq('id', group.id)

      if (error) throw error

      toast({
        title: 'Grupo excluído',
        description: 'O grupo foi removido com sucesso. Os funcionários permanecem cadastrados.',
      })
      refetchGroups()
      refetchTeam()
    } catch (err: any) {
      console.error('Erro ao excluir grupo:', err)
      toast({
        title: 'Erro ao excluir grupo',
        description: formatSupabaseError(err),
        variant: 'destructive',
      })
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) return <Skeleton className="h-64 w-full" />

  return (
    <div className="space-y-4">
      {/* Banner amigável se a tabela ainda não foi criada no Supabase */}
      {isTableMissing && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800">
          <CardContent className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Database className="h-6 w-6 text-amber-600 shrink-0" />
              <div>
                <h3 className="font-semibold text-amber-900 dark:text-amber-200">
                  Tabela de Grupos aguardando execução SQL
                </h3>
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  A tabela <code className="font-mono">worker_groups</code> e a coluna{' '}
                  <code className="font-mono">group_id</code> em{' '}
                  <code className="font-mono">team_members</code> estão na <strong>Etapa 13</strong>{' '}
                  do arquivo <code className="font-mono">supabase_schema.sql</code>. Execute-a no
                  SQL Editor do Supabase para sincronizar em nuvem.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                refetchGroups()
                refetchTeam()
              }}
              className="border-amber-300 text-amber-900 dark:text-amber-100 hover:bg-amber-100 dark:hover:bg-amber-900 shrink-0"
            >
              Verificar Conexão
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" /> Grupos de Trabalho
          </h2>
          <p className="text-sm text-muted-foreground">
            Classifique seus funcionários por frentes de trabalho ou especialidades.
          </p>
        </div>

        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Novo Grupo
        </Button>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome do Grupo</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="text-center">Integrantes</TableHead>
              <TableHead>Data de Criação</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Users2 className="h-8 w-8 text-muted-foreground/60" />
                    <p className="font-medium">Nenhum grupo cadastrado ainda.</p>
                    <p className="text-xs">
                      Crie grupos como "Alvenaria", "Elétrica" ou "Hidráulica" para organizar sua
                      equipe.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              groups.map((group) => {
                const count = workerCountByGroup[group.id] || 0
                return (
                  <TableRow key={group.id}>
                    <TableCell>
                      <div className="font-medium flex items-center gap-2">
                        <Badge variant="secondary" className="font-semibold">
                          {group.name}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                      {group.description || '—'}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={count > 0 ? 'default' : 'outline'} className="text-xs">
                        {count} {count === 1 ? 'colaborador' : 'colaboradores'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {group.created_at ? formatDate(group.created_at) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditingGroup(group)}
                          title="Renomear / Editar"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:bg-destructive/10"
                          disabled={deletingId === group.id}
                          onClick={() => handleDelete(group)}
                          title="Excluir grupo"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Info card explicativo sobre exclusão segura */}
      <div className="flex items-start gap-2 text-xs text-muted-foreground p-3 rounded-lg bg-muted/40">
        <AlertCircle className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <span>
          A exclusão de um grupo não exclui os funcionários. Os colaboradores vinculados a ele
          apenas passam a ficar sem grupo atribuído.
        </span>
      </div>

      {/* Modal Criar */}
      {createOpen && (
        <GroupFormDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onSuccess={() => {
            refetchGroups()
            refetchTeam()
          }}
        />
      )}

      {/* Modal Editar */}
      {editingGroup && (
        <GroupFormDialog
          open={!!editingGroup}
          onOpenChange={(open) => !open && setEditingGroup(null)}
          initialData={editingGroup}
          onSuccess={() => {
            refetchGroups()
            refetchTeam()
          }}
        />
      )}
    </div>
  )
}
