-- ==============================================================================
-- SCHEMA COMPLETO DO SUPABASE - GESTÃO DE OBRAS SAAS
-- Execute este script no SQL Editor do seu projeto Supabase:
-- https://supabase.com/dashboard/project/_/sql
-- ==============================================================================

-- 1. Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. TABELA: profiles (Perfis de Usuários vinculados ao auth.users)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  name TEXT,
  role TEXT DEFAULT 'engenheiro' CHECK (role IN ('admin', 'engenheiro', 'mestre_obras', 'visualizador')),
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Trigger para criar perfil automaticamente no cadastro
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'engenheiro')
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    name = COALESCE(EXCLUDED.name, public.profiles.name);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ==============================================================================
-- 3. TABELA: works (Obras do Sistema)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.works (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  manager TEXT,
  total_area NUMERIC(12, 2) DEFAULT 0,
  start_date DATE,
  end_date_planned DATE,
  budget_planned NUMERIC(14, 2) DEFAULT 0,
  progress_percentage NUMERIC(5, 2) DEFAULT 0,
  status TEXT DEFAULT 'planning' CHECK (status IN ('planning', 'in_progress', 'delayed', 'completed', 'paused')),
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ==============================================================================
-- 4. TABELA: work_stages (Etapas da Obra / Cronograma Gantt)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.work_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  manager TEXT,
  progress_percentage NUMERIC(5, 2) DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'delayed', 'completed')),
  start_date DATE,
  end_date_planned DATE,
  end_date_real DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ==============================================================================
-- 5. TABELA: materials (Catálogo Global de Materiais/Insumos)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  unit_of_measure TEXT NOT NULL, -- Ex: kg, m³, un, saco, l
  unidade_nativa TEXT,           -- Ex: kg, m³, un, saco, l
  peso_saco_kg NUMERIC(10, 2),   -- Ex: 50 (saco de cimento)
  cost_unit NUMERIC(12, 2) DEFAULT 0,
  stock_quantity NUMERIC(12, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ==============================================================================
-- 6. TABELA: densidades_insumo (Densidades e Pesos para Conversões Técnicas)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.densidades_insumo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insumo_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  densidade_kg_m3 NUMERIC(10, 2),  -- Densidade em kg/m³
  peso_unitario_kg NUMERIC(10, 2), -- Peso unitário em kg
  descricao TEXT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ==============================================================================
-- 7. TABELA: services (Catálogo de Serviços da Empresa)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  unit TEXT NOT NULL, -- Ex: m², m³, un, m, vb
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ==============================================================================
-- 8. TABELA: compositions (Composições Base de Serviços x Insumos)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.compositions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  coefficient NUMERIC(12, 4) NOT NULL DEFAULT 1,     -- Consumo por unidade de serviço
  waste_percentage NUMERIC(5, 2) NOT NULL DEFAULT 0, -- % de perda técnica
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ==============================================================================
-- 9. TABELA: work_services (Serviços Planejados em Cada Obra)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.work_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
  target_quantity NUMERIC(12, 2) NOT NULL DEFAULT 0,
  unit_price NUMERIC(12, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ==============================================================================
-- 10. TABELA: compositions_history (Snapshot de Composição por Serviço da Obra)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.compositions_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_service_id UUID NOT NULL REFERENCES public.work_services(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
  coefficient NUMERIC(12, 4) NOT NULL DEFAULT 1,
  waste_percentage NUMERIC(5, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ==============================================================================
-- 11. TABELA: work_extra_materials (Materiais Adicionais ou Diretos da Obra)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.work_extra_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  quantity NUMERIC(12, 2) DEFAULT 0,
  consumption_per_m2 NUMERIC(12, 4),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ==============================================================================
-- 12. TABELA: consumption_tracking (Apontamentos de Consumo Real de Insumos)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.consumption_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_service_id UUID NOT NULL REFERENCES public.work_services(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
  quantity_actual NUMERIC(12, 2) NOT NULL DEFAULT 0,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ==============================================================================
-- 13. TABELA: team_members (Membros da Equipe / Funcionários Próprios)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  contact_phone TEXT,
  cpf_cnpj TEXT,
  admission_date DATE,
  daily_cost NUMERIC(12, 2) DEFAULT 0,
  payment_type TEXT DEFAULT 'daily' CHECK (payment_type IN ('daily', 'monthly')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ==============================================================================
-- 14. TABELA: team_member_documents (Documentos dos Membros da Equipe)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.team_member_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ==============================================================================
-- 15. TABELA: attendance_records (Apontamento Diário de Presença)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  is_present BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  CONSTRAINT attendance_records_worker_date_unique UNIQUE(worker_id, date)
);

-- ==============================================================================
-- 16. TABELA: attendance_extras (Valores Extras e Observações Semanais de Pessoal)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.attendance_extras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL,
  extra_value NUMERIC(12, 2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  CONSTRAINT attendance_extras_worker_week_unique UNIQUE(worker_id, week_start_date)
);

-- ==============================================================================
-- 17. TABELA: service_providers (Prestadores de Serviços / Empreiteiros)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.service_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  service_type TEXT,
  contact_phone TEXT,
  email TEXT,
  responsible_person TEXT,
  quality_rating TEXT,
  deadline_rating TEXT,
  team_level TEXT,
  observations TEXT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ==============================================================================
-- 18. TABELA: external_contracts (Contratos de Empreitadas / Terceirizados)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.external_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE RESTRICT,
  service_description TEXT NOT NULL,
  unit TEXT,
  total_value NUMERIC(14, 2) NOT NULL DEFAULT 0,
  executed_quantity NUMERIC(12, 2) DEFAULT 0,
  target_date DATE,
  is_completed BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ==============================================================================
-- 19. TABELA: expenses (Despesas e Notas Fiscais)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID REFERENCES public.works(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Geral',
  value NUMERIC(14, 2) NOT NULL DEFAULT 0,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  supplier TEXT,
  invoice_number TEXT,
  receipt_url TEXT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ==============================================================================
-- 20. TABELA: revenues (Receitas / Aportes / Entradas por Obra)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.revenues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  value NUMERIC(14, 2) NOT NULL DEFAULT 0,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ==============================================================================
-- 21. TABELA: work_diaries (Diário de Obra e Ocorrências)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.work_diaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID REFERENCES public.works(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  weather TEXT,
  workers_count INT DEFAULT 0,
  occurrences TEXT,
  notes TEXT,
  photos TEXT[],
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ==============================================================================
-- 22. STORAGE BUCKETS (receipts, work-photos, work-diary-photos, team-documents)
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('receipts', 'receipts', true),
  ('work-photos', 'work-photos', true),
  ('work-diary-photos', 'work-diary-photos', true),
  ('team-documents', 'team-documents', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Políticas de acesso para Storage
DROP POLICY IF EXISTS "Public receipts access" ON storage.objects;
CREATE POLICY "Public receipts access" ON storage.objects 
  FOR ALL USING (bucket_id IN ('receipts', 'work-photos', 'work-diary-photos', 'team-documents'))
  WITH CHECK (bucket_id IN ('receipts', 'work-photos', 'work-diary-photos', 'team-documents'));

-- ==============================================================================
-- 23. ROW LEVEL SECURITY (RLS) & POLICIES
-- ==============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.works ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.densidades_insumo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compositions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compositions_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_extra_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consumption_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_member_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_extras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_diaries ENABLE ROW LEVEL SECURITY;

-- Políticas permissivas para usuários autenticados
CREATE POLICY "Allow auth all on profiles" ON public.profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow auth all on works" ON public.works FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow auth all on work_stages" ON public.work_stages FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow auth all on materials" ON public.materials FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow auth all on densidades_insumo" ON public.densidades_insumo FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow auth all on services" ON public.services FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow auth all on compositions" ON public.compositions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow auth all on work_services" ON public.work_services FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow auth all on compositions_history" ON public.compositions_history FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow auth all on work_extra_materials" ON public.work_extra_materials FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow auth all on consumption_tracking" ON public.consumption_tracking FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow auth all on team_members" ON public.team_members FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow auth all on team_member_documents" ON public.team_member_documents FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow auth all on attendance_records" ON public.attendance_records FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow auth all on attendance_extras" ON public.attendance_extras FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow auth all on service_providers" ON public.service_providers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow auth all on external_contracts" ON public.external_contracts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow auth all on expenses" ON public.expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow auth all on revenues" ON public.revenues FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow auth all on work_diaries" ON public.work_diaries FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Permissões de leitura para perfis anônimos caso use mock/visualização
CREATE POLICY "Allow anon read works" ON public.works FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read materials" ON public.materials FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read services" ON public.services FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read profiles" ON public.profiles FOR SELECT TO anon USING (true);
