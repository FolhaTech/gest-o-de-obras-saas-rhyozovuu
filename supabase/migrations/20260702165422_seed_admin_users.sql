DO $$
DECLARE
  new_user_id uuid;
BEGIN
  -- Seed primary admin: Igor Arimura
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'Igor.arimura.arquitetura@hotmail.com') THEN
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
      'Igor.arimura.arquitetura@hotmail.com',
      crypt('Igor.arimura@2026', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Igor Arimura"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '',
      NULL, '', '', ''
    );

    INSERT INTO public.profiles (id, full_name, email, role)
    VALUES (new_user_id, 'Igor Arimura', 'Igor.arimura.arquitetura@hotmail.com', 'admin')
    ON CONFLICT (id) DO NOTHING;
  ELSE
    SELECT id INTO new_user_id FROM auth.users WHERE email = 'Igor.arimura.arquitetura@hotmail.com';
    INSERT INTO public.profiles (id, full_name, email, role)
    VALUES (new_user_id, 'Igor Arimura', 'Igor.arimura.arquitetura@hotmail.com', 'admin')
    ON CONFLICT (id) DO UPDATE SET role = 'admin', email = 'Igor.arimura.arquitetura@hotmail.com';
  END IF;

  -- Seed secondary admin: Tiago Izaias
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

    INSERT INTO public.profiles (id, full_name, email, role)
    VALUES (new_user_id, 'Tiago Izaias', 'tiago.izaias@folhatech.com.br', 'admin')
    ON CONFLICT (id) DO NOTHING;
  ELSE
    SELECT id INTO new_user_id FROM auth.users WHERE email = 'tiago.izaias@folhatech.com.br';
    INSERT INTO public.profiles (id, full_name, email, role)
    VALUES (new_user_id, 'Tiago Izaias', 'tiago.izaias@folhatech.com.br', 'admin')
    ON CONFLICT (id) DO UPDATE SET role = 'admin', email = 'tiago.izaias@folhatech.com.br';
  END IF;
END $$;
