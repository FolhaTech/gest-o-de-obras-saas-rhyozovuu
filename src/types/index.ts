export interface Obra {
  id: string
  name: string
  client: string | null
  manager: string | null
  address: string | null
  start_date: string | null
  end_date_planned: string | null
  contracted_value: number | null
  budget_planned: number | null
  total_area?: number | null
  status: 'planned' | 'in_progress' | 'paused' | 'delayed' | 'finished' | 'completed' | string
  progress_percentage: number | null
  notes: string | null
  created_at?: string | null
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
  unidade_nativa?: string | null
  unit_of_measure: string | null
  supplier: string | null
  stock_quantity: number | null
  min_quantity: number | null
  category: string | null
  unit_price: number | null
  work_id: string | null
  status: string | null
  peso_saco_kg?: number | null
  densidades_insumo?: { densidade_kg_m3: number | null; peso_unitario_kg: number | null }[]
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

export interface WorkerGroup {
  id: string
  name: string
  description?: string | null
  created_at?: string | null
}

export interface Equipe {
  id: string
  name: string
  role: string | null
  phone: string | null
  type: string | null
  daily_cost: number | null
  work_id: string | null
  group_id?: string | null
  status: string | null
  admission_date?: string | null
  pix_key?: string | null
  payment_type?: string | null
  created_at?: string | null
  works?: { name: string }
  worker_groups?: { id: string; name: string } | null
}

export interface TeamMemberDocument {
  id: string
  team_member_id: string
  name: string
  file_path: string
  file_type: string
  created_at: string
}

export interface UserProfile {
  id: string
  full_name: string
  email?: string | null
  role?: string | null
  avatar_url?: string | null
  last_login_at?: string | null
  created_at?: string | null
}

export interface ServiceProvider {
  id: string
  work_id?: string | null
  name: string
  service_type?: string | null
  contact_phone?: string | null
  email?: string | null
  responsible_person?: string | null
  quality_rating?: string | null
  deadline_rating?: string | null
  team_level?: string | null
  observations?: string | null
}

export interface AttendanceRecord {
  id: string
  worker_id: string
  date: string
  is_present: boolean
}

export interface AttendanceExtra {
  id: string
  worker_id: string
  week_start_date: string
  extra_value: number
  notes: string
}

export interface ExternalContract {
  id: string
  work_id?: string | null
  provider_id: string | null
  service_description: string
  unit?: string | null
  total_value?: number | null
  executed_quantity?: number | null
  target_date?: string | null
  is_completed?: boolean | null
  notes?: string | null
  service_providers?: { name: string } | null
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

export interface Service {
  id: string
  name: string
  unit: string
}

export interface Composition {
  id: string
  service_id: string
  material_id: string
  coefficient: number
  waste_percentage: number
  materials?: { name: string; unidade_nativa?: string; unit_of_measure: string }
}

export interface WorkService {
  id: string
  work_id: string
  service_id: string
  target_quantity: number
  status: string
  services?: { name: string; unit: string }
}

export interface CompositionHistory {
  id: string
  work_service_id: string
  material_id: string
  coefficient: number
  waste_percentage: number
  materials?: { id: string; name: string; unit_of_measure: string }
}

export interface ConsumptionTracking {
  id: string
  work_service_id: string
  material_id: string
  quantity_actual: number
  date: string
}

export interface AirbnbProperty {
  id: string
  work_id?: string | null
  name: string
  address: string
  daily_rate: number
  status?: string
  notes?: string | null
  created_at?: string
  work?: { name: string; address?: string | null; status?: string } | null
}

export interface AirbnbRental {
  id: string
  property_id: string
  guest_name?: string | null
  guests_count: number
  check_in: string
  check_out: string
  total_value: number
  notes?: string | null
  created_at?: string
}

export interface AirbnbTransaction {
  id: string
  property_id: string
  rental_id?: string | null
  type: 'revenue' | 'expense'
  category: string
  description: string
  value: number
  date: string
  created_at?: string
}

export type PlannerTaskStatus = 'pending' | 'in_progress' | 'completed'
export type PlannerTaskPriority = 'low' | 'medium' | 'high'

export interface PlannerAttachment {
  id: string
  task_id: string
  file_url: string
  file_name: string
  file_type: 'image' | 'video'
  created_at?: string
}

export interface PlannerTask {
  id: string
  work_id: string | null
  title: string
  description: string | null
  status: PlannerTaskStatus
  priority: PlannerTaskPriority
  progress_percentage?: number
  start_date: string | null
  due_date: string | null
  assignee_id: string | null
  created_by: string | null
  created_at?: string
  updated_at?: string
  // Relações em consultas
  works?: { id: string; name: string } | null
  team_members?: { id: string; name: string; role?: string | null; phone?: string | null } | null
  attachments?: PlannerAttachment[]
}
