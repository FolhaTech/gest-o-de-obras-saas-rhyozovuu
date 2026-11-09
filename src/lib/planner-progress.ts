import type { PlannerTask, PlannerTaskStatus } from '@/types'

export const clampProgress = (value: unknown): number =>
  Math.min(100, Math.max(0, Math.round(Number(value) || 0)))

/** Porcentagem da tarefa (a mesma gravada no banco e exibida no Cronograma). */
export function taskProgress(task: Pick<PlannerTask, 'status' | 'progress_percentage'>): number {
  return clampProgress(task.progress_percentage)
}

/** Status coerente com a porcentagem escolhida. */
export function statusFromProgress(
  progress: number,
  current: PlannerTaskStatus,
): PlannerTaskStatus {
  if (progress >= 100) return 'completed'
  if (progress > 0) return 'in_progress'
  return current === 'completed' ? 'pending' : current
}

/** Porcentagem coerente com o status escolhido. */
export function progressFromStatus(status: PlannerTaskStatus, current: number): number {
  if (status === 'completed') return 100
  if (status === 'pending') return 0
  return current >= 100 ? 50 : clampProgress(current)
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Data local no formato YYYY-MM-DD (evita o desvio de fuso de toISOString). */
export const localISODate = (d: Date = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Atrasada = prazo anterior a hoje e tarefa ainda não concluída. */
export function isTaskOverdue(
  task: Pick<PlannerTask, 'status' | 'due_date'>,
  today: string = localISODate(),
): boolean {
  return task.status !== 'completed' && !!task.due_date && task.due_date.slice(0, 10) < today
}

/** Dias de atraso (0 se a tarefa não está atrasada). */
export function daysOverdue(
  task: Pick<PlannerTask, 'status' | 'due_date'>,
  now: Date = new Date(),
): number {
  if (!isTaskOverdue(task, localISODate(now))) return 0
  const due = new Date(`${task.due_date!.slice(0, 10)}T00:00:00`)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.max(1, Math.round((today.getTime() - due.getTime()) / 86_400_000))
}
