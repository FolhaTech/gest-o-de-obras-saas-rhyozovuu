// AVOID UPDATING THIS FILE DIRECTLY. It is automatically generated.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5'
  }
  public: {
    Tables: {
      action_types: {
        Row: {
          active: boolean | null
          created_at: string
          id: string
          name: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          active?: boolean | null
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      attendance_extras: {
        Row: {
          created_at: string
          extra_value: number | null
          id: string
          notes: string | null
          week_start_date: string
          worker_id: string | null
        }
        Insert: {
          created_at?: string
          extra_value?: number | null
          id?: string
          notes?: string | null
          week_start_date: string
          worker_id?: string | null
        }
        Update: {
          created_at?: string
          extra_value?: number | null
          id?: string
          notes?: string | null
          week_start_date?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'attendance_extras_worker_id_fkey'
            columns: ['worker_id']
            isOneToOne: false
            referencedRelation: 'team_members'
            referencedColumns: ['id']
          },
        ]
      }
      attendance_records: {
        Row: {
          created_at: string
          date: string
          id: string
          is_present: boolean | null
          worker_id: string | null
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          is_present?: boolean | null
          worker_id?: string | null
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          is_present?: boolean | null
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'attendance_records_worker_id_fkey'
            columns: ['worker_id']
            isOneToOne: false
            referencedRelation: 'team_members'
            referencedColumns: ['id']
          },
        ]
      }
      company_settings: {
        Row: {
          address: string | null
          company_name: string | null
          contact_email: string | null
          created_at: string | null
          id: string
          tax_id: string | null
        }
        Insert: {
          address?: string | null
          company_name?: string | null
          contact_email?: string | null
          created_at?: string | null
          id?: string
          tax_id?: string | null
        }
        Update: {
          address?: string | null
          company_name?: string | null
          contact_email?: string | null
          created_at?: string | null
          id?: string
          tax_id?: string | null
        }
        Relationships: []
      }
      compositions: {
        Row: {
          coefficient: number
          created_at: string | null
          id: string
          material_id: string
          service_id: string
          version: number | null
          waste_percentage: number
        }
        Insert: {
          coefficient: number
          created_at?: string | null
          id?: string
          material_id: string
          service_id: string
          version?: number | null
          waste_percentage?: number
        }
        Update: {
          coefficient?: number
          created_at?: string | null
          id?: string
          material_id?: string
          service_id?: string
          version?: number | null
          waste_percentage?: number
        }
        Relationships: [
          {
            foreignKeyName: 'compositions_material_id_fkey'
            columns: ['material_id']
            isOneToOne: false
            referencedRelation: 'materials'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'compositions_service_id_fkey'
            columns: ['service_id']
            isOneToOne: false
            referencedRelation: 'services'
            referencedColumns: ['id']
          },
        ]
      }
      compositions_history: {
        Row: {
          coefficient: number
          created_at: string | null
          id: string
          material_id: string
          waste_percentage: number
          work_service_id: string
        }
        Insert: {
          coefficient: number
          created_at?: string | null
          id?: string
          material_id: string
          waste_percentage?: number
          work_service_id: string
        }
        Update: {
          coefficient?: number
          created_at?: string | null
          id?: string
          material_id?: string
          waste_percentage?: number
          work_service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'compositions_history_material_id_fkey'
            columns: ['material_id']
            isOneToOne: false
            referencedRelation: 'materials'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'compositions_history_work_service_id_fkey'
            columns: ['work_service_id']
            isOneToOne: false
            referencedRelation: 'work_services'
            referencedColumns: ['id']
          },
        ]
      }
      consumption_tracking: {
        Row: {
          created_at: string | null
          date: string
          id: string
          material_id: string
          quantity_actual: number
          work_service_id: string
        }
        Insert: {
          created_at?: string | null
          date: string
          id?: string
          material_id: string
          quantity_actual: number
          work_service_id: string
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          material_id?: string
          quantity_actual?: number
          work_service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'consumption_tracking_material_id_fkey'
            columns: ['material_id']
            isOneToOne: false
            referencedRelation: 'materials'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'consumption_tracking_work_service_id_fkey'
            columns: ['work_service_id']
            isOneToOne: false
            referencedRelation: 'work_services'
            referencedColumns: ['id']
          },
        ]
      }
      dashboards: {
        Row: {
          created_at: string
          display_time: number
          id: string
          is_active: boolean
          name: string
          order_index: number
          url: string
        }
        Insert: {
          created_at?: string
          display_time?: number
          id?: string
          is_active?: boolean
          name: string
          order_index?: number
          url: string
        }
        Update: {
          created_at?: string
          display_time?: number
          id?: string
          is_active?: boolean
          name?: string
          order_index?: number
          url?: string
        }
        Relationships: []
      }
      densidades_insumo: {
        Row: {
          created_at: string | null
          data_vigencia: string | null
          densidade_kg_m3: number | null
          id: string
          material_id: string | null
          peso_unitario_kg: number | null
        }
        Insert: {
          created_at?: string | null
          data_vigencia?: string | null
          densidade_kg_m3?: number | null
          id?: string
          material_id?: string | null
          peso_unitario_kg?: number | null
        }
        Update: {
          created_at?: string | null
          data_vigencia?: string | null
          densidade_kg_m3?: number | null
          id?: string
          material_id?: string | null
          peso_unitario_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'densidades_insumo_material_id_fkey'
            columns: ['material_id']
            isOneToOne: false
            referencedRelation: 'materials'
            referencedColumns: ['id']
          },
        ]
      }
      display_settings: {
        Row: {
          auto_refresh_on_switch: boolean
          company_logo_url: string | null
          created_at: string
          default_rotation_time: number
          id: string
          show_clock: boolean
          show_header: boolean
        }
        Insert: {
          auto_refresh_on_switch?: boolean
          company_logo_url?: string | null
          created_at?: string
          default_rotation_time?: number
          id?: string
          show_clock?: boolean
          show_header?: boolean
        }
        Update: {
          auto_refresh_on_switch?: boolean
          company_logo_url?: string | null
          created_at?: string
          default_rotation_time?: number
          id?: string
          show_clock?: boolean
          show_header?: boolean
        }
        Relationships: []
      }
      expenses: {
        Row: {
          category: string | null
          created_at: string | null
          date: string
          description: string | null
          id: string
          manager_id: string | null
          merchant_cnpj: string | null
          merchant_name: string | null
          metadata: Json | null
          payment_method: string | null
          receipt_url: string | null
          value: number
          work_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          date: string
          description?: string | null
          id?: string
          manager_id?: string | null
          merchant_cnpj?: string | null
          merchant_name?: string | null
          metadata?: Json | null
          payment_method?: string | null
          receipt_url?: string | null
          value: number
          work_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          date?: string
          description?: string | null
          id?: string
          manager_id?: string | null
          merchant_cnpj?: string | null
          merchant_name?: string | null
          metadata?: Json | null
          payment_method?: string | null
          receipt_url?: string | null
          value?: number
          work_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'expenses_manager_id_fkey'
            columns: ['manager_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'expenses_work_id_fkey'
            columns: ['work_id']
            isOneToOne: false
            referencedRelation: 'works'
            referencedColumns: ['id']
          },
        ]
      }
      external_contracts: {
        Row: {
          created_at: string
          executed_quantity: number | null
          id: string
          is_completed: boolean | null
          notes: string | null
          provider_id: string | null
          service_description: string
          target_date: string | null
          total_value: number | null
          unit: string | null
          work_id: string | null
        }
        Insert: {
          created_at?: string
          executed_quantity?: number | null
          id?: string
          is_completed?: boolean | null
          notes?: string | null
          provider_id?: string | null
          service_description: string
          target_date?: string | null
          total_value?: number | null
          unit?: string | null
          work_id?: string | null
        }
        Update: {
          created_at?: string
          executed_quantity?: number | null
          id?: string
          is_completed?: boolean | null
          notes?: string | null
          provider_id?: string | null
          service_description?: string
          target_date?: string | null
          total_value?: number | null
          unit?: string | null
          work_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'external_contracts_provider_id_fkey'
            columns: ['provider_id']
            isOneToOne: false
            referencedRelation: 'service_providers'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'external_contracts_work_id_fkey'
            columns: ['work_id']
            isOneToOne: false
            referencedRelation: 'works'
            referencedColumns: ['id']
          },
        ]
      }
      material_movements: {
        Row: {
          author_id: string | null
          created_at: string | null
          date: string
          id: string
          material_id: string | null
          notes: string | null
          quantity: number
          type: string | null
          work_id: string | null
        }
        Insert: {
          author_id?: string | null
          created_at?: string | null
          date: string
          id?: string
          material_id?: string | null
          notes?: string | null
          quantity: number
          type?: string | null
          work_id?: string | null
        }
        Update: {
          author_id?: string | null
          created_at?: string | null
          date?: string
          id?: string
          material_id?: string | null
          notes?: string | null
          quantity?: number
          type?: string | null
          work_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'material_movements_author_id_fkey'
            columns: ['author_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'material_movements_material_id_fkey'
            columns: ['material_id']
            isOneToOne: false
            referencedRelation: 'materials'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'material_movements_work_id_fkey'
            columns: ['work_id']
            isOneToOne: false
            referencedRelation: 'works'
            referencedColumns: ['id']
          },
        ]
      }
      materials: {
        Row: {
          category: string | null
          created_at: string | null
          estoque_minimo_kg: number | null
          id: string
          min_quantity: number | null
          name: string
          peso_saco_kg: number | null
          status: string | null
          stock_quantity: number | null
          supplier: string | null
          unidade_nativa: string | null
          unit_of_measure: string | null
          unit_price: number | null
          work_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          estoque_minimo_kg?: number | null
          id?: string
          min_quantity?: number | null
          name: string
          peso_saco_kg?: number | null
          status?: string | null
          stock_quantity?: number | null
          supplier?: string | null
          unidade_nativa?: string | null
          unit_of_measure?: string | null
          unit_price?: number | null
          work_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          estoque_minimo_kg?: number | null
          id?: string
          min_quantity?: number | null
          name?: string
          peso_saco_kg?: number | null
          status?: string | null
          stock_quantity?: number | null
          supplier?: string | null
          unidade_nativa?: string | null
          unit_of_measure?: string | null
          unit_price?: number | null
          work_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'materials_work_id_fkey'
            columns: ['work_id']
            isOneToOne: false
            referencedRelation: 'works'
            referencedColumns: ['id']
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          full_name: string
          id: string
          role: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name: string
          id: string
          role?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          role?: string | null
        }
        Relationships: []
      }
      revenues: {
        Row: {
          created_at: string | null
          date: string
          description: string | null
          id: string
          source: string | null
          status: string | null
          value: number
          work_id: string | null
        }
        Insert: {
          created_at?: string | null
          date: string
          description?: string | null
          id?: string
          source?: string | null
          status?: string | null
          value: number
          work_id?: string | null
        }
        Update: {
          created_at?: string | null
          date?: string
          description?: string | null
          id?: string
          source?: string | null
          status?: string | null
          value?: number
          work_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'revenues_work_id_fkey'
            columns: ['work_id']
            isOneToOne: false
            referencedRelation: 'works'
            referencedColumns: ['id']
          },
        ]
      }
      service_providers: {
        Row: {
          contact_phone: string | null
          created_at: string
          deadline_rating: string | null
          email: string | null
          id: string
          name: string
          observations: string | null
          quality_rating: string | null
          responsible_person: string | null
          service_type: string | null
          team_level: string | null
          work_id: string | null
        }
        Insert: {
          contact_phone?: string | null
          created_at?: string
          deadline_rating?: string | null
          email?: string | null
          id?: string
          name: string
          observations?: string | null
          quality_rating?: string | null
          responsible_person?: string | null
          service_type?: string | null
          team_level?: string | null
          work_id?: string | null
        }
        Update: {
          contact_phone?: string | null
          created_at?: string
          deadline_rating?: string | null
          email?: string | null
          id?: string
          name?: string
          observations?: string | null
          quality_rating?: string | null
          responsible_person?: string | null
          service_type?: string | null
          team_level?: string | null
          work_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'service_providers_work_id_fkey'
            columns: ['work_id']
            isOneToOne: false
            referencedRelation: 'works'
            referencedColumns: ['id']
          },
        ]
      }
      services: {
        Row: {
          created_at: string | null
          id: string
          name: string
          unit: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          unit: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          unit?: string
        }
        Relationships: []
      }
      team_member_documents: {
        Row: {
          created_at: string
          file_path: string
          file_type: string
          id: string
          name: string
          team_member_id: string
        }
        Insert: {
          created_at?: string
          file_path: string
          file_type: string
          id?: string
          name: string
          team_member_id: string
        }
        Update: {
          created_at?: string
          file_path?: string
          file_type?: string
          id?: string
          name?: string
          team_member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'team_member_documents_team_member_id_fkey'
            columns: ['team_member_id']
            isOneToOne: false
            referencedRelation: 'team_members'
            referencedColumns: ['id']
          },
        ]
      }
      team_members: {
        Row: {
          admission_date: string | null
          average_start_date: string | null
          created_at: string | null
          daily_cost: number | null
          fixed_salary: number | null
          id: string
          name: string
          participates_in_averages: boolean | null
          payment_type: string | null
          phone: string | null
          pix_key: string | null
          role: string | null
          status: string | null
          type: string | null
          work_id: string | null
        }
        Insert: {
          admission_date?: string | null
          average_start_date?: string | null
          created_at?: string | null
          daily_cost?: number | null
          fixed_salary?: number | null
          id?: string
          name: string
          participates_in_averages?: boolean | null
          payment_type?: string | null
          phone?: string | null
          pix_key?: string | null
          role?: string | null
          status?: string | null
          type?: string | null
          work_id?: string | null
        }
        Update: {
          admission_date?: string | null
          average_start_date?: string | null
          created_at?: string | null
          daily_cost?: number | null
          fixed_salary?: number | null
          id?: string
          name?: string
          participates_in_averages?: boolean | null
          payment_type?: string | null
          phone?: string | null
          pix_key?: string | null
          role?: string | null
          status?: string | null
          type?: string | null
          work_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'team_members_work_id_fkey'
            columns: ['work_id']
            isOneToOne: false
            referencedRelation: 'works'
            referencedColumns: ['id']
          },
        ]
      }
      work_diaries: {
        Row: {
          author_id: string | null
          created_at: string | null
          date: string
          description: string | null
          id: string
          notes: string | null
          occurrences: string | null
          photos: string[] | null
          weather: string | null
          work_id: string | null
          workers_count: number | null
        }
        Insert: {
          author_id?: string | null
          created_at?: string | null
          date: string
          description?: string | null
          id?: string
          notes?: string | null
          occurrences?: string | null
          photos?: string[] | null
          weather?: string | null
          work_id?: string | null
          workers_count?: number | null
        }
        Update: {
          author_id?: string | null
          created_at?: string | null
          date?: string
          description?: string | null
          id?: string
          notes?: string | null
          occurrences?: string | null
          photos?: string[] | null
          weather?: string | null
          work_id?: string | null
          workers_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'work_diaries_author_id_fkey'
            columns: ['author_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'work_diaries_work_id_fkey'
            columns: ['work_id']
            isOneToOne: false
            referencedRelation: 'works'
            referencedColumns: ['id']
          },
        ]
      }
      work_extra_materials: {
        Row: {
          consumption_per_m2: number | null
          created_at: string | null
          id: string
          material_id: string | null
          notes: string | null
          quantity: number
          work_id: string | null
        }
        Insert: {
          consumption_per_m2?: number | null
          created_at?: string | null
          id?: string
          material_id?: string | null
          notes?: string | null
          quantity: number
          work_id?: string | null
        }
        Update: {
          consumption_per_m2?: number | null
          created_at?: string | null
          id?: string
          material_id?: string | null
          notes?: string | null
          quantity?: number
          work_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'work_extra_materials_material_id_fkey'
            columns: ['material_id']
            isOneToOne: false
            referencedRelation: 'materials'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'work_extra_materials_work_id_fkey'
            columns: ['work_id']
            isOneToOne: false
            referencedRelation: 'works'
            referencedColumns: ['id']
          },
        ]
      }
      work_services: {
        Row: {
          created_at: string | null
          id: string
          service_id: string
          status: string | null
          target_quantity: number
          work_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          service_id: string
          status?: string | null
          target_quantity: number
          work_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          service_id?: string
          status?: string | null
          target_quantity?: number
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'work_services_service_id_fkey'
            columns: ['service_id']
            isOneToOne: false
            referencedRelation: 'services'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'work_services_work_id_fkey'
            columns: ['work_id']
            isOneToOne: false
            referencedRelation: 'works'
            referencedColumns: ['id']
          },
        ]
      }
      work_stages: {
        Row: {
          created_at: string | null
          end_date_planned: string | null
          end_date_real: string | null
          id: string
          manager: string | null
          name: string
          notes: string | null
          progress_percentage: number | null
          start_date: string | null
          status: string | null
          work_id: string | null
        }
        Insert: {
          created_at?: string | null
          end_date_planned?: string | null
          end_date_real?: string | null
          id?: string
          manager?: string | null
          name: string
          notes?: string | null
          progress_percentage?: number | null
          start_date?: string | null
          status?: string | null
          work_id?: string | null
        }
        Update: {
          created_at?: string | null
          end_date_planned?: string | null
          end_date_real?: string | null
          id?: string
          manager?: string | null
          name?: string
          notes?: string | null
          progress_percentage?: number | null
          start_date?: string | null
          status?: string | null
          work_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'work_stages_work_id_fkey'
            columns: ['work_id']
            isOneToOne: false
            referencedRelation: 'works'
            referencedColumns: ['id']
          },
        ]
      }
      works: {
        Row: {
          address: string | null
          budget_planned: number | null
          cancellation_date: string | null
          cancellation_reason: string | null
          client: string | null
          client_cpf: string | null
          client_email: string | null
          client_phone: string | null
          consultant_id: string | null
          contracted_value: number | null
          created_at: string | null
          end_date_planned: string | null
          entry_payment_method: string | null
          entry_value: number | null
          id: string
          installments: number | null
          internal_failure: boolean | null
          is_entry_paid: boolean | null
          manager: string | null
          name: string
          notes: string | null
          payment_method: string | null
          pre_processual_agent_id: string | null
          progress_percentage: number | null
          service_type: string | null
          start_date: string | null
          status: string | null
          total_area: number | null
        }
        Insert: {
          address?: string | null
          budget_planned?: number | null
          cancellation_date?: string | null
          cancellation_reason?: string | null
          client?: string | null
          client_cpf?: string | null
          client_email?: string | null
          client_phone?: string | null
          consultant_id?: string | null
          contracted_value?: number | null
          created_at?: string | null
          end_date_planned?: string | null
          entry_payment_method?: string | null
          entry_value?: number | null
          id?: string
          installments?: number | null
          internal_failure?: boolean | null
          is_entry_paid?: boolean | null
          manager?: string | null
          name: string
          notes?: string | null
          payment_method?: string | null
          pre_processual_agent_id?: string | null
          progress_percentage?: number | null
          service_type?: string | null
          start_date?: string | null
          status?: string | null
          total_area?: number | null
        }
        Update: {
          address?: string | null
          budget_planned?: number | null
          cancellation_date?: string | null
          cancellation_reason?: string | null
          client?: string | null
          client_cpf?: string | null
          client_email?: string | null
          client_phone?: string | null
          consultant_id?: string | null
          contracted_value?: number | null
          created_at?: string | null
          end_date_planned?: string | null
          entry_payment_method?: string | null
          entry_value?: number | null
          id?: string
          installments?: number | null
          internal_failure?: boolean | null
          is_entry_paid?: boolean | null
          manager?: string | null
          name?: string
          notes?: string | null
          payment_method?: string | null
          pre_processual_agent_id?: string | null
          progress_percentage?: number | null
          service_type?: string | null
          start_date?: string | null
          status?: string | null
          total_area?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'works_consultant_id_fkey'
            columns: ['consultant_id']
            isOneToOne: false
            referencedRelation: 'team_members'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'works_pre_processual_agent_id_fkey'
            columns: ['pre_processual_agent_id']
            isOneToOne: false
            referencedRelation: 'team_members'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'works_service_type_fkey'
            columns: ['service_type']
            isOneToOne: false
            referencedRelation: 'action_types'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
