import { useCallback, useEffect, useMemo, useState } from 'react'
import { Award, Edit2, Gift, PartyPopper, Plus, Trash2, Users } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency, formatDate, formatSupabaseError } from '@/lib/formatters'
import { Obra } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'

interface Person {
  id: string
  full_name: string | null
  email: string | null
}
interface Goal {
  id: string
  title: string
  reward_description: string
  reward_amount: number
  due_date: string | null
  paid_at: string | null
  notes: string | null
  work_goal_members: { user_id: string; member_id: string | null; user: Person | null }[]
}
interface StageRow {
  id: string
  name: string
  status: string | null
  progress_percentage: number | null
  manager_member_id: string | null
}

const personName = (p?: Partial<Person> | null) => (p?.full_name || p?.email || 'Usuário').trim()
const stageDone = (s: StageRow) => s.status === 'completed' || Number(s.progress_percentage ?? 0) >= 100

/**
 * Premiação: a pessoa (ou a equipe da meta) ganha quando cumpre 100% das etapas do projeto atribuídas
 * a ela (Etapas do Projeto) E o Progresso Físico da obra chega a 100%.
 * A etapa é atribuída a um membro da Equipe; o usuário da meta conta pelo membro vinculado a ele.
 * O indicador é a média das duas condições, então só fecha em 100% quando as duas estão cumpridas.
 */
function evaluate(goal: Goal, stages: StageRow[], physical: number) {
  const ids = new Set(goal.work_goal_members.map((m) => m.member_id).filter(Boolean) as string[])
  const assigned = stages.filter((s) => s.manager_member_id && ids.has(s.manager_member_id))
  const done = assigned.filter(stageDone)
  const stagesPct = assigned.length
    ? assigned.reduce((a, s) => a + (stageDone(s) ? 100 : Number(s.progress_percentage ?? 0)), 0) /
      assigned.length
    : 0
  const stagesOk = assigned.length > 0 && done.length === assigned.length
  const physicalOk = physical >= 100
  const progress = stagesOk && physicalOk ? 100 : Math.min(99, (stagesPct + Math.min(100, physical)) / 2)
  return { assigned, done, stagesPct, stagesOk, physicalOk, progress, achieved: stagesOk && physicalOk }
}

const emptyForm = () => ({
  title: '',
  reward_description: '',
  reward_amount: '',
  due_date: '',
  notes: '',
  members: [] as string[],
})

/** Anel de progresso no mesmo estilo do "Progresso Físico". */
function Ring({ value, done }: { value: number; done?: boolean }) {
  return (
    <div className="relative flex items-center justify-center h-32 w-32 rounded-full border-8 border-muted">
      <svg className="absolute inset-0 h-full w-full -rotate-90 transform" viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r="46"
          fill="transparent"
          stroke={done ? '#10b981' : 'hsl(var(--primary))'}
          strokeWidth="8"
          strokeDasharray={`${(Math.max(0, Math.min(100, value)) / 100) * 289} 289`}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <span className="text-3xl font-bold">{Math.round(value)}%</span>
    </div>
  )
}

export default function RewardProgressCard({ obra }: { obra: Obra }) {
  const { toast } = useToast()
  const { role } = useAuth()
  const isAdmin = role === 'admin'

  const [goals, setGoals] = useState<Goal[]>([])
  const [stages, setStages] = useState<StageRow[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)

  const physical = Number(obra.progress_percentage ?? 0)

  const fetchAll = useCallback(async () => {
    const [goalRes, stageRes, peopleRes] = await Promise.all([
      supabase
        .from('work_goals' as any)
        .select('*, work_goal_members(user_id, member_id, user:user_id(id, full_name, email))')
        .eq('work_id', obra.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('work_stages')
        .select('id, name, status, progress_percentage, manager_member_id')
        .eq('work_id', obra.id),
      isAdmin
        ? supabase.from('profiles').select('id, full_name, email').order('full_name')
        : Promise.resolve({ data: [] as Person[] }),
    ])
    setGoals(goalRes.error ? [] : ((goalRes.data ?? []) as unknown as Goal[]))
    setStages((stageRes.data ?? []) as unknown as StageRow[])
    setPeople((peopleRes.data ?? []) as Person[])
    setLoading(false)
  }, [obra.id, isAdmin])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const evaluated = useMemo(
    () => goals.map((g) => ({ goal: g, ev: evaluate(g, stages, physical) })),
    [goals, stages, physical],
  )

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm())
    setOpen(true)
  }

  const openEdit = (g: Goal) => {
    setEditingId(g.id)
    setForm({
      title: g.title,
      reward_description: g.reward_description,
      reward_amount: g.reward_amount ? String(g.reward_amount) : '',
      due_date: g.due_date ?? '',
      notes: g.notes ?? '',
      members: g.work_goal_members.map((m) => m.user_id),
    })
    setOpen(true)
  }

  const toggleMember = (id: string, on: boolean) =>
    setForm((f) => ({
      ...f,
      members: on ? [...new Set([...f.members, id])] : f.members.filter((m) => m !== id),
    }))

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    const amount = Number((form.reward_amount || '0').replace(',', '.'))
    if (
      !form.title.trim() ||
      !form.reward_description.trim() ||
      form.members.length === 0 ||
      Number.isNaN(amount) ||
      amount < 0
    ) {
      toast({
        title: 'Confira os dados',
        description: 'Informe o título, a premiação e escolha ao menos uma pessoa.',
        variant: 'destructive',
      })
      return
    }
    const payload = {
      work_id: obra.id,
      title: form.title.trim(),
      reward_description: form.reward_description.trim(),
      reward_amount: amount,
      due_date: form.due_date || null,
      notes: form.notes.trim() || null,
    }
    setSaving(true)
    try {
      let goalId = editingId
      if (editingId) {
        const { error: err } = await supabase.from('work_goals' as any).update(payload).eq('id', editingId)
        if (err) throw err
        const { error: delErr } = await supabase.from('work_goal_members' as any).delete().eq('goal_id', editingId)
        if (delErr) throw delErr
      } else {
        const { data, error: err } = await supabase.from('work_goals' as any).insert(payload).select('id').single()
        if (err) throw err
        goalId = (data as any).id
      }
      const { error: memErr } = await supabase
        .from('work_goal_members' as any)
        .insert(form.members.map((user_id) => ({ goal_id: goalId, user_id })))
      if (memErr) {
        if (!editingId) await supabase.from('work_goals' as any).delete().eq('id', goalId as string)
        throw memErr
      }
      toast({ title: editingId ? 'Meta atualizada' : 'Meta criada' })
      setOpen(false)
      fetchAll()
    } catch (err: any) {
      toast({ title: 'Erro ao salvar a meta', description: formatSupabaseError(err), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (g: Goal) => {
    if (!confirm(`Excluir a meta "${g.title}"?`)) return
    const { error: err } = await supabase.from('work_goals' as any).delete().eq('id', g.id)
    if (err) {
      toast({ title: 'Erro ao excluir', description: formatSupabaseError(err), variant: 'destructive' })
      return
    }
    toast({ title: 'Meta excluída' })
    fetchAll()
  }

  const togglePaid = async (g: Goal) => {
    const { error: err } = await supabase
      .from('work_goals' as any)
      .update({ paid_at: g.paid_at ? null : new Date().toISOString().slice(0, 10) })
      .eq('id', g.id)
    if (err) {
      toast({ title: 'Erro ao atualizar', description: formatSupabaseError(err), variant: 'destructive' })
      return
    }
    toast({ title: g.paid_at ? 'Entrega da premiação desfeita' : 'Premiação marcada como entregue' })
    fetchAll()
  }

  if (loading) return <Skeleton className="h-64 w-full" />
  // quem não é admin só vê o indicador se participar de alguma meta (o banco já filtra)
  if (!isAdmin && evaluated.length === 0) return null

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5 text-primary" /> Meta de Premiação
          </CardTitle>
          {isAdmin && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Meta
            </Button>
          )}
        </CardHeader>
        <CardContent className="divide-y">
          {evaluated.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 gap-3">
              <Ring value={0} />
              <p className="text-sm text-muted-foreground text-center">
                Nenhuma meta definida para esta obra. Defina a premiação para a pessoa ou a equipe.
              </p>
            </div>
          ) : (
            evaluated.map(({ goal, ev }) => (
              <div key={goal.id} className="flex flex-col items-center py-6 first:pt-4 last:pb-2 gap-3">
                <Ring value={ev.progress} done={ev.achieved} />

                <div className="text-center space-y-1.5 w-full">
                  <div className="flex items-center justify-center gap-1 flex-wrap">
                    <h4 className="font-semibold">{goal.title}</h4>
                    {isAdmin && (
                      <>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Editar" onClick={() => openEdit(goal)}>
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive" title="Excluir" onClick={() => handleDelete(goal)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                  <div className="flex items-center justify-center gap-1.5 flex-wrap">
                    <Badge variant="secondary" className="gap-1 font-normal">
                      <Users className="h-3 w-3" /> {goal.work_goal_members.length > 1 ? 'Equipe' : 'Individual'}
                    </Badge>
                    {goal.work_goal_members.map((m) => (
                      <Badge key={m.user_id} variant="outline" className="font-normal">
                        {personName(m.user)}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-sm flex items-center justify-center gap-1.5">
                    <Gift className="h-4 w-4 text-amber-600" />
                    <span className="font-medium">{goal.reward_description}</span>
                    {Number(goal.reward_amount) > 0 && (
                      <span className="text-muted-foreground">· {formatCurrency(Number(goal.reward_amount))}</span>
                    )}
                  </p>
                  {goal.due_date && (
                    <p className="text-xs text-muted-foreground">Prazo: {formatDate(goal.due_date)}</p>
                  )}
                </div>

                <div className="w-full text-xs text-muted-foreground space-y-0.5 text-center">
                  <p>
                    Etapas atribuídas:{' '}
                    {ev.assigned.length === 0
                      ? goal.work_goal_members.some((m) => !m.member_id)
                        ? 'nenhuma — vincule a pessoa a um membro da Equipe em Configurações'
                        : 'nenhuma atribuída ainda'
                      : `${ev.done.length} de ${ev.assigned.length} concluídas (${Math.round(ev.stagesPct)}%)`}
                  </p>
                  <p>Progresso Físico da obra: {Math.round(physical)}%</p>
                </div>

                {ev.achieved ? (
                  <div className="w-full rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 p-2.5 flex flex-wrap items-center justify-center gap-2">
                    <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                      <PartyPopper className="h-4 w-4" />
                      {goal.paid_at
                        ? `Premiação entregue em ${formatDate(goal.paid_at)}`
                        : 'Meta atingida! Premiação liberada.'}
                    </p>
                    {isAdmin && (
                      <Button size="sm" variant={goal.paid_at ? 'outline' : 'default'} onClick={() => togglePaid(goal)}>
                        {goal.paid_at ? 'Desfazer entrega' : 'Marcar como entregue'}
                      </Button>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center">
                    Libera quando as etapas atribuídas e o Progresso Físico chegarem a 100%.
                  </p>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar meta' : 'Nova meta de pessoal'}</DialogTitle>
            <DialogDescription>
              Escolha uma pessoa (meta individual) ou várias (meta de equipe) e defina a premiação.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="gl-title">Título da meta *</Label>
              <Input id="gl-title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex.: Entregar a obra concluída" />
            </div>
            <div className="space-y-2">
              <Label>Quem participa *</Label>
              <div className="max-h-44 overflow-y-auto rounded-md border divide-y">
                {people.map((p) => (
                  <label key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40">
                    <Checkbox checked={form.members.includes(p.id)} onCheckedChange={(v) => toggleMember(p.id, v === true)} />
                    <span className="truncate">
                      {personName(p)}
                      {p.full_name && p.email ? <span className="text-muted-foreground"> · {p.email}</span> : null}
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {form.members.length === 0
                  ? 'Nenhuma pessoa escolhida.'
                  : form.members.length === 1
                    ? 'Meta individual.'
                    : `Meta de equipe (${form.members.length} pessoas).`}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="gl-reward">Premiação *</Label>
              <Input id="gl-reward" required value={form.reward_description} onChange={(e) => setForm({ ...form, reward_description: e.target.value })} placeholder="Ex.: Bônus em dinheiro, churrasco da equipe" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="gl-amount">Valor da premiação (R$)</Label>
                <Input id="gl-amount" inputMode="decimal" placeholder="0,00" value={form.reward_amount} onChange={(e) => setForm({ ...form, reward_amount: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gl-due">Prazo da meta</Label>
                <Input id="gl-due" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="gl-notes">Observações</Label>
              <Textarea id="gl-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Criar meta'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
