export interface Obra {
  id: string
  name: string
  client: string
  manager: string
  address: string
  start_date: string
  end_date_planned: string
  contracted_value: number
  budget_planned: number
  status: 'planned' | 'in_progress' | 'paused' | 'delayed' | 'finished'
  progress_percentage: number
  notes: string
}

export interface Stage {
  id: string
  work_id: string
  name: string
  manager: string
  start_date: string
  end_date_planned: string
  end_date_real: string
  progress_percentage: number
  status: 'pending' | 'in_progress' | 'delayed' | 'completed'
  notes: string
}

export interface Diario {
  id: string
  work_id: string
  date: string
  author_id: string
  description: string
  occurrences: string
  weather: string
  workers_count: number
  notes: string
  photos: string[]
  works?: { name: string }
}

export interface Material {
  id: string
  name: string
  unit_of_measure: string
  supplier: string
  stock_quantity: number
  min_quantity: number
  category: string
  unit_price: number
  work_id: string
  status: string
}

export interface Despesa {
  id: string
  work_id: string
  category: string
  description: string
  value: number
  date: string
  payment_method: string
  manager_id: string
  merchant_name?: string
  merchant_cnpj?: string
  receipt_url?: string
  works?: { name: string }
}

export interface Equipe {
  id: string
  name: string
  role: string
  phone: string
  type: string
  daily_cost: number
  work_id: string
  status: string
  works?: { name: string }
}

export interface Receita {
  id: string
  work_id: string
  source: string
  value: number
  date: string
  description?: string
  status: string
  created_at: string
}
