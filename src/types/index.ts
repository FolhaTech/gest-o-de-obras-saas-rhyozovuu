export type StatusObra = 'Planejada' | 'Em Andamento' | 'Pausada' | 'Atrasada' | 'Finalizada'

export interface Obra {
  id: string
  name: string
  client: string
  address: string
  startDate: string
  plannedEndDate: string
  budget: number
  status: StatusObra
  progress: number
  manager: string
}

export interface Stage {
  id: string
  obraId: string
  name: string
  progress: number
  status: 'Pendente' | 'Em Andamento' | 'Concluída'
  responsible: string
}

export interface Diario {
  id: string
  obraId: string
  date: string
  weather: 'Ensolarado' | 'Chuvoso' | 'Nublado'
  workers: number
  occurrences: string
  photos: string[]
}

export interface Material {
  id: string
  name: string
  unit: string
  quantity: number
  minQuantity: number
  category: string
}

export interface MaterialMovement {
  id: string
  materialId: string
  obraId: string
  type: 'Entrada' | 'Saída' | 'Transferência'
  quantity: number
  date: string
}

export interface Despesa {
  id: string
  obraId: string
  description: string
  amount: number
  category: 'Materiais' | 'Mão de Obra' | 'Equipamentos' | 'Outros'
  date: string
}

export interface Equipe {
  id: string
  name: string
  role: string
  type: 'Própria' | 'Terceirizada'
  dailyCost: number
  active: boolean
}
