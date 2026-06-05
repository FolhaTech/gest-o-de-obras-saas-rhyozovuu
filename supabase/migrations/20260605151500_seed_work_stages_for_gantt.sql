DO $$
DECLARE
  w_id uuid;
BEGIN
  -- get the first work or create one if none exists
  SELECT id INTO w_id FROM public.works LIMIT 1;
  
  IF w_id IS NOT NULL THEN
    INSERT INTO public.work_stages (id, work_id, name, start_date, end_date_planned, end_date_real, progress_percentage, status)
    VALUES 
      ('a0000000-0000-0000-0000-000000000001'::uuid, w_id, 'Fundações e Terraplanagem', (CURRENT_DATE - INTERVAL '30 days')::date, (CURRENT_DATE - INTERVAL '15 days')::date, (CURRENT_DATE - INTERVAL '10 days')::date, 100, 'completed'),
      ('a0000000-0000-0000-0000-000000000002'::uuid, w_id, 'Estrutura e Alvenaria', (CURRENT_DATE - INTERVAL '10 days')::date, (CURRENT_DATE + INTERVAL '20 days')::date, NULL, 40, 'in_progress'),
      ('a0000000-0000-0000-0000-000000000003'::uuid, w_id, 'Instalações Elétricas e Hidráulicas', (CURRENT_DATE + INTERVAL '10 days')::date, (CURRENT_DATE + INTERVAL '30 days')::date, NULL, 0, 'pending'),
      ('a0000000-0000-0000-0000-000000000004'::uuid, w_id, 'Acabamentos Internos', (CURRENT_DATE + INTERVAL '20 days')::date, (CURRENT_DATE + INTERVAL '50 days')::date, NULL, 0, 'pending')
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;
