import type { PlannerTask, PlannerTaskStatus } from '@/types'

export const clampProgress = (value: unknown): number =>
  Math.min(100, Math.max(0, Math.round(Number(value) || 0)))

/** Porcentagem efetiva da tarefa. Tarefa concluída vale sempre 100%. */
export function taskProgress(task: Pick<PlannerTask, 'status' | 'progress_percentage'>): number {
  return task.status === 'completed' ? 100 : clampProgress(task.progress_percentage)
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
