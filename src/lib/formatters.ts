export function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0)
}

export function formatDate(dateStr: string) {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(date)
}

export function getStatusColor(status: string) {
  switch (status) {
    case 'in_progress':
    case 'Em Andamento':
      return 'bg-blue-100 text-blue-800 border-blue-200'
    case 'completed':
    case 'finished':
    case 'Finalizada':
    case 'Concluída':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200'
    case 'delayed':
    case 'Atrasada':
      return 'bg-red-100 text-red-800 border-red-200'
    case 'planned':
    case 'pending':
    case 'Planejada':
    case 'Pendente':
      return 'bg-gray-100 text-gray-800 border-gray-200'
    default:
      return 'bg-secondary text-secondary-foreground'
  }
}

export function translateStatus(status: string) {
  const map: Record<string, string> = {
    planned: 'Planejada',
    in_progress: 'Em Andamento',
    paused: 'Pausada',
    delayed: 'Atrasada',
    finished: 'Finalizada',
    pending: 'Pendente',
    completed: 'Concluída',
  }
  return map[status] || status
}

export function isMissingTableError(error: any): boolean {
  if (!error) return false
  const msg = typeof error === 'string' ? error : error?.message || error?.details || ''
  const code = error?.code || ''
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    msg.includes('schema cache') ||
    msg.includes('Could not find the table') ||
    (msg.includes('relation') && msg.includes('does not exist'))
  )
}

export function formatSupabaseError(error: any): string {
  if (!error) return 'Erro desconhecido.'
  if (isMissingTableError(error)) {
    return 'A tabela correspondente ainda não foi criada no banco de dados Supabase. Execute o script SQL no Supabase SQL Editor.'
  }
  const msg = typeof error === 'string' ? error : error.message || ''
  if (msg.includes('JWT') || msg.includes('token') || msg.includes('auth')) {
    return 'Sessão expirada ou não autorizada. Faça login novamente.'
  }
  return msg || 'Ocorreu um erro ao comunicar com o servidor.'
}

export function formatErrorMessage(err: unknown): string {
  return formatSupabaseError(err)
}
