CREATE TABLE IF NOT EXISTS public.company_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text,
  tax_id text,
  address text,
  contact_email text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.works (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  client text,
  manager text,
  address text,
  start_date date,
  end_date_planned date,
  contracted_value numeric,
  budget_planned numeric,
  status text DEFAULT 'planned',
  progress_percentage numeric DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  role text DEFAULT 'engineer',
  avatar_url text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid REFERENCES public.works(id) ON DELETE CASCADE,
  category text,
  description text,
  value numeric NOT NULL,
  date date NOT NULL,
  payment_method text,
  manager_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  unit_of_measure text,
  supplier text,
  stock_quantity numeric DEFAULT 0,
  min_quantity numeric DEFAULT 10,
  category text,
  unit_price numeric,
  work_id uuid REFERENCES public.works(id) ON DELETE SET NULL,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.material_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid REFERENCES public.materials(id) ON DELETE CASCADE,
  work_id uuid REFERENCES public.works(id) ON DELETE SET NULL,
  type text,
  quantity numeric NOT NULL,
  date date NOT NULL,
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role text,
  phone text,
  type text,
  daily_cost numeric,
  work_id uuid REFERENCES public.works(id) ON DELETE SET NULL,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.work_diaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid REFERENCES public.works(id) ON DELETE CASCADE,
  date date NOT NULL,
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  description text,
  occurrences text,
  weather text,
  workers_count integer,
  notes text,
  photos text[],
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.work_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid REFERENCES public.works(id) ON DELETE CASCADE,
  name text NOT NULL,
  manager text,
  start_date date,
  end_date_planned date,
  end_date_real date,
  progress_percentage numeric DEFAULT 0,
  status text DEFAULT 'pending',
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.works ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_diaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_stages ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN 
    SELECT unnest(ARRAY['company_settings', 'works', 'profiles', 'expenses', 'materials', 'material_movements', 'team_members', 'work_diaries', 'work_stages'])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "allow_all_authenticated" ON public.%I', t);
    EXECUTE format('CREATE POLICY "allow_all_authenticated" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.calculate_work_progress()
 RETURNS trigger
 LANGUAGE plpgsql
AS $$
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
$;

DROP TRIGGER IF EXISTS on_stage_progress_change ON public.work_stages;
CREATE TRIGGER on_stage_progress_change
 AFTER INSERT OR DELETE OR UPDATE ON public.work_stages
 FOR EACH ROW EXECUTE FUNCTION public.calculate_work_progress();

CREATE OR REPLACE FUNCTION public.handle_material_movement()
 RETURNS trigger
 LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.type = 'input' THEN
    UPDATE public.materials SET stock_quantity = stock_quantity + NEW.quantity WHERE id = NEW.material_id;
  ELSIF NEW.type = 'output' THEN
    UPDATE public.materials SET stock_quantity = stock_quantity - NEW.quantity WHERE id = NEW.material_id;
  END IF;
  RETURN NEW;
END;
$;

DROP TRIGGER IF EXISTS on_material_movement ON public.material_movements;
CREATE TRIGGER on_material_movement
 AFTER INSERT ON public.material_movements
 FOR EACH ROW EXECUTE FUNCTION public.handle_material_movement();

DO $$
DECLARE
  admin_id uuid := gen_random_uuid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'fernando.andrade@folhatech.com.br') THEN
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
      '{"name": "Admin"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '',
      NULL, '', '', ''
    );

    INSERT INTO public.profiles (id, full_name, role)
    VALUES (admin_id, 'Fernando Andrade', 'admin')
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;
