-- Migration: 20260720120000_allow_authenticated_select_profiles.sql
-- Correção de RLS na tabela public.profiles para listagem de usuários.
-- Permite que qualquer usuário autenticado leia todos os perfis (SELECT),
-- permitindo que a tela de Configurações (UsersTab) liste todos os usuários cadastrados
-- para gerenciamento de papéis e permissões.

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

  -- Cria a nova política de SELECT permitindo que qualquer usuário autenticado leia todos os perfis
  CREATE POLICY "profiles_select_all_authenticated" 
    ON public.profiles 
    FOR SELECT 
    TO authenticated 
    USING (true);
END $$;
