-- Up Migration

ALTER TABLE public.materials
ADD COLUMN IF NOT EXISTS unidade_nativa text DEFAULT 'kg',
ADD COLUMN IF NOT EXISTS peso_saco_kg numeric,
ADD COLUMN IF NOT EXISTS estoque_minimo_kg numeric;

CREATE TABLE IF NOT EXISTS public.densidades_insumo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid REFERENCES public.materials(id) ON DELETE CASCADE,
  densidade_kg_m3 numeric,
  peso_unitario_kg numeric,
  data_vigencia timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.compositions
ADD COLUMN IF NOT EXISTS version integer DEFAULT 1;

DROP POLICY IF EXISTS "allow_all_authenticated" ON public.densidades_insumo;
CREATE POLICY "allow_all_authenticated" ON public.densidades_insumo FOR ALL TO authenticated USING (true) WITH CHECK (true);

DO $$
DECLARE
  v_serv_alv uuid := gen_random_uuid();
  v_serv_chap uuid := gen_random_uuid();
  v_serv_reb uuid := gen_random_uuid();
  v_serv_cont uuid := gen_random_uuid();
  v_serv_pint uuid := gen_random_uuid();

  v_mat_tijolo uuid := gen_random_uuid();
  v_mat_cimento uuid := gen_random_uuid();
  v_mat_areia uuid := gen_random_uuid();
  v_mat_cal uuid := gen_random_uuid();
  v_mat_tinta uuid := gen_random_uuid();
  v_mat_selador uuid := gen_random_uuid();
BEGIN
  -- Insert Materials (idempotent check by name)
  IF NOT EXISTS (SELECT 1 FROM public.materials WHERE name = 'Tijolo SINAPI') THEN
    INSERT INTO public.materials (id, name, unidade_nativa, unit_of_measure, peso_saco_kg, category) VALUES (v_mat_tijolo, 'Tijolo SINAPI', 'kg', 'kg', null, 'Alvenaria');
  ELSE
    SELECT id INTO v_mat_tijolo FROM public.materials WHERE name = 'Tijolo SINAPI' LIMIT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.materials WHERE name = 'Cimento SINAPI') THEN
    INSERT INTO public.materials (id, name, unidade_nativa, unit_of_measure, peso_saco_kg, category) VALUES (v_mat_cimento, 'Cimento SINAPI', 'kg', 'kg', 50, 'Aglomerante');
  ELSE
    SELECT id INTO v_mat_cimento FROM public.materials WHERE name = 'Cimento SINAPI' LIMIT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.materials WHERE name = 'Areia SINAPI') THEN
    INSERT INTO public.materials (id, name, unidade_nativa, unit_of_measure, peso_saco_kg, category) VALUES (v_mat_areia, 'Areia SINAPI', 'kg', 'kg', null, 'Agregado');
  ELSE
    SELECT id INTO v_mat_areia FROM public.materials WHERE name = 'Areia SINAPI' LIMIT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.materials WHERE name = 'Cal SINAPI') THEN
    INSERT INTO public.materials (id, name, unidade_nativa, unit_of_measure, peso_saco_kg, category) VALUES (v_mat_cal, 'Cal SINAPI', 'kg', 'kg', 20, 'Aglomerante');
  ELSE
    SELECT id INTO v_mat_cal FROM public.materials WHERE name = 'Cal SINAPI' LIMIT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.materials WHERE name = 'Tinta SINAPI') THEN
    INSERT INTO public.materials (id, name, unidade_nativa, unit_of_measure, peso_saco_kg, category) VALUES (v_mat_tinta, 'Tinta SINAPI', 'kg', 'kg', null, 'Acabamento');
  ELSE
    SELECT id INTO v_mat_tinta FROM public.materials WHERE name = 'Tinta SINAPI' LIMIT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.materials WHERE name = 'Selador SINAPI') THEN
    INSERT INTO public.materials (id, name, unidade_nativa, unit_of_measure, peso_saco_kg, category) VALUES (v_mat_selador, 'Selador SINAPI', 'kg', 'kg', null, 'Acabamento');
  ELSE
    SELECT id INTO v_mat_selador FROM public.materials WHERE name = 'Selador SINAPI' LIMIT 1;
  END IF;

  -- Insert Services (idempotent check by name)
  IF NOT EXISTS (SELECT 1 FROM public.services WHERE name = 'Alvenaria SINAPI') THEN
    INSERT INTO public.services (id, name, unit) VALUES (v_serv_alv, 'Alvenaria SINAPI', 'm2');
  ELSE
    SELECT id INTO v_serv_alv FROM public.services WHERE name = 'Alvenaria SINAPI' LIMIT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.services WHERE name = 'Chapisco SINAPI') THEN
    INSERT INTO public.services (id, name, unit) VALUES (v_serv_chap, 'Chapisco SINAPI', 'm2');
  ELSE
    SELECT id INTO v_serv_chap FROM public.services WHERE name = 'Chapisco SINAPI' LIMIT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.services WHERE name = 'Reboco SINAPI') THEN
    INSERT INTO public.services (id, name, unit) VALUES (v_serv_reb, 'Reboco SINAPI', 'm2');
  ELSE
    SELECT id INTO v_serv_reb FROM public.services WHERE name = 'Reboco SINAPI' LIMIT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.services WHERE name = 'Contrapiso SINAPI') THEN
    INSERT INTO public.services (id, name, unit) VALUES (v_serv_cont, 'Contrapiso SINAPI', 'm2');
  ELSE
    SELECT id INTO v_serv_cont FROM public.services WHERE name = 'Contrapiso SINAPI' LIMIT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.services WHERE name = 'Pintura SINAPI') THEN
    INSERT INTO public.services (id, name, unit) VALUES (v_serv_pint, 'Pintura SINAPI', 'm2');
  ELSE
    SELECT id INTO v_serv_pint FROM public.services WHERE name = 'Pintura SINAPI' LIMIT 1;
  END IF;

  -- Insert Compositions (Check existence)
  -- Alvenaria
  IF NOT EXISTS (SELECT 1 FROM public.compositions WHERE service_id = v_serv_alv AND material_id = v_mat_tijolo) THEN
    INSERT INTO public.compositions (service_id, material_id, coefficient, waste_percentage) VALUES
    (v_serv_alv, v_mat_tijolo, 55, 5),
    (v_serv_alv, v_mat_cimento, 5, 5),
    (v_serv_alv, v_mat_areia, 37.5, 5),
    (v_serv_alv, v_mat_cal, 1.5, 5);
  END IF;
  
  -- Chapisco
  IF NOT EXISTS (SELECT 1 FROM public.compositions WHERE service_id = v_serv_chap AND material_id = v_mat_cimento) THEN
    INSERT INTO public.compositions (service_id, material_id, coefficient, waste_percentage) VALUES
    (v_serv_chap, v_mat_cimento, 3.5, 5),
    (v_serv_chap, v_mat_areia, 7.5, 5);
  END IF;

  -- Reboco
  IF NOT EXISTS (SELECT 1 FROM public.compositions WHERE service_id = v_serv_reb AND material_id = v_mat_cimento) THEN
    INSERT INTO public.compositions (service_id, material_id, coefficient, waste_percentage) VALUES
    (v_serv_reb, v_mat_cimento, 7.5, 5),
    (v_serv_reb, v_mat_cal, 3, 5),
    (v_serv_reb, v_mat_areia, 52.5, 5);
  END IF;

  -- Contrapiso
  IF NOT EXISTS (SELECT 1 FROM public.compositions WHERE service_id = v_serv_cont AND material_id = v_mat_cimento) THEN
    INSERT INTO public.compositions (service_id, material_id, coefficient, waste_percentage) VALUES
    (v_serv_cont, v_mat_cimento, 9, 5),
    (v_serv_cont, v_mat_areia, 60, 5);
  END IF;

  -- Pintura
  IF NOT EXISTS (SELECT 1 FROM public.compositions WHERE service_id = v_serv_pint AND material_id = v_mat_tinta) THEN
    INSERT INTO public.compositions (service_id, material_id, coefficient, waste_percentage) VALUES
    (v_serv_pint, v_mat_tinta, 0.234, 5),
    (v_serv_pint, v_mat_selador, 0.13, 5);
  END IF;

END $$;

/*
-- Down Migration (Rollback script)
DO $$
BEGIN
  DROP TABLE IF EXISTS public.densidades_insumo CASCADE;
  ALTER TABLE public.materials DROP COLUMN IF EXISTS unidade_nativa;
  ALTER TABLE public.materials DROP COLUMN IF EXISTS peso_saco_kg;
  ALTER TABLE public.materials DROP COLUMN IF EXISTS estoque_minimo_kg;
  ALTER TABLE public.compositions DROP COLUMN IF EXISTS version;
  
  DELETE FROM public.compositions WHERE service_id IN (SELECT id FROM public.services WHERE name LIKE '%SINAPI%');
  DELETE FROM public.services WHERE name LIKE '%SINAPI%';
  DELETE FROM public.materials WHERE name LIKE '%SINAPI%';
END $$;
*/
