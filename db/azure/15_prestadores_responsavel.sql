-- Quem está cadastrado em Equipes > Prestadores (service_providers) também aparece como "Pessoa Responsável"
-- (Planner, Cronograma, Etapas do Projeto) e na lista de vínculo de usuário (Configurações).
-- Esses seletores (e as chaves de planner_tasks, work_stages, profiles e metas) apontam para team_members,
-- então cada prestador ganha uma linha ESPELHO em team_members (type = 'provider', provider_id = prestador).
-- O espelho nasce, muda de nome/função/telefone e some junto com o prestador (gatilho + FK em cascata).
-- Ele não entra em Funcionários, Controle de Diárias nem Grupos (as telas filtram provider_id) e não conta nas médias.
-- Idempotente.

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS provider_id UUID UNIQUE REFERENCES public.service_providers(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.sync_provider_to_team_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.team_members
    (name, role, type, phone, status, participates_in_averages, work_id, provider_id)
  VALUES (
    btrim(NEW.name),
    NULLIF(btrim(COALESCE(NEW.service_type, '')), ''),
    'provider',
    NEW.contact_phone,
    'active',
    false,
    NEW.work_id,
    NEW.id
  )
  ON CONFLICT (provider_id) DO UPDATE SET
    name = EXCLUDED.name,
    role = EXCLUDED.role,
    phone = EXCLUDED.phone,
    work_id = EXCLUDED.work_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_provider_to_team_member ON public.service_providers;
CREATE TRIGGER trg_sync_provider_to_team_member
  AFTER INSERT OR UPDATE OF name, service_type, contact_phone, work_id ON public.service_providers
  FOR EACH ROW EXECUTE FUNCTION public.sync_provider_to_team_member();

-- prestadores que já existem
INSERT INTO public.team_members
  (name, role, type, phone, status, participates_in_averages, work_id, provider_id)
SELECT btrim(p.name), NULLIF(btrim(COALESCE(p.service_type, '')), ''), 'provider', p.contact_phone,
       'active', false, p.work_id, p.id
  FROM public.service_providers p
ON CONFLICT (provider_id) DO NOTHING;
