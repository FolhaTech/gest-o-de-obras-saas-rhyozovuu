DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('work-photos', 'work-photos', true)
  ON CONFLICT (id) DO NOTHING;
END $$;

DROP POLICY IF EXISTS "allow_public_read_work_photos" ON storage.objects;
CREATE POLICY "allow_public_read_work_photos" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'work-photos');

DROP POLICY IF EXISTS "allow_authenticated_manage_work_photos" ON storage.objects;
CREATE POLICY "allow_authenticated_manage_work_photos" ON storage.objects
  FOR ALL TO authenticated USING (bucket_id = 'work-photos') WITH CHECK (bucket_id = 'work-photos');

DROP POLICY IF EXISTS "allow_all_authenticated" ON public.work_diaries;
CREATE POLICY "allow_all_authenticated" ON public.work_diaries
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

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
      '{"name": "Tiago"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '', NULL, '', '', ''
    );

    INSERT INTO public.profiles (id, full_name, role)
    VALUES (new_user_id, 'Tiago Izaias', 'manager')
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;
