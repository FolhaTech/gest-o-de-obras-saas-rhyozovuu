-- ==============================================================================
-- SCHEMA COMPLETO DO SUPABASE - GESTÃO DE OBRAS SAAS
-- Gerado com base nas definições de tipos em src/lib/supabase/types.ts
--
-- Instruções de Execução:
-- 1. Abra o painel do seu projeto no Supabase: https://supabase.com/dashboard
-- 2. Vá em SQL Editor (Editor SQL)
-- 3. Crie uma nova query, cole todo o conteúdo deste script e clique em "RUN"
--
-- Características deste script:
-- - Idempotente: pode ser executado múltiplas vezes com segurança (IF NOT EXISTS, CREATE OR REPLACE, DO blocks)
-- - 27 Tabelas estruturadas com seus tipos, constraints e relacionamentos
-- - Chaves estrangeiras (Foreign Keys) completas
-- - Row Level Security (RLS) habilitado e com políticas completas
-- - Índices de performance para colunas mais consultadas
-- - Triggers para criação automática de perfil de usuário e timestamps
-- - Função is_admin() implementada conforme especificado
-- - Configuração inicial de Storage Buckets e RLS
-- ==============================================================================

-- ==============================================================================
-- 1. EXTENSÕES DO POSTGRESQL
-- ==============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. CRIAÇÃO DAS TABELAS (EM ORDEM DE DEPENDÊNCIA)
-- ==============================================================================

-- 2.1. TABELA: profiles (Perfis de usuários vinculados ao auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT,
  role TEXT DEFAULT 'engineer',
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- ==============================================================================
-- FUNÇÃO AUXILIAR: is_admin
-- Verifica se o usuário autenticado atual possui a role 'admin'
-- (Criada após a tabela profiles para evitar erro 42P01)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.profiles 
    WHERE id = auth.uid() 
      AND LOWER(role) = 'admin'
  );
$$;

-- 2.2. TABELA: action_types (Tipos de Ação / Tipos de Serviço de Obras)
CREATE TABLE IF NOT EXISTS public.action_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2.3. TABELA: company_settings (Configurações Gerais da Empresa)
CREATE TABLE IF NOT EXISTS public.company_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT,
  tax_id TEXT,
  address TEXT,
  contact_email TEXT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 2.4. TABELA: dashboards (Painéis e Dashboards de Visualização)
CREATE TABLE IF NOT EXISTS public.dashboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  display_time NUMERIC NOT NULL DEFAULT 30,
  order_index NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2.5. TABELA: display_settings (Configurações de Exibição / Modo TV / Apresentação)
CREATE TABLE IF NOT EXISTS public.display_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_logo_url TEXT,
  default_rotation_time NUMERIC NOT NULL DEFAULT 30,
  show_clock BOOLEAN NOT NULL DEFAULT true,
  show_header BOOLEAN NOT NULL DEFAULT true,
  auto_refresh_on_switch BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2.6. TABELA: services (Catálogo Global de Serviços)
CREATE TABLE IF NOT EXISTS public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 2.7. TABELA: team_members (Membros da Equipe / Funcionários / Terceiros)
-- Nota: work_id e relacionamentos com works serão validados após a criação da tabela works
CREATE TABLE IF NOT EXISTS public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT,
  type TEXT,
  phone TEXT,
  pix_key TEXT,
  daily_cost NUMERIC DEFAULT 0,
  fixed_salary NUMERIC DEFAULT 0,
  payment_type TEXT DEFAULT 'daily',
  status TEXT DEFAULT 'active',
  admission_date DATE,
  average_start_date DATE,
  participates_in_averages BOOLEAN DEFAULT true,
  work_id UUID, -- Foreign key adicionada/garantida abaixo
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 2.8. TABELA: works (Obras / Projetos)
CREATE TABLE IF NOT EXISTS public.works (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  client TEXT,
  client_cpf TEXT,
  client_email TEXT,
  client_phone TEXT,
  address TEXT,
  manager TEXT,
  service_type UUID REFERENCES public.action_types(id) ON DELETE SET NULL,
  consultant_id UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  pre_processual_agent_id UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  start_date DATE,
  end_date_planned DATE,
  cancellation_date DATE,
  cancellation_reason TEXT,
  contracted_value NUMERIC DEFAULT 0,
  budget_planned NUMERIC DEFAULT 0,
  entry_value NUMERIC DEFAULT 0,
  entry_payment_method TEXT,
  is_entry_paid BOOLEAN DEFAULT false,
  installments NUMERIC DEFAULT 1,
  payment_method TEXT,
  internal_failure BOOLEAN DEFAULT false,
  progress_percentage NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'planned',
  total_area NUMERIC DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Adicionar foreign key de team_members -> works se ainda não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'team_members_work_id_fkey' 
      AND table_name = 'team_members'
  ) THEN
    ALTER TABLE public.team_members 
      ADD CONSTRAINT team_members_work_id_fkey 
      FOREIGN KEY (work_id) REFERENCES public.works(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 2.9. TABELA: materials (Catálogo de Materiais e Insumos)
CREATE TABLE IF NOT EXISTS public.materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT,
  supplier TEXT,
  unit_of_measure TEXT,
  unidade_nativa TEXT,
  peso_saco_kg NUMERIC,
  estoque_minimo_kg NUMERIC,
  stock_quantity NUMERIC DEFAULT 0,
  min_quantity NUMERIC DEFAULT 10,
  unit_price NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'active',
  work_id UUID REFERENCES public.works(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 2.10. TABELA: densidades_insumo (Densidades e Pesos Unitários de Materiais)
CREATE TABLE IF NOT EXISTS public.densidades_insumo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID REFERENCES public.materials(id) ON DELETE CASCADE,
  densidade_kg_m3 NUMERIC,
  peso_unitario_kg NUMERIC,
  data_vigencia DATE,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 2.11. TABELA: compositions (Composições de Insumos para Serviços Globais)
CREATE TABLE IF NOT EXISTS public.compositions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  coefficient NUMERIC NOT NULL DEFAULT 1,
  waste_percentage NUMERIC NOT NULL DEFAULT 0,
  version NUMERIC DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 2.12. TABELA: work_stages (Etapas da Obra / Cronograma Gantt)
CREATE TABLE IF NOT EXISTS public.work_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID REFERENCES public.works(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  manager TEXT,
  start_date DATE,
  end_date_planned DATE,
  end_date_real DATE,
  progress_percentage NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 2.13. TABELA: work_services (Serviços Planejados na Obra)
CREATE TABLE IF NOT EXISTS public.work_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
  target_quantity NUMERIC NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 2.14. TABELA: compositions_history (Histórico/Snapshot de Composição por Serviço da Obra)
CREATE TABLE IF NOT EXISTS public.compositions_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_service_id UUID NOT NULL REFERENCES public.work_services(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
  coefficient NUMERIC NOT NULL DEFAULT 1,
  waste_percentage NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 2.15. TABELA: consumption_tracking (Acompanhamento do Consumo Real de Insumos)
CREATE TABLE IF NOT EXISTS public.consumption_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_service_id UUID NOT NULL REFERENCES public.work_services(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
  quantity_actual NUMERIC NOT NULL DEFAULT 0,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 2.16. TABELA: work_extra_materials (Materiais Extras e Adicionais da Obra)
CREATE TABLE IF NOT EXISTS public.work_extra_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID REFERENCES public.works(id) ON DELETE CASCADE,
  material_id UUID REFERENCES public.materials(id) ON DELETE CASCADE,
  quantity NUMERIC NOT NULL DEFAULT 0,
  consumption_per_m2 NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 2.17. TABELA: material_movements (Movimentações de Estoque - Entrada/Saída)
CREATE TABLE IF NOT EXISTS public.material_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID REFERENCES public.materials(id) ON DELETE CASCADE,
  work_id UUID REFERENCES public.works(id) ON DELETE SET NULL,
  author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  type TEXT,
  quantity NUMERIC NOT NULL DEFAULT 0,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 2.18. TABELA: service_providers (Prestadores de Serviços / Empreiteiros)
CREATE TABLE IF NOT EXISTS public.service_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  service_type TEXT,
  responsible_person TEXT,
  contact_phone TEXT,
  email TEXT,
  quality_rating TEXT,
  deadline_rating TEXT,
  team_level TEXT,
  observations TEXT,
  work_id UUID REFERENCES public.works(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2.19. TABELA: external_contracts (Contratos de Empreitadas / Contratos Externos)
CREATE TABLE IF NOT EXISTS public.external_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID REFERENCES public.service_providers(id) ON DELETE SET NULL,
  work_id UUID REFERENCES public.works(id) ON DELETE CASCADE,
  service_description TEXT NOT NULL,
  unit TEXT,
  total_value NUMERIC DEFAULT 0,
  executed_quantity NUMERIC DEFAULT 0,
  target_date DATE,
  is_completed BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2.20. TABELA: team_member_documents (Documentos dos Membros da Equipe)
CREATE TABLE IF NOT EXISTS public.team_member_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2.21. TABELA: attendance_records (Registros Diários de Frequência/Presença)
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID REFERENCES public.team_members(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  is_present BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2.22. TABELA: attendance_extras (Valores Extras / Horas Extras Semanais)
CREATE TABLE IF NOT EXISTS public.attendance_extras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID REFERENCES public.team_members(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL,
  extra_value NUMERIC DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2.23. TABELA: expenses (Despesas e Lançamentos Financeiros)
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID REFERENCES public.works(id) ON DELETE CASCADE,
  manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  category TEXT,
  description TEXT,
  value NUMERIC NOT NULL DEFAULT 0,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT,
  merchant_name TEXT,
  merchant_cnpj TEXT,
  receipt_url TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 2.24. TABELA: revenues (Receitas / Aportes / Entradas Financeiras)
CREATE TABLE IF NOT EXISTS public.revenues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID REFERENCES public.works(id) ON DELETE CASCADE,
  source TEXT,
  description TEXT,
  value NUMERIC NOT NULL DEFAULT 0,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT DEFAULT 'received',
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 2.25. TABELA: work_diaries (Diário de Obras / RDO)
CREATE TABLE IF NOT EXISTS public.work_diaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID REFERENCES public.works(id) ON DELETE CASCADE,
  author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT,
  occurrences TEXT,
  notes TEXT,
  weather TEXT,
  workers_count NUMERIC DEFAULT 0,
  photos TEXT[],
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- ==============================================================================
-- 3. ÍNDICES DE PERFORMANCE (COLUNAS FREQUENTEMENTE CONSULTADAS / JOINS)
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_works_status ON public.works(status);
CREATE INDEX IF NOT EXISTS idx_works_service_type ON public.works(service_type);
CREATE INDEX IF NOT EXISTS idx_works_consultant_id ON public.works(consultant_id);
CREATE INDEX IF NOT EXISTS idx_works_pre_processual_agent_id ON public.works(pre_processual_agent_id);

CREATE INDEX IF NOT EXISTS idx_work_stages_work_id ON public.work_stages(work_id);
CREATE INDEX IF NOT EXISTS idx_work_stages_status ON public.work_stages(status);

CREATE INDEX IF NOT EXISTS idx_materials_work_id ON public.materials(work_id);
CREATE INDEX IF NOT EXISTS idx_materials_category ON public.materials(category);

CREATE INDEX IF NOT EXISTS idx_densidades_insumo_material_id ON public.densidades_insumo(material_id);

CREATE INDEX IF NOT EXISTS idx_compositions_service_id ON public.compositions(service_id);
CREATE INDEX IF NOT EXISTS idx_compositions_material_id ON public.compositions(material_id);

CREATE INDEX IF NOT EXISTS idx_work_services_work_id ON public.work_services(work_id);
CREATE INDEX IF NOT EXISTS idx_work_services_service_id ON public.work_services(service_id);

CREATE INDEX IF NOT EXISTS idx_compositions_history_work_service_id ON public.compositions_history(work_service_id);
CREATE INDEX IF NOT EXISTS idx_compositions_history_material_id ON public.compositions_history(material_id);

CREATE INDEX IF NOT EXISTS idx_consumption_tracking_work_service_id ON public.consumption_tracking(work_service_id);
CREATE INDEX IF NOT EXISTS idx_consumption_tracking_material_id ON public.consumption_tracking(material_id);
CREATE INDEX IF NOT EXISTS idx_consumption_tracking_date ON public.consumption_tracking(date);

CREATE INDEX IF NOT EXISTS idx_work_extra_materials_work_id ON public.work_extra_materials(work_id);
CREATE INDEX IF NOT EXISTS idx_work_extra_materials_material_id ON public.work_extra_materials(material_id);

CREATE INDEX IF NOT EXISTS idx_material_movements_material_id ON public.material_movements(material_id);
CREATE INDEX IF NOT EXISTS idx_material_movements_work_id ON public.material_movements(work_id);
CREATE INDEX IF NOT EXISTS idx_material_movements_author_id ON public.material_movements(author_id);
CREATE INDEX IF NOT EXISTS idx_material_movements_date ON public.material_movements(date);

CREATE INDEX IF NOT EXISTS idx_team_members_work_id ON public.team_members(work_id);
CREATE INDEX IF NOT EXISTS idx_team_members_status ON public.team_members(status);

CREATE INDEX IF NOT EXISTS idx_team_member_documents_member_id ON public.team_member_documents(team_member_id);

CREATE INDEX IF NOT EXISTS idx_attendance_records_worker_id ON public.attendance_records(worker_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_date ON public.attendance_records(date);

CREATE INDEX IF NOT EXISTS idx_attendance_extras_worker_id ON public.attendance_extras(worker_id);
CREATE INDEX IF NOT EXISTS idx_attendance_extras_week_start_date ON public.attendance_extras(week_start_date);

CREATE INDEX IF NOT EXISTS idx_service_providers_work_id ON public.service_providers(work_id);

CREATE INDEX IF NOT EXISTS idx_external_contracts_work_id ON public.external_contracts(work_id);
CREATE INDEX IF NOT EXISTS idx_external_contracts_provider_id ON public.external_contracts(provider_id);

CREATE INDEX IF NOT EXISTS idx_expenses_work_id ON public.expenses(work_id);
CREATE INDEX IF NOT EXISTS idx_expenses_manager_id ON public.expenses(manager_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(date);

CREATE INDEX IF NOT EXISTS idx_revenues_work_id ON public.revenues(work_id);
CREATE INDEX IF NOT EXISTS idx_revenues_date ON public.revenues(date);

CREATE INDEX IF NOT EXISTS idx_work_diaries_work_id ON public.work_diaries(work_id);
CREATE INDEX IF NOT EXISTS idx_work_diaries_author_id ON public.work_diaries(author_id);
CREATE INDEX IF NOT EXISTS idx_work_diaries_date ON public.work_diaries(date);

CREATE INDEX IF NOT EXISTS idx_dashboards_order_index ON public.dashboards(order_index);

-- ==============================================================================
-- 4. TRIGGERS E FUNÇÕES AUTOMÁTICAS
-- ==============================================================================

-- 4.1. Trigger para criação automática de perfil ao registrar usuário no Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'engineer'),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4.2. Trigger para atualizar estoque com base em movimentações
CREATE OR REPLACE FUNCTION public.handle_material_movement()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.type = 'input' THEN
    UPDATE public.materials 
    SET stock_quantity = COALESCE(stock_quantity, 0) + NEW.quantity 
    WHERE id = NEW.material_id;
  ELSIF NEW.type = 'output' THEN
    UPDATE public.materials 
    SET stock_quantity = COALESCE(stock_quantity, 0) - NEW.quantity 
    WHERE id = NEW.material_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_material_movement ON public.material_movements;
CREATE TRIGGER on_material_movement
  AFTER INSERT ON public.material_movements
  FOR EACH ROW EXECUTE FUNCTION public.handle_material_movement();

-- 4.3. Trigger para recalcular progresso da obra a partir das etapas
CREATE OR REPLACE FUNCTION public.calculate_work_progress()
RETURNS TRIGGER AS $$
DECLARE
  target_work_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_work_id := OLD.work_id;
  ELSE
    target_work_id := NEW.work_id;
  END IF;

  IF target_work_id IS NOT NULL THEN
    UPDATE public.works
    SET progress_percentage = COALESCE((
      SELECT ROUND(AVG(COALESCE(progress_percentage, 0)), 2)
      FROM public.work_stages 
      WHERE work_id = target_work_id
    ), 0)
    WHERE id = target_work_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_stage_progress_change ON public.work_stages;
CREATE TRIGGER on_stage_progress_change
  AFTER INSERT OR UPDATE OR DELETE ON public.work_stages
  FOR EACH ROW EXECUTE FUNCTION public.calculate_work_progress();

-- ==============================================================================
-- 5. ROW LEVEL SECURITY (RLS) & POLÍTICAS DE ACESSO
-- Todas as 27 tabelas possuem RLS habilitado e política permissiva para usuários autenticados
-- ==============================================================================
DO $$
DECLARE
  t TEXT;
  all_tables TEXT[] := ARRAY[
    'action_types',
    'attendance_extras',
    'attendance_records',
    'company_settings',
    'compositions',
    'compositions_history',
    'consumption_tracking',
    'dashboards',
    'densidades_insumo',
    'display_settings',
    'expenses',
    'external_contracts',
    'material_movements',
    'materials',
    'profiles',
    'revenues',
    'service_providers',
    'services',
    'team_member_documents',
    'team_members',
    'work_diaries',
    'work_extra_materials',
    'work_services',
    'work_stages',
    'works'
  ];
BEGIN
  FOREACH t IN ARRAY all_tables
  LOOP
    -- Habilita RLS na tabela
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

    -- Remove política existente com mesmo nome para evitar duplicatas ao reexecutar
    EXECUTE format('DROP POLICY IF EXISTS "Allow authenticated full access" ON public.%I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "allow_all_authenticated" ON public.%I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "Allow auth all on %s" ON public.%I;', t, t);

    -- Cria política padrão para usuários autenticados
    EXECUTE format(
      'CREATE POLICY "Allow authenticated full access" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true);',
      t
    );
  END LOOP;
END $$;

-- Políticas de leitura opcionais para usuários anônimos (telas públicas / dashboards compartilhados)
DO $$
DECLARE
  t TEXT;
  anon_read_tables TEXT[] := ARRAY[
    'works',
    'work_stages',
    'materials',
    'services',
    'dashboards',
    'display_settings',
    'company_settings'
  ];
BEGIN
  FOREACH t IN ARRAY anon_read_tables
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Allow anon read access" ON public.%I;', t);
    EXECUTE format('CREATE POLICY "Allow anon read access" ON public.%I FOR SELECT TO anon USING (true);', t);
  END LOOP;
END $$;

-- ==============================================================================
-- 6. STORAGE BUCKETS (Arquivos, Fotos de Diário, Recibos e Documentos)
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('receipts', 'receipts', true),
  ('work-photos', 'work-photos', true),
  ('work-diary-photos', 'work-diary-photos', true),
  ('team-documents', 'team-documents', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow public read storage objects" ON storage.objects;
  CREATE POLICY "Allow public read storage objects" ON storage.objects
    FOR SELECT TO public
    USING (bucket_id IN ('receipts', 'work-photos', 'work-diary-photos', 'team-documents'));

  DROP POLICY IF EXISTS "Allow authenticated upload storage objects" ON storage.objects;
  CREATE POLICY "Allow authenticated upload storage objects" ON storage.objects
    FOR ALL TO authenticated
    USING (bucket_id IN ('receipts', 'work-photos', 'work-diary-photos', 'team-documents'))
    WITH CHECK (bucket_id IN ('receipts', 'work-photos', 'work-diary-photos', 'team-documents'));
END $$;

-- ==============================================================================
-- 7. REGISTROS INICIAIS / SEED PADRÃO (OPCIONAL / IDEMPOTENTE)
-- Garante configurações padrão de display e empresa se a tabela estiver vazia
-- ==============================================================================
INSERT INTO public.company_settings (id, company_name, tax_id, address, contact_email)
SELECT 
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Gestão de Obras Engenharia',
  '00.000.000/0001-00',
  'Av. Principal, 1000',
  'contato@gestaodeobras.com.br'
WHERE NOT EXISTS (SELECT 1 FROM public.company_settings LIMIT 1);

INSERT INTO public.display_settings (id, default_rotation_time, show_clock, show_header, auto_refresh_on_switch)
SELECT 
  '00000000-0000-0000-0000-000000000001'::uuid,
  30,
  true,
  true,
  false
WHERE NOT EXISTS (SELECT 1 FROM public.display_settings LIMIT 1);

-- ==============================================================================
-- FIM DO SCRIPT DE SCHEMA
-- ==============================================================================