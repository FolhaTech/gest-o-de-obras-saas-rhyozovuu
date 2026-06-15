DO $$
DECLARE
  cement_id UUID := '11111111-1111-1111-1111-111111111111';
  sand_id UUID := '22222222-2222-2222-2222-222222222222';
  brick_id UUID := '33333333-3333-3333-3333-333333333333';
  steel_id UUID := '44444444-4444-4444-4444-444444444444';
BEGIN
  -- Insert some basic materials to ensure the catalog linking works
  INSERT INTO public.materials (id, name, unit_of_measure, category, status)
  VALUES 
    (cement_id, 'Cimento CP II 50kg', 'Saco', 'Básico', 'active'),
    (sand_id, 'Areia Média Lavada', 'm³', 'Básico', 'active'),
    (brick_id, 'Tijolo Cerâmico 6 Furos', 'Milheiro', 'Alvenaria', 'active'),
    (steel_id, 'Aço CA50 10mm', 'Barra', 'Estrutura', 'active')
  ON CONFLICT (id) DO NOTHING;
END $$;
