import { useEffect, useState } from 'react'
import { ArrowDown, ArrowRight, CheckCircle2, History, PlusCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { Skeleton } from '@/components/ui/skeleton'

interface Entry {
  id: string
  old_percentage: number | null
  new_percentage: number
  changed_at: string
  days_to_complete: number | null
  changer: { full_name: string | null; email: string | null } | null
}

const dateTime = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))

const dateOnly = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso))

const days = (n: number) => (n === 1 ? '1 dia' : `${n} dias`)

/** Texto "levou N dias" de um card que chegou a 100%. */
export const completionText = (n: number) =>
  n === 0 ? 'Concluída no mesmo dia da criação' : `Levou ${days(n)} para chegar a 100%`

/**
 * Histórico do progresso de um card do Planner: cada alteração da porcentagem (de quanto para quanto, quando e
 * quem alterou) e, ao chegar a 100%, quantos dias o card levou desde a criação.
 * `progress` serve só para recarregar a lista quando a porcentagem mudar com o diálogo aberto.
 */
export default function ProgressHistory({
  taskId,
  createdAt,
  progress,
}: {
  taskId: string
  createdAt?: string | null
  progress?: number
}) {
  const [rows, setRows] = useState<Entry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setRows(null)
    supabase
      .from('planner_task_progress_history' as any)
      .select('id, old_percentage, new_percentage, changed_at, days_to_complete, changer:changed_by(full_name, email)')
      .eq('task_id', taskId)
      .order('changed_at', { ascending: false })
      .then(({ data, error: err }) => {
        if (!alive) return
        setError(err ? err.message : null)
        setRows((data ?? []) as unknown as Entry[])
      })
    return () => {
      alive = false
    }
  }, [taskId, progress])

  const hasCreationRow = !!rows?.some((r) => r.old_percentage === null)

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-sm font-medium">
        <History className="h-4 w-4 text-muted-foreground" /> Histórico do progresso
      </div>

      {rows === null ? (
        <Skeleton className="h-16 w-full" />
      ) : error ? (
        <p className="text-xs text-destructive">Não foi possível carregar o histórico: {error}</p>
      ) : (
        <div className="max-h-56 overflow-y-auto rounded-md border divide-y text-sm">
          {rows.length === 0 && (
            <p className="p-3 text-xs text-muted-foreground">
              Nenhuma alteração de porcentagem registrada ainda. As próximas aparecem aqui.
            </p>
          )}
          {rows.map((r) => {
            const created = r.old_percentage === null
            const done = r.new_percentage >= 100
            const down = !created && r.new_percentage < (r.old_percentage as number)
            const who = r.changer?.full_name?.trim() || r.changer?.email || null
            return (
              <div key={r.id} className={`p-2.5 space-y-0.5 ${done ? 'bg-emerald-50/70 dark:bg-emerald-950/20' : ''}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  {created ? (
                    <>
                      <PlusCircle className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium">Card criado com {r.new_percentage}%</span>
                    </>
                  ) : (
                    <>
                      {done ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      ) : down ? (
                        <ArrowDown className="h-3.5 w-3.5 text-rose-600" />
                      ) : (
                        <ArrowRight className="h-3.5 w-3.5 text-blue-600" />
                      )}
                      <span className="font-medium">
                        {r.old_percentage}% → {r.new_percentage}%
                      </span>
                      <span className={`text-xs ${down ? 'text-rose-600' : 'text-muted-foreground'}`}>
                        ({down ? '' : '+'}
                        {r.new_percentage - (r.old_percentage as number)} p.p.)
                      </span>
                    </>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {dateTime(r.changed_at)}
                  {who ? ` · por ${who}` : ''}
                </div>
                {done && r.days_to_complete !== null && (
                  <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    {completionText(r.days_to_complete)}
                  </div>
                )}
              </div>
            )
          })}
          {!hasCreationRow && createdAt && (
            <div className="p-2.5 text-xs text-muted-foreground">Card criado em {dateOnly(createdAt)}</div>
          )}
        </div>
      )}
    </div>
  )
}
