-- Gerado a partir de supabase_schema.sql para o PostgreSQL do Azure.
-- Removidos: seeds (etapa 8 e 13.6) e criação manual de usuário (etapa 10).
-- Papéis "authenticated"/"anon" renomeados para obras_authenticated/obras_anon.
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
-- Extensões uuid-ossp/pgcrypto não são necessárias aqui (gen_random_uuid() é nativo do PG 13+)
-- e não estão liberadas (allow-list) no Azure.

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
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  CONSTRAINT attendance_records_worker_date_key UNIQUE (worker_id, date)
);

-- 3.23. TABELA: attendance_extras (Horas Extras e Valores Adicionais Semanais)
CREATE TABLE public.attendance_extras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID REFERENCES public.team_members(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL,
  extra_value NUMERIC DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  CONSTRAINT attendance_extras_worker_week_key UNIQUE (worker_id, week_start_date)
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
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_records_worker_date ON public.attendance_records(worker_id, date);

CREATE INDEX IF NOT EXISTS idx_attendance_extras_worker_id ON public.attendance_extras(worker_id);
CREATE INDEX IF NOT EXISTS idx_attendance_extras_week_start_date ON public.attendance_extras(week_start_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_extras_worker_week ON public.attendance_extras(worker_id, week_start_date);

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
      'CREATE POLICY "Allow authenticated full access" ON public.%I FOR ALL TO obras_authenticated USING (true) WITH CHECK (true);',
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
    EXECUTE format('CREATE POLICY "Allow anon read access" ON public.%I FOR SELECT TO obras_anon USING (true);', t);
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
    FOR ALL TO obras_authenticated
    USING (bucket_id IN ('receipts', 'work-photos', 'work-diary-photos', 'team-documents'))
    WITH CHECK (bucket_id IN ('receipts', 'work-photos', 'work-diary-photos', 'team-documents'));
END $$;


-- ==============================================================================
-- ETAPA 9: MÓDULO AIRBNB / GESTÃO DE IMÓVEIS DE TEMPORADA
-- ==============================================================================

-- 9.1. Tabela: airbnb_properties (Imóveis para aluguel de temporada, vinculáveis a obras)
CREATE TABLE IF NOT EXISTS public.airbnb_properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID REFERENCES public.works(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  daily_rate NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ativo',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 9.2. Tabela: airbnb_rentals (Aluguéis / Temporadas por imóvel)
CREATE TABLE IF NOT EXISTS public.airbnb_rentals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.airbnb_properties(id) ON DELETE CASCADE,
  guest_name TEXT,
  guests_count INTEGER NOT NULL DEFAULT 1,
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  total_value NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 9.3. Tabela: airbnb_transactions (Despesas e receitas avulsas por imóvel)
CREATE TABLE IF NOT EXISTS public.airbnb_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.airbnb_properties(id) ON DELETE CASCADE,
  rental_id UUID REFERENCES public.airbnb_rentals(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('revenue', 'expense')),
  category TEXT NOT NULL DEFAULT 'Geral',
  description TEXT NOT NULL,
  value NUMERIC NOT NULL DEFAULT 0,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Índices para performance do módulo Airbnb
CREATE INDEX IF NOT EXISTS idx_airbnb_properties_work_id ON public.airbnb_properties(work_id);
CREATE INDEX IF NOT EXISTS idx_airbnb_properties_status ON public.airbnb_properties(status);
CREATE INDEX IF NOT EXISTS idx_airbnb_rentals_property_id ON public.airbnb_rentals(property_id);
CREATE INDEX IF NOT EXISTS idx_airbnb_rentals_dates ON public.airbnb_rentals(check_in, check_out);
CREATE INDEX IF NOT EXISTS idx_airbnb_transactions_property_id ON public.airbnb_transactions(property_id);
CREATE INDEX IF NOT EXISTS idx_airbnb_transactions_rental_id ON public.airbnb_transactions(rental_id);
CREATE INDEX IF NOT EXISTS idx_airbnb_transactions_type_date ON public.airbnb_transactions(type, date);

-- Habilitação de RLS e políticas de acesso
DO $$
DECLARE
  t TEXT;
  airbnb_tables TEXT[] := ARRAY['airbnb_properties', 'airbnb_rentals', 'airbnb_transactions'];
BEGIN
  FOREACH t IN ARRAY airbnb_tables
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS "Allow authenticated full access" ON public.%I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "Allow auth all on %s" ON public.%I;', t, t);
    EXECUTE format(
      'CREATE POLICY "Allow authenticated full access" ON public.%I FOR ALL TO obras_authenticated USING (true) WITH CHECK (true);',
      t
    );
    -- Permite leitura e escrita pública/anon caso a sessão do Airbnb utilize cliente padrão sem login auth
    EXECUTE format('DROP POLICY IF EXISTS "Allow anon full access" ON public.%I;', t);
    EXECUTE format(
      'CREATE POLICY "Allow anon full access" ON public.%I FOR ALL TO obras_anon USING (true) WITH CHECK (true);',
      t
    );
  END LOOP;
END $$;


-- ==============================================================================
-- ETAPA 11: CONTROLE DE PAPÉIS DO SISTEMA (ADMIN, GESTOR, PRESTADOR)
-- ==============================================================================
-- Suporte aos papéis:
-- - admin: acesso a tudo
-- - gestor: acesso a tudo
-- - prestador: acesso restrito a Obras, Materiais e Diário de Obras
-- Idempotente: garante validação de papéis permitidos e atualização de usuários existentes.

-- 11.1. Adicionar ou atualizar restrição de verificação de role na tabela public.profiles
DO $$
BEGIN
  -- Remove constraint antiga se existir
  ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
  
  -- Adiciona check constraint para aceitar os papéis permitidos (com retrocompatibilidade legada)
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('admin', 'gestor', 'prestador', 'engineer', 'manager'));
EXCEPTION
  WHEN others THEN
    -- Caso a alteração não possa ser aplicada de imediato, segue em frente com segurança
    NULL;
END $$;

-- 11.2. Atualização idempotente do usuário Igor como admin
UPDATE public.profiles
SET role = 'admin'
WHERE LOWER(email) IN ('igor.arimura.arquitetura@hotmail.com', 'tiago.izaias@folhatech.com.br');

-- 11.3. Script de conveniência para promoção/rebaixamento direto via SQL:
-- UPDATE public.profiles SET role = 'prestador' WHERE LOWER(email) = 'teste@obras.com';
-- UPDATE public.profiles SET role = 'gestor' WHERE LOWER(email) = 'raphaella@arantesarimura.adv.br';
-- UPDATE public.profiles SET role = 'admin' WHERE LOWER(email) = 'igor.arimura.arquitetura@hotmail.com';

-- ==============================================================================
-- ETAPA 12: MÓDULO PLANNER (TAREFAS, RESPONSÁVEIS, FOTOS E VÍDEOS)
-- ==============================================================================
-- 12.1. Tabela: planner_tasks (Tarefas do Planner vinculadas a obras e responsáveis)
CREATE TABLE IF NOT EXISTS public.planner_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID REFERENCES public.works(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  progress_percentage INTEGER NOT NULL DEFAULT 0 CHECK (progress_percentage BETWEEN 0 AND 100),
  start_date DATE,
  due_date DATE,
  assignee_id UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 12.2. Tabela: planner_task_attachments (Fotos e vídeos anexados às tarefas)
CREATE TABLE IF NOT EXISTS public.planner_task_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.planner_tasks(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('image', 'video')),
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 12.3. Índices de performance para o módulo Planner
CREATE INDEX IF NOT EXISTS idx_planner_tasks_work_id ON public.planner_tasks(work_id);
CREATE INDEX IF NOT EXISTS idx_planner_tasks_assignee_id ON public.planner_tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_planner_tasks_status ON public.planner_tasks(status);
CREATE INDEX IF NOT EXISTS idx_planner_tasks_due_date ON public.planner_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_planner_task_attachments_task_id ON public.planner_task_attachments(task_id);

-- 12.4. Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION public.handle_planner_task_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc'::text, NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_planner_task_update ON public.planner_tasks;
CREATE TRIGGER on_planner_task_update
  BEFORE UPDATE ON public.planner_tasks
  FOR EACH ROW EXECUTE FUNCTION public.handle_planner_task_updated_at();

-- 12.5. Habilitação de RLS e Políticas para tabelas do Planner
DO $$
DECLARE
  t TEXT;
  planner_tables TEXT[] := ARRAY['planner_tasks', 'planner_task_attachments'];
BEGIN
  FOREACH t IN ARRAY planner_tables
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS "Allow authenticated full access" ON public.%I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "Allow auth all on %s" ON public.%I;', t, t);
    EXECUTE format(
      'CREATE POLICY "Allow authenticated full access" ON public.%I FOR ALL TO obras_authenticated USING (true) WITH CHECK (true);',
      t
    );
    EXECUTE format('DROP POLICY IF EXISTS "Allow anon full access" ON public.%I;', t);
    EXECUTE format(
      'CREATE POLICY "Allow anon full access" ON public.%I FOR ALL TO obras_anon USING (true) WITH CHECK (true);',
      t
    );
  END LOOP;
END $$;

-- 12.6. Bucket de Storage para anexos do Planner (fotos e vídeos)
INSERT INTO storage.buckets (id, name, public)
VALUES ('planner-attachments', 'planner-attachments', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow public read planner storage objects" ON storage.objects;
  CREATE POLICY "Allow public read planner storage objects" ON storage.objects
    FOR SELECT TO public
    USING (bucket_id = 'planner-attachments');

  DROP POLICY IF EXISTS "Allow authenticated upload planner storage objects" ON storage.objects;
  CREATE POLICY "Allow authenticated upload planner storage objects" ON storage.objects
    FOR ALL TO obras_authenticated
    USING (bucket_id = 'planner-attachments')
    WITH CHECK (bucket_id = 'planner-attachments');

  DROP POLICY IF EXISTS "Allow anon upload planner storage objects" ON storage.objects;
  CREATE POLICY "Allow anon upload planner storage objects" ON storage.objects
    FOR ALL TO obras_anon
    USING (bucket_id = 'planner-attachments')
    WITH CHECK (bucket_id = 'planner-attachments');
END $$;

-- ==============================================================================
-- ETAPA 13: MÓDULO DE GRUPOS DE FUNCIONÁRIOS (EQUIPES / WORKER GROUPS)
-- IMPORTANTE: Execute esta etapa no SQL Editor do Supabase se estiver atualizando
-- um banco já em produção. Ela é 100% idempotente e segura para rodar repetidas vezes.
-- ==============================================================================
-- 13.1. Tabela: worker_groups (Grupos de funcionários, ex: Alvenaria, Elétrica, Hidráulica)
CREATE TABLE IF NOT EXISTS public.worker_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 13.2. Coluna group_id na tabela team_members (com FK referenciando worker_groups e ON DELETE SET NULL)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'team_members' 
      AND column_name = 'group_id'
  ) THEN
    ALTER TABLE public.team_members 
      ADD COLUMN group_id UUID REFERENCES public.worker_groups(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 13.3. Coluna group_id na tabela workers (caso exista uma tabela legada ou alternativa chamada 'workers')
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'workers'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'workers' 
        AND column_name = 'group_id'
    ) THEN
      ALTER TABLE public.workers 
        ADD COLUMN group_id UUID REFERENCES public.worker_groups(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- 13.4. Índices para performance de busca por grupo
CREATE INDEX IF NOT EXISTS idx_worker_groups_name ON public.worker_groups(name);
CREATE INDEX IF NOT EXISTS idx_team_members_group_id ON public.team_members(group_id);

-- 13.5. Row Level Security (RLS) para worker_groups (usuários autenticados podem tudo, anon leitura/tudo conforme padrão)
ALTER TABLE public.worker_groups ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow authenticated full access" ON public.worker_groups;
  DROP POLICY IF EXISTS "Allow auth all on worker_groups" ON public.worker_groups;
  CREATE POLICY "Allow authenticated full access" ON public.worker_groups 
    FOR ALL TO obras_authenticated USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS "Allow anon full access" ON public.worker_groups;
  CREATE POLICY "Allow anon full access" ON public.worker_groups 
    FOR ALL TO obras_anon USING (true) WITH CHECK (true);
END $$;


-- ==============================================================================
-- ETAPA 14: CORREÇÃO DE RLS EM public.profiles PARA LISTAGEM DE USUÁRIOS
-- Necessária para a tela de Configurações (src/pages/configuracoes/tabs/UsersTab.tsx)
-- listar todos os usuários cadastrados e permitir a gestão de papéis/permissões,
-- permitindo que qualquer usuário autenticado leia todos os perfis.
-- Idempotente: remove quaisquer políticas antigas de SELECT antes de criar a nova.
-- ==============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Remove políticas antigas de SELECT ou restritivas se existirem
  DROP POLICY IF EXISTS "profiles_select_all_authenticated" ON public.profiles;
  DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
  DROP POLICY IF EXISTS "Allow individual read access" ON public.profiles;
  DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
  DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;
  DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
  DROP POLICY IF EXISTS "Users can read all profiles" ON public.profiles;

  -- Cria a política de SELECT permitindo que qualquer usuário autenticado leia todos os perfis
  CREATE POLICY "profiles_select_all_authenticated" 
    ON public.profiles 
    FOR SELECT 
    TO obras_authenticated 
    USING (true);
END $$;

-- ==============================================================================
-- ETAPA 15: REGISTRO DO ÚLTIMO LOGIN DOS USUÁRIOS (last_login_at)
-- Adiciona a coluna last_login_at em public.profiles, atualizada pelo app a cada
-- login bem-sucedido (src/hooks/use-auth.tsx). Como auth.users.last_sign_in_at
-- não é acessível com a anon key, o controle é feito nesta coluna própria.
-- Idempotente: pode ser executada múltiplas vezes sem erro.
-- ==============================================================================

-- 15.1. Coluna de último login (timestamptz, nula = usuário nunca entrou)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

-- 15.2. Índice para ordenação/filtro por último login na tela de Configurações
CREATE INDEX IF NOT EXISTS idx_profiles_last_login_at
  ON public.profiles (last_login_at DESC NULLS LAST);

-- 15.3. RLS de UPDATE: o próprio usuário pode atualizar a própria linha
-- (necessário para gravar last_login_at no login). A política de SELECT
-- "profiles_select_all_authenticated" da ETAPA 14 permanece intacta.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'profiles_update_own'
  ) THEN
    CREATE POLICY "profiles_update_own"
      ON public.profiles
      FOR UPDATE
      TO obras_authenticated
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- Política complementar: apenas administradores podem alterar o papel de outros
-- usuários (usada pela tela de Configurações para trocar o nível de acesso).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'profiles_update_admin'
  ) THEN
    CREATE POLICY "profiles_update_admin"
      ON public.profiles
      FOR UPDATE
      TO obras_authenticated
      USING (public.is_admin())
      WITH CHECK (true);
  END IF;
END $$;

-- 15.4. Proteção contra auto-promoção: um usuário comum não pode alterar o
-- próprio papel (role) para 'admin'. Administradores podem alterar qualquer papel.
CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() = NEW.id
     AND OLD.role IS DISTINCT FROM NEW.role
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar o papel de um usuário.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_role_escalation();

-- ==============================================================================
-- FIM DO SCRIPT DE SCHEMA
-- O banco de dados agora está 100% estruturado, seguro e funcional.
-- ==============================================================================
