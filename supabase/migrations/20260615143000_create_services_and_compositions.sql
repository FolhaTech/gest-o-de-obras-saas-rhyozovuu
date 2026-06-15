CREATE TABLE IF NOT EXISTS public.services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    unit TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.compositions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
    material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
    coefficient NUMERIC NOT NULL,
    waste_percentage NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.work_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_id UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
    target_quantity NUMERIC NOT NULL,
    status TEXT DEFAULT 'planned',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.compositions_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_service_id UUID NOT NULL REFERENCES public.work_services(id) ON DELETE CASCADE,
    material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
    coefficient NUMERIC NOT NULL,
    waste_percentage NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.consumption_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_service_id UUID NOT NULL REFERENCES public.work_services(id) ON DELETE CASCADE,
    material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
    quantity_actual NUMERIC NOT NULL,
    date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compositions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compositions_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consumption_tracking ENABLE ROW LEVEL SECURITY;

DO $DO$
BEGIN
    DROP POLICY IF EXISTS "allow_all_authenticated" ON public.services;
    CREATE POLICY "allow_all_authenticated" ON public.services FOR ALL TO authenticated USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "allow_all_authenticated" ON public.compositions;
    CREATE POLICY "allow_all_authenticated" ON public.compositions FOR ALL TO authenticated USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "allow_all_authenticated" ON public.work_services;
    CREATE POLICY "allow_all_authenticated" ON public.work_services FOR ALL TO authenticated USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "allow_all_authenticated" ON public.compositions_history;
    CREATE POLICY "allow_all_authenticated" ON public.compositions_history FOR ALL TO authenticated USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "allow_all_authenticated" ON public.consumption_tracking;
    CREATE POLICY "allow_all_authenticated" ON public.consumption_tracking FOR ALL TO authenticated USING (true) WITH CHECK (true);
END $DO$;

CREATE OR REPLACE FUNCTION public.snapshot_work_service_composition()
RETURNS TRIGGER AS $FN$
BEGIN
    INSERT INTO public.compositions_history (work_service_id, material_id, coefficient, waste_percentage)
    SELECT NEW.id, c.material_id, c.coefficient, c.waste_percentage
    FROM public.compositions c
    WHERE c.service_id = NEW.service_id;
    RETURN NEW;
END;
$FN$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_work_service_created ON public.work_services;
CREATE TRIGGER on_work_service_created
AFTER INSERT ON public.work_services
FOR EACH ROW
EXECUTE FUNCTION public.snapshot_work_service_composition();

DO $DO$
DECLARE
    mat_tijolo_id UUID := gen_random_uuid();
    mat_cimento_id UUID := gen_random_uuid();
    mat_areia_id UUID := gen_random_uuid();
    mat_cal_id UUID := gen_random_uuid();
    mat_piso_id UUID := gen_random_uuid();
    mat_argamassa_id UUID := gen_random_uuid();
    mat_tinta_id UUID := gen_random_uuid();
    mat_selador_id UUID := gen_random_uuid();

    srv_alvenaria_id UUID := gen_random_uuid();
    srv_chapisco_id UUID := gen_random_uuid();
    srv_reboco_id UUID := gen_random_uuid();
    srv_contrapiso_id UUID := gen_random_uuid();
    srv_piso_id UUID := gen_random_uuid();
    srv_pintura_id UUID := gen_random_uuid();
BEGIN
    -- Materials idempotency
    IF NOT EXISTS (SELECT 1 FROM public.materials WHERE name = 'Tijolo Cerâmico 9x19x19cm') THEN
        INSERT INTO public.materials (id, name, unit_of_measure, category) VALUES (mat_tijolo_id, 'Tijolo Cerâmico 9x19x19cm', 'un', 'Alvenaria');
    ELSE
        SELECT id INTO mat_tijolo_id FROM public.materials WHERE name = 'Tijolo Cerâmico 9x19x19cm' LIMIT 1;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.materials WHERE name = 'Cimento CP II 50kg') THEN
        INSERT INTO public.materials (id, name, unit_of_measure, category) VALUES (mat_cimento_id, 'Cimento CP II 50kg', 'sc', 'Aglomerantes');
    ELSE
        SELECT id INTO mat_cimento_id FROM public.materials WHERE name = 'Cimento CP II 50kg' LIMIT 1;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.materials WHERE name = 'Areia Média') THEN
        INSERT INTO public.materials (id, name, unit_of_measure, category) VALUES (mat_areia_id, 'Areia Média', 'm3', 'Agregados');
    ELSE
        SELECT id INTO mat_areia_id FROM public.materials WHERE name = 'Areia Média' LIMIT 1;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.materials WHERE name = 'Cal Hidratada 20kg') THEN
        INSERT INTO public.materials (id, name, unit_of_measure, category) VALUES (mat_cal_id, 'Cal Hidratada 20kg', 'sc', 'Aglomerantes');
    ELSE
        SELECT id INTO mat_cal_id FROM public.materials WHERE name = 'Cal Hidratada 20kg' LIMIT 1;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.materials WHERE name = 'Piso Cerâmico 60x60cm') THEN
        INSERT INTO public.materials (id, name, unit_of_measure, category) VALUES (mat_piso_id, 'Piso Cerâmico 60x60cm', 'm2', 'Revestimentos');
    ELSE
        SELECT id INTO mat_piso_id FROM public.materials WHERE name = 'Piso Cerâmico 60x60cm' LIMIT 1;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.materials WHERE name = 'Argamassa ACII 20kg') THEN
        INSERT INTO public.materials (id, name, unit_of_measure, category) VALUES (mat_argamassa_id, 'Argamassa ACII 20kg', 'sc', 'Aglomerantes');
    ELSE
        SELECT id INTO mat_argamassa_id FROM public.materials WHERE name = 'Argamassa ACII 20kg' LIMIT 1;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.materials WHERE name = 'Tinta Acrílica Branca 18L') THEN
        INSERT INTO public.materials (id, name, unit_of_measure, category) VALUES (mat_tinta_id, 'Tinta Acrílica Branca 18L', 'l', 'Pintura');
    ELSE
        SELECT id INTO mat_tinta_id FROM public.materials WHERE name = 'Tinta Acrílica Branca 18L' LIMIT 1;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.materials WHERE name = 'Selador Acrílico 18L') THEN
        INSERT INTO public.materials (id, name, unit_of_measure, category) VALUES (mat_selador_id, 'Selador Acrílico 18L', 'l', 'Pintura');
    ELSE
        SELECT id INTO mat_selador_id FROM public.materials WHERE name = 'Selador Acrílico 18L' LIMIT 1;
    END IF;

    -- Services and Compositions
    -- Alvenaria
    IF NOT EXISTS (SELECT 1 FROM public.services WHERE name = 'Alvenaria de Vedação SINAPI') THEN
        INSERT INTO public.services (id, name, unit) VALUES (srv_alvenaria_id, 'Alvenaria de Vedação SINAPI', 'm2');
        INSERT INTO public.compositions (service_id, material_id, coefficient, waste_percentage) VALUES
        (srv_alvenaria_id, mat_tijolo_id, 25, 5),
        (srv_alvenaria_id, mat_cimento_id, 0.15, 5),
        (srv_alvenaria_id, mat_areia_id, 0.015, 10);
    END IF;

    -- Chapisco
    IF NOT EXISTS (SELECT 1 FROM public.services WHERE name = 'Chapisco SINAPI') THEN
        INSERT INTO public.services (id, name, unit) VALUES (srv_chapisco_id, 'Chapisco SINAPI', 'm2');
        INSERT INTO public.compositions (service_id, material_id, coefficient, waste_percentage) VALUES
        (srv_chapisco_id, mat_cimento_id, 0.05, 5),
        (srv_chapisco_id, mat_areia_id, 0.005, 10);
    END IF;

    -- Reboco
    IF NOT EXISTS (SELECT 1 FROM public.services WHERE name = 'Reboco SINAPI') THEN
        INSERT INTO public.services (id, name, unit) VALUES (srv_reboco_id, 'Reboco SINAPI', 'm2');
        INSERT INTO public.compositions (service_id, material_id, coefficient, waste_percentage) VALUES
        (srv_reboco_id, mat_cimento_id, 0.1, 5),
        (srv_reboco_id, mat_cal_id, 0.1, 5),
        (srv_reboco_id, mat_areia_id, 0.018, 10);
    END IF;

    -- Contrapiso
    IF NOT EXISTS (SELECT 1 FROM public.services WHERE name = 'Contrapiso SINAPI') THEN
        INSERT INTO public.services (id, name, unit) VALUES (srv_contrapiso_id, 'Contrapiso SINAPI', 'm2');
        INSERT INTO public.compositions (service_id, material_id, coefficient, waste_percentage) VALUES
        (srv_contrapiso_id, mat_cimento_id, 0.2, 5),
        (srv_contrapiso_id, mat_areia_id, 0.025, 10);
    END IF;

    -- Piso
    IF NOT EXISTS (SELECT 1 FROM public.services WHERE name = 'Assentamento de Piso Cerâmico SINAPI') THEN
        INSERT INTO public.services (id, name, unit) VALUES (srv_piso_id, 'Assentamento de Piso Cerâmico SINAPI', 'm2');
        INSERT INTO public.compositions (service_id, material_id, coefficient, waste_percentage) VALUES
        (srv_piso_id, mat_piso_id, 1, 10),
        (srv_piso_id, mat_argamassa_id, 0.25, 5);
    END IF;

    -- Pintura
    IF NOT EXISTS (SELECT 1 FROM public.services WHERE name = 'Pintura Acrílica 2 Demãos SINAPI') THEN
        INSERT INTO public.services (id, name, unit) VALUES (srv_pintura_id, 'Pintura Acrílica 2 Demãos SINAPI', 'm2');
        INSERT INTO public.compositions (service_id, material_id, coefficient, waste_percentage) VALUES
        (srv_pintura_id, mat_tinta_id, 0.25, 5),
        (srv_pintura_id, mat_selador_id, 0.15, 5);
    END IF;

END $DO$;
