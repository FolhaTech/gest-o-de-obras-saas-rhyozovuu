-- Setup Admin User
DO $$
DECLARE
  new_user_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'fernando.andrade@folhatech.com.br') THEN
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
      'fernando.andrade@folhatech.com.br',
      crypt('Skip@Pass', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"full_name": "Fernando Andrade"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '',
      NULL, '', '', ''
    );

    INSERT INTO public.profiles (id, full_name, role)
    VALUES (new_user_id, 'Fernando Andrade', 'admin')
    ON CONFLICT (id) DO UPDATE SET role = 'admin', full_name = 'Fernando Andrade';
  ELSE
    -- If user exists, update role to admin
    UPDATE public.profiles 
    SET role = 'admin' 
    WHERE id = (SELECT id FROM auth.users WHERE email = 'fernando.andrade@folhatech.com.br');
  END IF;
END $$;

-- Create Storage Bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('work-diary-photos', 'work-diary-photos', true) 
ON CONFLICT (id) DO NOTHING;

-- Policies for Storage Bucket
DROP POLICY IF EXISTS "Authenticated users can upload photos" ON storage.objects;
CREATE POLICY "Authenticated users can upload photos" ON storage.objects 
  FOR INSERT TO authenticated 
  WITH CHECK (bucket_id = 'work-diary-photos');

DROP POLICY IF EXISTS "Authenticated users can read photos" ON storage.objects;
CREATE POLICY "Authenticated users can read photos" ON storage.objects 
  FOR SELECT TO authenticated 
  USING (bucket_id = 'work-diary-photos');
