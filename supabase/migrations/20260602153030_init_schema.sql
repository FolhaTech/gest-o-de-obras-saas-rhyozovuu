DO $$
BEGIN

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    role TEXT DEFAULT 'engineer',
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.works (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    client TEXT,
    manager TEXT,
    address TEXT,
    start_date DATE,
    end_date_planned DATE,
    contracted_value NUMERIC,
    budget_planned NUMERIC,
    status TEXT DEFAULT 'planned',
    progress_percentage NUMERIC DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

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
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.work_diaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_id UUID REFERENCES public.works(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    description TEXT,
    occurrences TEXT,
    weather TEXT,
    workers_count INT,
    notes TEXT,
    photos TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    role TEXT,
    phone TEXT,
    type TEXT,
    daily_cost NUMERIC,
    work_id UUID REFERENCES public.works(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    unit_of_measure TEXT,
    supplier TEXT,
    stock_quantity NUMERIC DEFAULT 0,
    min_quantity NUMERIC DEFAULT 10,
    category TEXT,
    unit_price NUMERIC,
    work_id UUID REFERENCES public.works(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.material_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    material_id UUID REFERENCES public.materials(id) ON DELETE CASCADE,
    work_id UUID REFERENCES public.works(id) ON DELETE SET NULL,
    type TEXT,
    quantity NUMERIC NOT NULL,
    date DATE NOT NULL,
    author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_id UUID REFERENCES public.works(id) ON DELETE CASCADE,
    category TEXT,
    description TEXT,
    value NUMERIC NOT NULL,
    date DATE NOT NULL,
    payment_method TEXT,
    manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.company_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT,
    tax_id TEXT,
    address TEXT,
    contact_email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

END $$;

CREATE OR REPLACE FUNCTION public.handle_material_movement()
RETURNS trigger AS $$
BEGIN
  IF NEW.type = 'input' THEN
    UPDATE public.materials SET stock_quantity = stock_quantity + NEW.quantity WHERE id = NEW.material_id;
  ELSIF NEW.type = 'output' THEN
    UPDATE public.materials SET stock_quantity = stock_quantity - NEW.quantity WHERE id = NEW.material_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_material_movement ON public.material_movements;
CREATE TRIGGER on_material_movement
AFTER INSERT ON public.material_movements
FOR EACH ROW EXECUTE FUNCTION public.handle_material_movement();

CREATE OR REPLACE FUNCTION public.calculate_work_progress()
RETURNS trigger AS $$
DECLARE
  w_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    w_id := OLD.work_id;
  ELSE
    w_id := NEW.work_id;
  END IF;

  UPDATE public.works
  SET progress_percentage = COALESCE((
    SELECT avg(progress_percentage) FROM public.work_stages WHERE work_id = w_id
  ), 0)
  WHERE id = w_id;

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

DO $$
DECLARE
  admin_id UUID;
  work1_id UUID := gen_random_uuid();
  work2_id UUID := gen_random_uuid();
  mat1_id UUID := gen_random_uuid();
  mat2_id UUID := gen_random_uuid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'fernando.andrade@folhatech.com.br') THEN
    admin_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current,
      phone, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      admin_id,
      '00000000-0000-0000-0000-000000000000',
      'fernando.andrade@folhatech.com.br',
      crypt('Skip@Pass', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Fernando Andrade"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '',
      NULL, '', '', ''
    );

    INSERT INTO public.profiles (id, full_name, role)
    VALUES (admin_id, 'Fernando Andrade', 'admin')
    ON CONFLICT (id) DO NOTHING;
  ELSE
    SELECT id INTO admin_id FROM auth.users WHERE email = 'fernando.andrade@folhatech.com.br' LIMIT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.works) THEN
    INSERT INTO public.works (id, name, client, manager, address, start_date, end_date_planned, contracted_value, budget_planned, status, progress_percentage) VALUES
    (work1_id, 'Edifício Alpha Corporate', 'Construtora Beta', 'Carlos Silva', 'Av. Paulista, 1000 - SP', '2023-01-15', '2024-12-20', 16000000, 15000000, 'in_progress', 65),
    (work2_id, 'Condomínio Reserva do Bosque', 'Incorporadora Gamma', 'Ana Paula', 'Rua das Flores, 500 - RJ', '2022-06-01', '2023-10-30', 9000000, 8500000, 'delayed', 80);

    INSERT INTO public.work_stages (work_id, name, manager, start_date, end_date_planned, progress_percentage, status) VALUES
    (work1_id, 'Fundação', 'Carlos Silva', '2023-01-15', '2023-04-15', 100, 'completed'),
    (work1_id, 'Estrutura', 'Carlos Silva', '2023-04-16', '2023-10-15', 80, 'in_progress'),
    (work1_id, 'Alvenaria', 'Ana Paula', '2023-10-16', '2024-02-15', 40, 'in_progress');

    INSERT INTO public.materials (id, name, unit_of_measure, stock_quantity, min_quantity, category) VALUES
    (mat1_id, 'Cimento CP II 50kg', 'Saco', 120, 150, 'Básico'),
    (mat2_id, 'Areia Média', 'm³', 45, 30, 'Básico');

    INSERT INTO public.expenses (work_id, category, description, value, date) VALUES
    (work1_id, 'material', 'Compra de Cimento', 15000, '2023-10-15'),
    (work1_id, 'labor', 'Pagamento Empreiteira (Out)', 45000, '2023-10-30'),
    (work2_id, 'equipment', 'Aluguel Grua', 8000, '2023-11-05');

    INSERT INTO public.work_diaries (work_id, date, author_id, occurrences, weather, workers_count, photos) VALUES
    (work1_id, '2023-11-14', admin_id, 'Concretagem da laje finalizada.', 'Ensolarado', 45, ARRAY['https://img.usecurling.com/p/200/200?q=construction&seed=1']),
    (work1_id, '2023-11-15', admin_id, 'Serviços externos paralisados devido a chuva.', 'Chuvoso', 20, ARRAY['https://img.usecurling.com/p/200/200?q=rain&seed=3']);

    INSERT INTO public.team_members (name, role, type, daily_cost, work_id) VALUES
    ('Equipe Alpha (Estrutura)', 'Armadores', 'internal', 1200, work1_id),
    ('Construtora Forte', 'Pedreiros', 'outsourced', 2500, work1_id);
  END IF;
END $$;

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY['profiles', 'works', 'work_stages', 'work_diaries', 'team_members', 'materials', 'material_movements', 'expenses', 'company_settings'];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS "allow_all_authenticated" ON public.%I;', t);
    EXECUTE format('CREATE POLICY "allow_all_authenticated" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true);', t);
  END LOOP;
END $$;
