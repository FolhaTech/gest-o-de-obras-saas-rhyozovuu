DO $$
DECLARE
  v_serv_alv_ved uuid := gen_random_uuid();
  v_serv_assent uuid := gen_random_uuid();
  v_serv_pint_acr uuid := gen_random_uuid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.services WHERE name = 'Alvenaria de Vedação SINAPI') THEN
    INSERT INTO public.services (id, name, unit) VALUES (v_serv_alv_ved, 'Alvenaria de Vedação SINAPI', 'm2');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.services WHERE name = 'Assentamento de Piso Cerâmico SINAPI') THEN
    INSERT INTO public.services (id, name, unit) VALUES (v_serv_assent, 'Assentamento de Piso Cerâmico SINAPI', 'm2');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.services WHERE name = 'Pintura Acrílica 2 Demãos SINAPI') THEN
    INSERT INTO public.services (id, name, unit) VALUES (v_serv_pint_acr, 'Pintura Acrílica 2 Demãos SINAPI', 'm2');
  END IF;
END $$;
