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
          full_name: string
          id: string
          role: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          full_name: string
          id: string
          role?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
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
      team_members: {
        Row: {
          created_at: string | null
          daily_cost: number | null
          id: string
          name: string
          phone: string | null
          role: string | null
          status: string | null
          type: string | null
          work_id: string | null
        }
        Insert: {
          created_at?: string | null
          daily_cost?: number | null
          id?: string
          name: string
          phone?: string | null
          role?: string | null
          status?: string | null
          type?: string | null
          work_id?: string | null
        }
        Update: {
          created_at?: string | null
          daily_cost?: number | null
          id?: string
          name?: string
          phone?: string | null
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
          client: string | null
          contracted_value: number | null
          created_at: string | null
          end_date_planned: string | null
          id: string
          manager: string | null
          name: string
          notes: string | null
          progress_percentage: number | null
          start_date: string | null
          status: string | null
          total_area: number | null
        }
        Insert: {
          address?: string | null
          budget_planned?: number | null
          client?: string | null
          contracted_value?: number | null
          created_at?: string | null
          end_date_planned?: string | null
          id?: string
          manager?: string | null
          name: string
          notes?: string | null
          progress_percentage?: number | null
          start_date?: string | null
          status?: string | null
          total_area?: number | null
        }
        Update: {
          address?: string | null
          budget_planned?: number | null
          client?: string | null
          contracted_value?: number | null
          created_at?: string | null
          end_date_planned?: string | null
          id?: string
          manager?: string | null
          name?: string
          notes?: string | null
          progress_percentage?: number | null
          start_date?: string | null
          status?: string | null
          total_area?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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

// ====== DATABASE EXTENDED CONTEXT (auto-generated) ======
// This section contains actual PostgreSQL column types, constraints, RLS policies,
// functions, triggers, indexes and materialized views not present in the type definitions above.
// IMPORTANT: The TypeScript types above map UUID, TEXT, VARCHAR all to "string".
// Use the COLUMN TYPES section below to know the real PostgreSQL type for each column.
// Always use the correct PostgreSQL type when writing SQL migrations.

// --- COLUMN TYPES (actual PostgreSQL types) ---
// Use this to know the real database type when writing migrations.
// "string" in TypeScript types above may be uuid, text, varchar, timestamptz, etc.
// Table: company_settings
//   id: uuid (not null, default: gen_random_uuid())
//   company_name: text (nullable)
//   tax_id: text (nullable)
//   address: text (nullable)
//   contact_email: text (nullable)
//   created_at: timestamp with time zone (nullable, default: now())
// Table: compositions
//   id: uuid (not null, default: gen_random_uuid())
//   service_id: uuid (not null)
//   material_id: uuid (not null)
//   coefficient: numeric (not null)
//   waste_percentage: numeric (not null, default: 0)
//   created_at: timestamp with time zone (nullable, default: now())
//   version: integer (nullable, default: 1)
// Table: compositions_history
//   id: uuid (not null, default: gen_random_uuid())
//   work_service_id: uuid (not null)
//   material_id: uuid (not null)
//   coefficient: numeric (not null)
//   waste_percentage: numeric (not null, default: 0)
//   created_at: timestamp with time zone (nullable, default: now())
// Table: consumption_tracking
//   id: uuid (not null, default: gen_random_uuid())
//   work_service_id: uuid (not null)
//   material_id: uuid (not null)
//   quantity_actual: numeric (not null)
//   date: date (not null)
//   created_at: timestamp with time zone (nullable, default: now())
// Table: densidades_insumo
//   id: uuid (not null, default: gen_random_uuid())
//   material_id: uuid (nullable)
//   densidade_kg_m3: numeric (nullable)
//   peso_unitario_kg: numeric (nullable)
//   data_vigencia: timestamp with time zone (nullable, default: now())
//   created_at: timestamp with time zone (nullable, default: now())
// Table: expenses
//   id: uuid (not null, default: gen_random_uuid())
//   work_id: uuid (nullable)
//   category: text (nullable)
//   description: text (nullable)
//   value: numeric (not null)
//   date: date (not null)
//   payment_method: text (nullable)
//   manager_id: uuid (nullable)
//   created_at: timestamp with time zone (nullable, default: now())
//   merchant_name: text (nullable)
//   merchant_cnpj: text (nullable)
//   receipt_url: text (nullable)
//   metadata: jsonb (nullable)
// Table: material_movements
//   id: uuid (not null, default: gen_random_uuid())
//   material_id: uuid (nullable)
//   work_id: uuid (nullable)
//   type: text (nullable)
//   quantity: numeric (not null)
//   date: date (not null)
//   author_id: uuid (nullable)
//   notes: text (nullable)
//   created_at: timestamp with time zone (nullable, default: now())
// Table: materials
//   id: uuid (not null, default: gen_random_uuid())
//   name: text (not null)
//   unit_of_measure: text (nullable)
//   supplier: text (nullable)
//   stock_quantity: numeric (nullable, default: 0)
//   min_quantity: numeric (nullable, default: 10)
//   category: text (nullable)
//   unit_price: numeric (nullable)
//   work_id: uuid (nullable)
//   status: text (nullable, default: 'active'::text)
//   created_at: timestamp with time zone (nullable, default: now())
//   unidade_nativa: text (nullable, default: 'kg'::text)
//   peso_saco_kg: numeric (nullable)
//   estoque_minimo_kg: numeric (nullable)
// Table: profiles
//   id: uuid (not null)
//   full_name: text (not null)
//   role: text (nullable, default: 'engineer'::text)
//   avatar_url: text (nullable)
//   created_at: timestamp with time zone (nullable, default: now())
// Table: revenues
//   id: uuid (not null, default: gen_random_uuid())
//   work_id: uuid (nullable)
//   source: text (nullable)
//   value: numeric (not null)
//   date: date (not null)
//   description: text (nullable)
//   status: text (nullable, default: 'received'::text)
//   created_at: timestamp with time zone (nullable, default: now())
// Table: services
//   id: uuid (not null, default: gen_random_uuid())
//   name: text (not null)
//   unit: text (not null)
//   created_at: timestamp with time zone (nullable, default: now())
// Table: team_members
//   id: uuid (not null, default: gen_random_uuid())
//   name: text (not null)
//   role: text (nullable)
//   phone: text (nullable)
//   type: text (nullable)
//   daily_cost: numeric (nullable)
//   work_id: uuid (nullable)
//   status: text (nullable, default: 'active'::text)
//   created_at: timestamp with time zone (nullable, default: now())
// Table: work_diaries
//   id: uuid (not null, default: gen_random_uuid())
//   work_id: uuid (nullable)
//   date: date (not null)
//   author_id: uuid (nullable)
//   description: text (nullable)
//   occurrences: text (nullable)
//   weather: text (nullable)
//   workers_count: integer (nullable)
//   notes: text (nullable)
//   photos: _text (nullable)
//   created_at: timestamp with time zone (nullable, default: now())
// Table: work_extra_materials
//   id: uuid (not null, default: gen_random_uuid())
//   work_id: uuid (nullable)
//   material_id: uuid (nullable)
//   quantity: numeric (not null)
//   notes: text (nullable)
//   created_at: timestamp with time zone (nullable, default: now())
//   consumption_per_m2: numeric (nullable)
// Table: work_services
//   id: uuid (not null, default: gen_random_uuid())
//   work_id: uuid (not null)
//   service_id: uuid (not null)
//   target_quantity: numeric (not null)
//   status: text (nullable, default: 'planned'::text)
//   created_at: timestamp with time zone (nullable, default: now())
// Table: work_stages
//   id: uuid (not null, default: gen_random_uuid())
//   work_id: uuid (nullable)
//   name: text (not null)
//   manager: text (nullable)
//   start_date: date (nullable)
//   end_date_planned: date (nullable)
//   end_date_real: date (nullable)
//   progress_percentage: numeric (nullable, default: 0)
//   status: text (nullable, default: 'pending'::text)
//   notes: text (nullable)
//   created_at: timestamp with time zone (nullable, default: now())
// Table: works
//   id: uuid (not null, default: gen_random_uuid())
//   name: text (not null)
//   client: text (nullable)
//   manager: text (nullable)
//   address: text (nullable)
//   start_date: date (nullable)
//   end_date_planned: date (nullable)
//   contracted_value: numeric (nullable)
//   budget_planned: numeric (nullable)
//   status: text (nullable, default: 'planned'::text)
//   progress_percentage: numeric (nullable, default: 0)
//   notes: text (nullable)
//   created_at: timestamp with time zone (nullable, default: now())
//   total_area: numeric (nullable, default: 0)

// --- CONSTRAINTS ---
// Table: company_settings
//   PRIMARY KEY company_settings_pkey: PRIMARY KEY (id)
// Table: compositions
//   FOREIGN KEY compositions_material_id_fkey: FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
//   PRIMARY KEY compositions_pkey: PRIMARY KEY (id)
//   FOREIGN KEY compositions_service_id_fkey: FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
// Table: compositions_history
//   FOREIGN KEY compositions_history_material_id_fkey: FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
//   PRIMARY KEY compositions_history_pkey: PRIMARY KEY (id)
//   FOREIGN KEY compositions_history_work_service_id_fkey: FOREIGN KEY (work_service_id) REFERENCES work_services(id) ON DELETE CASCADE
// Table: consumption_tracking
//   FOREIGN KEY consumption_tracking_material_id_fkey: FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
//   PRIMARY KEY consumption_tracking_pkey: PRIMARY KEY (id)
//   FOREIGN KEY consumption_tracking_work_service_id_fkey: FOREIGN KEY (work_service_id) REFERENCES work_services(id) ON DELETE CASCADE
// Table: densidades_insumo
//   FOREIGN KEY densidades_insumo_material_id_fkey: FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
//   PRIMARY KEY densidades_insumo_pkey: PRIMARY KEY (id)
// Table: expenses
//   FOREIGN KEY expenses_manager_id_fkey: FOREIGN KEY (manager_id) REFERENCES profiles(id) ON DELETE SET NULL
//   PRIMARY KEY expenses_pkey: PRIMARY KEY (id)
//   FOREIGN KEY expenses_work_id_fkey: FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
// Table: material_movements
//   FOREIGN KEY material_movements_author_id_fkey: FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE SET NULL
//   FOREIGN KEY material_movements_material_id_fkey: FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
//   PRIMARY KEY material_movements_pkey: PRIMARY KEY (id)
//   FOREIGN KEY material_movements_work_id_fkey: FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE SET NULL
// Table: materials
//   PRIMARY KEY materials_pkey: PRIMARY KEY (id)
//   FOREIGN KEY materials_work_id_fkey: FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE SET NULL
// Table: profiles
//   FOREIGN KEY profiles_id_fkey: FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
//   PRIMARY KEY profiles_pkey: PRIMARY KEY (id)
// Table: revenues
//   PRIMARY KEY revenues_pkey: PRIMARY KEY (id)
//   FOREIGN KEY revenues_work_id_fkey: FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
// Table: services
//   UNIQUE services_name_key: UNIQUE (name)
//   PRIMARY KEY services_pkey: PRIMARY KEY (id)
// Table: team_members
//   PRIMARY KEY team_members_pkey: PRIMARY KEY (id)
//   FOREIGN KEY team_members_work_id_fkey: FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE SET NULL
// Table: work_diaries
//   FOREIGN KEY work_diaries_author_id_fkey: FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE SET NULL
//   PRIMARY KEY work_diaries_pkey: PRIMARY KEY (id)
//   FOREIGN KEY work_diaries_work_id_fkey: FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
// Table: work_extra_materials
//   FOREIGN KEY work_extra_materials_material_id_fkey: FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
//   PRIMARY KEY work_extra_materials_pkey: PRIMARY KEY (id)
//   FOREIGN KEY work_extra_materials_work_id_fkey: FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
// Table: work_services
//   PRIMARY KEY work_services_pkey: PRIMARY KEY (id)
//   FOREIGN KEY work_services_service_id_fkey: FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
//   FOREIGN KEY work_services_work_id_fkey: FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
// Table: work_stages
//   PRIMARY KEY work_stages_pkey: PRIMARY KEY (id)
//   FOREIGN KEY work_stages_work_id_fkey: FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
// Table: works
//   PRIMARY KEY works_pkey: PRIMARY KEY (id)

// --- ROW LEVEL SECURITY POLICIES ---
// Table: company_settings
//   Policy "allow_all_authenticated" (ALL, PERMISSIVE) roles={authenticated}
//     USING: true
//     WITH CHECK: true
// Table: compositions
//   Policy "allow_all_authenticated" (ALL, PERMISSIVE) roles={authenticated}
//     USING: true
//     WITH CHECK: true
// Table: compositions_history
//   Policy "allow_all_authenticated" (ALL, PERMISSIVE) roles={authenticated}
//     USING: true
//     WITH CHECK: true
// Table: consumption_tracking
//   Policy "allow_all_authenticated" (ALL, PERMISSIVE) roles={authenticated}
//     USING: true
//     WITH CHECK: true
// Table: densidades_insumo
//   Policy "allow_all_authenticated" (ALL, PERMISSIVE) roles={authenticated}
//     USING: true
//     WITH CHECK: true
// Table: expenses
//   Policy "allow_all_authenticated" (ALL, PERMISSIVE) roles={authenticated}
//     USING: true
//     WITH CHECK: true
// Table: material_movements
//   Policy "allow_all_authenticated" (ALL, PERMISSIVE) roles={authenticated}
//     USING: true
//     WITH CHECK: true
// Table: materials
//   Policy "allow_all_authenticated" (ALL, PERMISSIVE) roles={authenticated}
//     USING: true
//     WITH CHECK: true
// Table: profiles
//   Policy "allow_all_authenticated" (ALL, PERMISSIVE) roles={authenticated}
//     USING: true
//     WITH CHECK: true
// Table: revenues
//   Policy "allow_all_authenticated" (ALL, PERMISSIVE) roles={authenticated}
//     USING: true
//     WITH CHECK: true
// Table: services
//   Policy "allow_all_authenticated" (ALL, PERMISSIVE) roles={authenticated}
//     USING: true
//     WITH CHECK: true
// Table: team_members
//   Policy "allow_all_authenticated" (ALL, PERMISSIVE) roles={authenticated}
//     USING: true
//     WITH CHECK: true
// Table: work_diaries
//   Policy "allow_all_authenticated" (ALL, PERMISSIVE) roles={authenticated}
//     USING: true
//     WITH CHECK: true
// Table: work_extra_materials
//   Policy "authenticated_delete" (DELETE, PERMISSIVE) roles={authenticated}
//     USING: true
//   Policy "authenticated_insert" (INSERT, PERMISSIVE) roles={authenticated}
//     WITH CHECK: true
//   Policy "authenticated_select" (SELECT, PERMISSIVE) roles={authenticated}
//     USING: true
//   Policy "authenticated_update" (UPDATE, PERMISSIVE) roles={authenticated}
//     USING: true
//     WITH CHECK: true
// Table: work_services
//   Policy "allow_all_authenticated" (ALL, PERMISSIVE) roles={authenticated}
//     USING: true
//     WITH CHECK: true
// Table: work_stages
//   Policy "allow_all_authenticated" (ALL, PERMISSIVE) roles={authenticated}
//     USING: true
//     WITH CHECK: true
// Table: works
//   Policy "allow_all_authenticated" (ALL, PERMISSIVE) roles={authenticated}
//     USING: true
//     WITH CHECK: true

// --- DATABASE FUNCTIONS ---
// FUNCTION calculate_work_progress()
//   CREATE OR REPLACE FUNCTION public.calculate_work_progress()
//    RETURNS trigger
//    LANGUAGE plpgsql
//   AS $function$
//   DECLARE
//     w_id UUID;
//   BEGIN
//     IF TG_OP = 'DELETE' THEN
//       w_id := OLD.work_id;
//     ELSE
//       w_id := NEW.work_id;
//     END IF;
//
//     UPDATE public.works
//     SET progress_percentage = COALESCE((
//       SELECT avg(progress_percentage) FROM public.work_stages WHERE work_id = w_id
//     ), 0)
//     WHERE id = w_id;
//
//     IF TG_OP = 'DELETE' THEN
//       RETURN OLD;
//     END IF;
//     RETURN NEW;
//   END;
//   $function$
//
// FUNCTION handle_material_movement()
//   CREATE OR REPLACE FUNCTION public.handle_material_movement()
//    RETURNS trigger
//    LANGUAGE plpgsql
//   AS $function$
//   BEGIN
//     IF NEW.type = 'input' THEN
//       UPDATE public.materials SET stock_quantity = stock_quantity + NEW.quantity WHERE id = NEW.material_id;
//     ELSIF NEW.type = 'output' THEN
//       UPDATE public.materials SET stock_quantity = stock_quantity - NEW.quantity WHERE id = NEW.material_id;
//     END IF;
//     RETURN NEW;
//   END;
//   $function$
//
// FUNCTION recalculate_extra_materials_on_area_update()
//   CREATE OR REPLACE FUNCTION public.recalculate_extra_materials_on_area_update()
//    RETURNS trigger
//    LANGUAGE plpgsql
//   AS $function$
//   BEGIN
//     IF OLD.total_area IS DISTINCT FROM NEW.total_area THEN
//       UPDATE public.work_extra_materials
//       SET quantity = CASE
//         WHEN COALESCE(NEW.total_area, 0) > 0 AND consumption_per_m2 > 0 THEN consumption_per_m2 * NEW.total_area
//         ELSE 0
//       END
//       WHERE work_id = NEW.id AND consumption_per_m2 IS NOT NULL;
//     END IF;
//     RETURN NEW;
//   END;
//   $function$
//
// FUNCTION rls_auto_enable()
//   CREATE OR REPLACE FUNCTION public.rls_auto_enable()
//    RETURNS event_trigger
//    LANGUAGE plpgsql
//    SECURITY DEFINER
//    SET search_path TO 'pg_catalog'
//   AS $function$
//   DECLARE
//     cmd record;
//   BEGIN
//     FOR cmd IN
//       SELECT *
//       FROM pg_event_trigger_ddl_commands()
//       WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
//         AND object_type IN ('table','partitioned table')
//     LOOP
//        IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
//         BEGIN
//           EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
//           RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
//         EXCEPTION
//           WHEN OTHERS THEN
//             RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
//         END;
//        ELSE
//           RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
//        END IF;
//     END LOOP;
//   END;
//   $function$
//
// FUNCTION snapshot_work_service_composition()
//   CREATE OR REPLACE FUNCTION public.snapshot_work_service_composition()
//    RETURNS trigger
//    LANGUAGE plpgsql
//   AS $function$
//   BEGIN
//       INSERT INTO public.compositions_history (work_service_id, material_id, coefficient, waste_percentage)
//       SELECT NEW.id, c.material_id, c.coefficient, c.waste_percentage
//       FROM public.compositions c
//       WHERE c.service_id = NEW.service_id;
//       RETURN NEW;
//   END;
//   $function$
//

// --- TRIGGERS ---
// Table: material_movements
//   on_material_movement: CREATE TRIGGER on_material_movement AFTER INSERT ON public.material_movements FOR EACH ROW EXECUTE FUNCTION handle_material_movement()
// Table: work_services
//   on_work_service_created: CREATE TRIGGER on_work_service_created AFTER INSERT ON public.work_services FOR EACH ROW EXECUTE FUNCTION snapshot_work_service_composition()
// Table: work_stages
//   on_stage_progress_change: CREATE TRIGGER on_stage_progress_change AFTER INSERT OR DELETE OR UPDATE ON public.work_stages FOR EACH ROW EXECUTE FUNCTION calculate_work_progress()
// Table: works
//   on_works_area_update: CREATE TRIGGER on_works_area_update AFTER UPDATE OF total_area ON public.works FOR EACH ROW EXECUTE FUNCTION recalculate_extra_materials_on_area_update()

// --- INDEXES ---
// Table: services
//   CREATE UNIQUE INDEX services_name_key ON public.services USING btree (name)
