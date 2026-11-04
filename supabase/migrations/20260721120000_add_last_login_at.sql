-- Migration: 20260721120000_add_last_login_at.sql
-- Registra o último login de cada usuário em public.profiles.
-- auth.users.last_sign_in_at não é acessível com a anon key, por isso o app
-- (src/hooks/use-auth.tsx) grava last_login_at após cada signInWithPassword.
-- Idempotente: pode ser executada múltiplas vezes sem erro.

-- Coluna de último login (timestamptz, nula = usuário nunca entrou)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

-- Índice para ordenação/filtro por último login na tela de Configurações
CREATE INDEX IF NOT EXISTS idx_profiles_last_login_at
  ON public.profiles (last_login_at DESC NULLS LAST);

-- RLS de UPDATE: o próprio usuário pode atualizar a própria linha
-- (necessário para gravar last_login_at no login). A política de SELECT
-- "profiles_select_all_authenticated" permanece intacta.
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
      TO authenticated
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
      TO authenticated
      USING (public.is_admin())
      WITH CHECK (true);
  END IF;
END $$;

-- Proteção contra auto-promoção: um usuário comum não pode alterar o próprio
-- papel (role) para 'admin'. Administradores podem alterar qualquer papel.
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
