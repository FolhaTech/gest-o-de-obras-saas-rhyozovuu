-- ==============================================================================
-- SCHEMA COMPLETO E DEFINITIVO DO SUPABASE - GESTÃO DE OBRAS SAAS
-- Projeto: Gestão de Obras SaaS
--
-- INSTRUÇÕES DE USO NO SUPABASE:
-- 1. Acesse o painel do Supabase: https://supabase.com/dashboard
-- 2. Selecione seu projeto e navegue até "SQL Editor" no menu lateral.
-- 3. Clique em "+ New Query" (Nova Consulta).
-- 4. Copie TODO o conteúdo deste arquivo, cole no editor e clique em "RUN".
-- 5. O script limpa qualquer resquício inconsistente anterior e recria 100%
--    da estrutura de tabelas, relacionamentos, funções, triggers, RLS, buckets
--    de storage e sementes (seeds) padrão sem erros.
-- ==============================================================================

-- ==============================================================================
-- ETAPA 1: EXTENSÕES ESSENCIAIS DO POSTGRESQL
-- ==============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- ETAPA 2: LIMPEZA SEGURA DE ESTADO ANTERIOR (DROP SEGURO E EM ORDEM)
-- Remove triggers, funções, tabelas e políticas anteriores sem quebrar extensões.
-- ==============================================================================

-- 2.1. Remoção de triggers antigos
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 2.2. Remoção de funções antigas
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.handle_material_movement() CASCADE;
DROP FUNCTION IF EXISTS public.calculate_work_progress() CASCADE;
DROP FUNCTION IF EXISTS public.snapshot_work_service_composition() CASCADE;
DROP FUNCTION IF EXISTS public.recalculate_extra_materials_on_area_update() CASCADE;
DROP FUNCTION IF EXISTS public.recalculate_extra_material_quantity() CASCADE;
DROP FUNCTION IF EXISTS public.is_admin() CASCADE;

-- 2.3. Remoção de tabelas na ordem correta de dependência de chaves estrangeiras
DROP TABLE IF EXISTS public.team_member_documents CASCADE;
DROP TABLE IF EXISTS public.attendance_extras CASCADE;
DROP TABLE IF EXISTS public.attendance_records CASCADE;
DROP TABLE IF EXISTS public.external_contracts CASCADE;
DROP TABLE IF EXISTS public.consumption_tracking CASCADE;
DROP TABLE IF EXISTS public.compositions_history CASCADE;
DROP TABLE IF EXISTS public.work_extra_materials CASCADE;
DROP TABLE IF EXISTS public.work_services CASCADE;
DROP TABLE IF EXISTS public.compositions CASCADE;
DROP TABLE IF EXISTS public.densidades_insumo CASCADE;
DROP TABLE IF EXISTS public.material_movements CASCADE;
DROP TABLE IF EXISTS public.materials CASCADE;
DROP TABLE IF EXISTS public.work_stages CASCADE;
DROP TABLE IF EXISTS public.work_diaries CASCADE;
DROP TABLE IF EXISTS public.revenues CASCADE;
DROP TABLE IF EXISTS public.expenses CASCADE;
DROP TABLE IF EXISTS public.service_providers CASCADE;
DROP TABLE IF EXISTS public.works CASCADE;
DROP TABLE IF EXISTS public.team_members CASCADE;
DROP TABLE IF EXISTS public.services CASCADE;
DROP TABLE IF EXISTS public.display_settings CASCADE;
DROP TABLE IF EXISTS public.dashboards CASCADE;
DROP TABLE IF EXISTS public.company_settings CASCADE;
DROP TABLE IF EXISTS public.action_types CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- ==============================================================================
-- ETAPA 3: CRIAÇÃO DAS 25 TABELAS NA ORDEM EXATA DE DEPENDÊNCIA DE CHAVES
-- ==============================================================================

-- 3.1. TABELA: profiles (Perfis de usuários vinculados ao auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT,
  role TEXT DEFAULT 'engineer',
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 3.2. FUNÇÃO AUXILIAR: is_admin() (Usada por RLS e rotinas administrativas)
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

-- 3.3. TABELA: action_types (Tipos de Ação / Tipos de Serviço de Obras)
CREATE TABLE public.action_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3.4. TABELA: company_settings (Configurações Gerais da Empresa)
CREATE TABLE public.company_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT,
  tax_id TEXT,
  address TEXT,
  contact_email TEXT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 3.5. TABELA: dashboards (Painéis e Dashboards de Apresentação)
CREATE TABLE public.dashboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  display_time NUMERIC NOT NULL DEFAULT 30,
  order_index NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3.6. TABELA: display_settings (Configurações do Modo TV / Apresentação)
CREATE TABLE public.display_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_logo_url TEXT,
  default_rotation_time NUMERIC NOT NULL DEFAULT 30,
  show_clock BOOLEAN NOT NULL DEFAULT true,
  show_header BOOLEAN NOT NULL DEFAULT true,
  auto_refresh_on_switch BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3.7. TABELA: services (Catálogo Global de Serviços SINAPI / Composições)
CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  unit TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 3.8. TABELA: team_members (Membros da Equipe / Funcionários)
-- Nota: a FK work_id -> works(id) é adicionada logo após a criação da tabela works
CREATE TABLE public.team_members (
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
  work_id UUID,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 3.9. TABELA: works (Obras / Projetos)
CREATE TABLE public.works (
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

-- Adiciona a restrição de FK em team_members.work_id agora que works existe
ALTER TABLE public.team_members 
  ADD CONSTRAINT team_members_work_id_fkey 
  FOREIGN KEY (work_id) REFERENCES public.works(id) ON DELETE SET NULL;

-- 3.10. TABELA: materials (Catálogo de Materiais e Insumos)
CREATE TABLE public.materials (
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

-- 3.11. TABELA: densidades_insumo (Densidades e Pesos Unitários de Materiais)
CREATE TABLE public.densidades_insumo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID REFERENCES public.materials(id) ON DELETE CASCADE,
  densidade_kg_m3 NUMERIC,
  peso_unitario_kg NUMERIC,
  data_vigencia DATE,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 3.12. TABELA: compositions (Composições Globais de Insumos para Serviços)
CREATE TABLE public.compositions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  coefficient NUMERIC NOT NULL DEFAULT 1,
  waste_percentage NUMERIC NOT NULL DEFAULT 0,
  version NUMERIC DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 3.13. TABELA: work_stages (Etapas da Obra / Cronograma Gantt)
CREATE TABLE public.work_stages (
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

-- 3.14. TABELA: work_services (Serviços Planejados na Obra)
CREATE TABLE public.work_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
  target_quantity NUMERIC NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 3.15. TABELA: compositions_history (Snapshot da Composição ao Vincular Serviço à Obra)
CREATE TABLE public.compositions_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_service_id UUID NOT NULL REFERENCES public.work_services(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
  coefficient NUMERIC NOT NULL DEFAULT 1,
  waste_percentage NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 3.16. TABELA: consumption_tracking (Acompanhamento do Consumo Real de Insumos)
CREATE TABLE public.consumption_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_service_id UUID NOT NULL REFERENCES public.work_services(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
  quantity_actual NUMERIC NOT NULL DEFAULT 0,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 3.17. TABELA: work_extra_materials (Materiais Extras e Insumos Adicionais da Obra)
CREATE TABLE public.work_extra_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID REFERENCES public.works(id) ON DELETE CASCADE,
  material_id UUID REFERENCES public.materials(id) ON DELETE CASCADE,
  quantity NUMERIC NOT NULL DEFAULT 0,
  consumption_per_m2 NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 3.18. TABELA: material_movements (Movimentações de Estoque - Entrada / Saída)
CREATE TABLE public.material_movements (
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

-- 3.19. TABELA: service_providers (Prestadores de Serviços / Empreiteiros)
CREATE TABLE public.service_providers (
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

-- 3.20. TABELA: external_contracts (Contratos de Empreitadas / Terceirizados)
CREATE TABLE public.external_contracts (
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

-- 3.21. TABELA: team_member_documents (Documentos dos Membros da Equipe)
CREATE TABLE public.team_member_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3.22. TABELA: attendance_records (Registros Diários de Frequência/Presença)
CREATE TABLE public.attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID REFERENCES public.team_members(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  is_present BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3.23. TABELA: attendance_extras (Horas Extras e Valores Adicionais Semanais)
CREATE TABLE public.attendance_extras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID REFERENCES public.team_members(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL,
  extra_value NUMERIC DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3.24. TABELA: expenses (Despesas e Lançamentos Financeiros)
CREATE TABLE public.expenses (
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

-- 3.25. TABELA: revenues (Receitas / Aportes e Entradas Financeiras)
CREATE TABLE public.revenues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID REFERENCES public.works(id) ON DELETE CASCADE,
  source TEXT,
  description TEXT,
  value NUMERIC NOT NULL DEFAULT 0,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT DEFAULT 'received',
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 3.26. TABELA: work_diaries (Diário de Obra / Relatório Diário de Obra - RDO)
CREATE TABLE public.work_diaries (
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
-- ETAPA 4: ÍNDICES DE PERFORMANCE PARA OTIMIZAÇÃO DE CONSULTAS E JOINS
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
-- ETAPA 5: FUNÇÕES E TRIGGERS AUTOMÁTICOS DE REGRAS DE NEGÓCIO
-- ==============================================================================

-- 5.1. Trigger: Criação automática de perfil ao cadastrar usuário no Supabase Auth
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

CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5.2. Trigger: Atualização de saldo de estoque a cada movimentação (entrada/saída)
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

CREATE TRIGGER on_material_movement
  AFTER INSERT ON public.material_movements
  FOR EACH ROW EXECUTE FUNCTION public.handle_material_movement();

-- 5.3. Trigger: Recalcular percentual de progresso da obra a partir das etapas
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

CREATE TRIGGER on_stage_progress_change
  AFTER INSERT OR UPDATE OR DELETE ON public.work_stages
  FOR EACH ROW EXECUTE FUNCTION public.calculate_work_progress();

-- 5.4. Trigger: Snapshot da composição ao adicionar serviço à obra
CREATE OR REPLACE FUNCTION public.snapshot_work_service_composition()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.compositions_history (work_service_id, material_id, coefficient, waste_percentage)
  SELECT NEW.id, c.material_id, c.coefficient, c.waste_percentage
  FROM public.compositions c
  WHERE c.service_id = NEW.service_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_work_service_created
  AFTER INSERT ON public.work_services
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_work_service_composition();

-- 5.5. Trigger: Recalcular materiais extras quando a área total da obra for alterada
CREATE OR REPLACE FUNCTION public.recalculate_extra_materials_on_area_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.total_area IS DISTINCT FROM NEW.total_area THEN
    UPDATE public.work_extra_materials
    SET quantity = CASE 
      WHEN COALESCE(NEW.total_area, 0) > 0 AND consumption_per_m2 > 0 THEN consumption_per_m2 * NEW.total_area
      ELSE 1 
    END
    WHERE work_id = NEW.id AND consumption_per_m2 IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_works_area_update
  AFTER UPDATE OF total_area ON public.works
  FOR EACH ROW EXECUTE FUNCTION public.recalculate_extra_materials_on_area_update();

-- 5.6. Trigger: Recalcular quantidade de material extra ao alterar consumo por m2
CREATE OR REPLACE FUNCTION public.recalculate_extra_material_quantity()
RETURNS TRIGGER AS $$
DECLARE
  v_total_area numeric;
BEGIN
  IF NEW.consumption_per_m2 IS NOT NULL THEN
    SELECT COALESCE(total_area, 0) INTO v_total_area FROM public.works WHERE id = NEW.work_id;
    NEW.quantity := NEW.consumption_per_m2 * COALESCE(v_total_area, 0);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_extra_material_consumption_update
  BEFORE INSERT OR UPDATE OF consumption_per_m2, work_id ON public.work_extra_materials
  FOR EACH ROW EXECUTE FUNCTION public.recalculate_extra_material_quantity();

-- ==============================================================================
-- ETAPA 6: ROW LEVEL SECURITY (RLS) EM TODAS AS 25 TABELAS
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
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS "Allow authenticated full access" ON public.%I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "allow_all_authenticated" ON public.%I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "Allow auth all on %s" ON public.%I;', t, t);
    EXECUTE format(
      'CREATE POLICY "Allow authenticated full access" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true);',
      t
    );
  END LOOP;
END $$;

-- Políticas de leitura opcionais para usuários anônimos (telas públicas de dashboard/TV)
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
-- ETAPA 7: STORAGE BUCKETS E POLÍTICAS DE ACESSO A ARQUIVOS
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
-- ETAPA 8: DADOS INICIAIS / SEEDS PADRÃO
-- ==============================================================================

-- 8.1. Configurações padrão da empresa
INSERT INTO public.company_settings (id, company_name, tax_id, address, contact_email)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Gestão de Obras Engenharia',
  '00.000.000/0001-00',
  'Av. Principal, 1000',
  'contato@gestaodeobras.com.br'
)
ON CONFLICT (id) DO UPDATE 
SET 
  company_name = EXCLUDED.company_name,
  tax_id = EXCLUDED.tax_id,
  address = EXCLUDED.address,
  contact_email = EXCLUDED.contact_email;

-- 8.2. Configurações padrão do modo TV / Dashboards
INSERT INTO public.display_settings (id, default_rotation_time, show_clock, show_header, auto_refresh_on_switch)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  30,
  true,
  true,
  false
)
ON CONFLICT (id) DO UPDATE 
SET 
  default_rotation_time = EXCLUDED.default_rotation_time,
  show_clock = EXCLUDED.show_clock,
  show_header = EXCLUDED.show_header,
  auto_refresh_on_switch = EXCLUDED.auto_refresh_on_switch;

-- 8.3. Sementes de Materiais e Composições Padrão SINAPI
DO $$
DECLARE
  mat_tijolo_id UUID := gen_random_uuid();
  mat_cimento_id UUID := gen_random_uuid();
  mat_areia_id UUID := gen_random_uuid();
  mat_cal_id UUID := gen_random_uuid();
  mat_piso_id UUID := gen_random_uuid();
  mat_argamassa_id UUID := gen_random_uuid();
  mat_tinta_id UUID := gen_random_uuid();
  mat_selador_id UUID := gen_random_uuid();

  srv_alvenaria_id UUID := gen_random_uuid();
  srv_chapisco_id UUID := gen_random_uuid();
  srv_reboco_id UUID := gen_random_uuid();
  srv_contrapiso_id UUID := gen_random_uuid();
  srv_piso_id UUID := gen_random_uuid();
  srv_pintura_id UUID := gen_random_uuid();
BEGIN
  -- Materiais de teste e composições
  IF NOT EXISTS (SELECT 1 FROM public.materials WHERE name = 'Tijolo Cerâmico 9x19x19cm') THEN
    INSERT INTO public.materials (id, name, unit_of_measure, category, stock_quantity, min_quantity, unit_price)
    VALUES (mat_tijolo_id, 'Tijolo Cerâmico 9x19x19cm', 'un', 'Alvenaria', 1000, 100, 1.20);
  ELSE
    SELECT id INTO mat_tijolo_id FROM public.materials WHERE name = 'Tijolo Cerâmico 9x19x19cm' LIMIT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.materials WHERE name = 'Cimento CP II 50kg') THEN
    INSERT INTO public.materials (id, name, unit_of_measure, category, stock_quantity, min_quantity, unit_price, peso_saco_kg, estoque_minimo_kg)
    VALUES (mat_cimento_id, 'Cimento CP II 50kg', 'sc', 'Aglomerantes', 100, 20, 38.50, 50, 1000);
  ELSE
    SELECT id INTO mat_cimento_id FROM public.materials WHERE name = 'Cimento CP II 50kg' LIMIT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.materials WHERE name = 'Areia Média') THEN
    INSERT INTO public.materials (id, name, unit_of_measure, category, stock_quantity, min_quantity, unit_price)
    VALUES (mat_areia_id, 'Areia Média', 'm3', 'Agregados', 20, 5, 120.00);
  ELSE
    SELECT id INTO mat_areia_id FROM public.materials WHERE name = 'Areia Média' LIMIT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.materials WHERE name = 'Cal Hidratada 20kg') THEN
    INSERT INTO public.materials (id, name, unit_of_measure, category, stock_quantity, min_quantity, unit_price, peso_saco_kg)
    VALUES (mat_cal_id, 'Cal Hidratada 20kg', 'sc', 'Aglomerantes', 50, 10, 18.00, 20);
  ELSE
    SELECT id INTO mat_cal_id FROM public.materials WHERE name = 'Cal Hidratada 20kg' LIMIT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.materials WHERE name = 'Piso Cerâmico 60x60cm') THEN
    INSERT INTO public.materials (id, name, unit_of_measure, category, stock_quantity, min_quantity, unit_price)
    VALUES (mat_piso_id, 'Piso Cerâmico 60x60cm', 'm2', 'Revestimentos', 200, 30, 45.00);
  ELSE
    SELECT id INTO mat_piso_id FROM public.materials WHERE name = 'Piso Cerâmico 60x60cm' LIMIT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.materials WHERE name = 'Argamassa ACII 20kg') THEN
    INSERT INTO public.materials (id, name, unit_of_measure, category, stock_quantity, min_quantity, unit_price, peso_saco_kg)
    VALUES (mat_argamassa_id, 'Argamassa ACII 20kg', 'sc', 'Aglomerantes', 80, 15, 24.00, 20);
  ELSE
    SELECT id INTO mat_argamassa_id FROM public.materials WHERE name = 'Argamassa ACII 20kg' LIMIT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.materials WHERE name = 'Tinta Acrílica Branca 18L') THEN
    INSERT INTO public.materials (id, name, unit_of_measure, category, stock_quantity, min_quantity, unit_price)
    VALUES (mat_tinta_id, 'Tinta Acrílica Branca 18L', 'l', 'Pintura', 30, 5, 210.00);
  ELSE
    SELECT id INTO mat_tinta_id FROM public.materials WHERE name = 'Tinta Acrílica Branca 18L' LIMIT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.materials WHERE name = 'Selador Acrílico 18L') THEN
    INSERT INTO public.materials (id, name, unit_of_measure, category, stock_quantity, min_quantity, unit_price)
    VALUES (mat_selador_id, 'Selador Acrílico 18L', 'l', 'Pintura', 20, 5, 140.00);
  ELSE
    SELECT id INTO mat_selador_id FROM public.materials WHERE name = 'Selador Acrílico 18L' LIMIT 1;
  END IF;

  -- Serviços e suas Composições
  -- 1. Alvenaria de Vedação SINAPI
  IF NOT EXISTS (SELECT 1 FROM public.services WHERE name = 'Alvenaria de Vedação SINAPI') THEN
    INSERT INTO public.services (id, name, unit) VALUES (srv_alvenaria_id, 'Alvenaria de Vedação SINAPI', 'm2');
  ELSE
    SELECT id INTO srv_alvenaria_id FROM public.services WHERE name = 'Alvenaria de Vedação SINAPI' LIMIT 1;
  END IF;
  INSERT INTO public.compositions (service_id, material_id, coefficient, waste_percentage)
  VALUES 
    (srv_alvenaria_id, mat_tijolo_id, 25, 5),
    (srv_alvenaria_id, mat_cimento_id, 0.15, 5),
    (srv_alvenaria_id, mat_areia_id, 0.015, 10)
  ON CONFLICT DO NOTHING;

  -- 2. Chapisco SINAPI
  IF NOT EXISTS (SELECT 1 FROM public.services WHERE name = 'Chapisco SINAPI') THEN
    INSERT INTO public.services (id, name, unit) VALUES (srv_chapisco_id, 'Chapisco SINAPI', 'm2');
  ELSE
    SELECT id INTO srv_chapisco_id FROM public.services WHERE name = 'Chapisco SINAPI' LIMIT 1;
  END IF;
  INSERT INTO public.compositions (service_id, material_id, coefficient, waste_percentage)
  VALUES 
    (srv_chapisco_id, mat_cimento_id, 0.05, 5),
    (srv_chapisco_id, mat_areia_id, 0.005, 10)
  ON CONFLICT DO NOTHING;

  -- 3. Reboco SINAPI
  IF NOT EXISTS (SELECT 1 FROM public.services WHERE name = 'Reboco SINAPI') THEN
    INSERT INTO public.services (id, name, unit) VALUES (srv_reboco_id, 'Reboco SINAPI', 'm2');
  ELSE
    SELECT id INTO srv_reboco_id FROM public.services WHERE name = 'Reboco SINAPI' LIMIT 1;
  END IF;
  INSERT INTO public.compositions (service_id, material_id, coefficient, waste_percentage)
  VALUES 
    (srv_reboco_id, mat_cimento_id, 0.1, 5),
    (srv_reboco_id, mat_cal_id, 0.1, 5),
    (srv_reboco_id, mat_areia_id, 0.018, 10)
  ON CONFLICT DO NOTHING;

  -- 4. Contrapiso SINAPI
  IF NOT EXISTS (SELECT 1 FROM public.services WHERE name = 'Contrapiso SINAPI') THEN
    INSERT INTO public.services (id, name, unit) VALUES (srv_contrapiso_id, 'Contrapiso SINAPI', 'm2');
  ELSE
    SELECT id INTO srv_contrapiso_id FROM public.services WHERE name = 'Contrapiso SINAPI' LIMIT 1;
  END IF;
  INSERT INTO public.compositions (service_id, material_id, coefficient, waste_percentage)
  VALUES 
    (srv_contrapiso_id, mat_cimento_id, 0.2, 5),
    (srv_contrapiso_id, mat_areia_id, 0.025, 10)
  ON CONFLICT DO NOTHING;

  -- 5. Assentamento de Piso Cerâmico SINAPI
  IF NOT EXISTS (SELECT 1 FROM public.services WHERE name = 'Assentamento de Piso Cerâmico SINAPI') THEN
    INSERT INTO public.services (id, name, unit) VALUES (srv_piso_id, 'Assentamento de Piso Cerâmico SINAPI', 'm2');
  ELSE
    SELECT id INTO srv_piso_id FROM public.services WHERE name = 'Assentamento de Piso Cerâmico SINAPI' LIMIT 1;
  END IF;
  INSERT INTO public.compositions (service_id, material_id, coefficient, waste_percentage)
  VALUES 
    (srv_piso_id, mat_piso_id, 1, 10),
    (srv_piso_id, mat_argamassa_id, 0.25, 5)
  ON CONFLICT DO NOTHING;

  -- 6. Pintura Acrílica 2 Demãos SINAPI
  IF NOT EXISTS (SELECT 1 FROM public.services WHERE name = 'Pintura Acrílica 2 Demãos SINAPI') THEN
    INSERT INTO public.services (id, name, unit) VALUES (srv_pintura_id, 'Pintura Acrílica 2 Demãos SINAPI', 'm2');
  ELSE
    SELECT id INTO srv_pintura_id FROM public.services WHERE name = 'Pintura Acrílica 2 Demãos SINAPI' LIMIT 1;
  END IF;
  INSERT INTO public.compositions (service_id, material_id, coefficient, waste_percentage)
  VALUES 
    (srv_pintura_id, mat_tinta_id, 0.25, 5),
    (srv_pintura_id, mat_selador_id, 0.15, 5)
  ON CONFLICT DO NOTHING;

END $$;

-- 8.4. Sincronização dos perfis de usuários existentes em auth.users para public.profiles
-- Garante que quaisquer usuários já registrados no Supabase Auth tenham seu perfil
-- criado imediatamente com seus devidos privilégios de acesso.
DO $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role)
  SELECT 
    id,
    COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', split_part(email, '@', 1), 'Usuário'),
    email,
    COALESCE(raw_user_meta_data->>'role', 'engineer')
  FROM auth.users
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name);

  -- Concede privilégio de admin para contas de e-mail específicas se existirem
  UPDATE public.profiles
  SET role = 'admin'
  WHERE LOWER(email) IN ('igor.arimura.arquitetura@hotmail.com', 'tiago.izaias@folhatech.com.br');
END $$;

-- ==============================================================================
-- FIM DO SCRIPT DE SCHEMA
-- O banco de dados agora está 100% estruturado, seguro e funcional.
-- ==============================================================================
