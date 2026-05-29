import { StatusObra } from '@/types'

export const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

export const formatDate = (dateStr: string) => {
  if (!dateStr) return '-'
  const [year, month, day] = dateStr.split('-')
  return `${day}/${month}/${year}`
}

export const getStatusColor = (status: StatusObra) => {
  switch (status) {
    case 'Em Andamento':
      return 'bg-blue-100 text-blue-800 border-blue-200'
    case 'Atrasada':
      return 'bg-red-100 text-red-800 border-red-200'
    case 'Planejada':
      return 'bg-slate-100 text-slate-800 border-slate-200'
    case 'Finalizada':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200'
    case 'Pausada':
      return 'bg-amber-100 text-amber-800 border-amber-200'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}
