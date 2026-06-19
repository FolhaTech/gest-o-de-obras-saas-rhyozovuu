DO $$
BEGIN
  -- Add new columns to team_members
  ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS admission_date DATE;
  ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS pix_key TEXT;
  ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT 'daily';
END $$;

-- service_providers
CREATE TABLE IF NOT EXISTS public.service_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_id UUID REFERENCES public.works(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    service_type TEXT,
    contact_phone TEXT,
    email TEXT,
    responsible_person TEXT,
    quality_rating TEXT,
    deadline_rating TEXT,
    team_level TEXT,
    observations TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.service_providers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_authenticated" ON public.service_providers;
CREATE POLICY "allow_all_authenticated" ON public.service_providers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- attendance_records
CREATE TABLE IF NOT EXISTS public.attendance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id UUID REFERENCES public.team_members(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    is_present BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(worker_id, date)
);
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_authenticated" ON public.attendance_records;
CREATE POLICY "allow_all_authenticated" ON public.attendance_records FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- attendance_extras
CREATE TABLE IF NOT EXISTS public.attendance_extras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id UUID REFERENCES public.team_members(id) ON DELETE CASCADE,
    week_start_date DATE NOT NULL,
    extra_value NUMERIC DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(worker_id, week_start_date)
);
ALTER TABLE public.attendance_extras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_authenticated" ON public.attendance_extras;
CREATE POLICY "allow_all_authenticated" ON public.attendance_extras FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- external_contracts
CREATE TABLE IF NOT EXISTS public.external_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID REFERENCES public.service_providers(id) ON DELETE CASCADE,
    work_id UUID REFERENCES public.works(id) ON DELETE CASCADE,
    service_description TEXT NOT NULL,
    unit TEXT,
    total_value NUMERIC DEFAULT 0,
    executed_quantity NUMERIC DEFAULT 0,
    target_date DATE,
    is_completed BOOLEAN DEFAULT false,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.external_contracts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_authenticated" ON public.external_contracts;
CREATE POLICY "allow_all_authenticated" ON public.external_contracts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed Default User
DO $$
DECLARE
  new_user_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'tiago.izaias@folhatech.com.br') THEN
    new_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current,
      phone, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      new_user_id,
      '00000000-0000-0000-0000-000000000000',
      'tiago.izaias@folhatech.com.br',
      crypt('Skip@Pass', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Tiago Izaias"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '',
      NULL, '', '', ''
    );

    INSERT INTO public.profiles (id, full_name, role)
    VALUES (new_user_id, 'Tiago Izaias', 'manager')
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;
