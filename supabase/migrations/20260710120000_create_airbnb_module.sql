-- Migração: Criação do módulo Airbnb / Gestão de Imóveis de Temporada
-- Permite vincular imóveis a obras finalizadas/concluídas, gerenciar aluguéis/temporadas, receitas e despesas.

CREATE TABLE IF NOT EXISTS public.airbnb_properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID REFERENCES public.works(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  daily_rate NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ativo',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE TABLE IF NOT EXISTS public.airbnb_rentals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.airbnb_properties(id) ON DELETE CASCADE,
  guest_name TEXT,
  guests_count INTEGER NOT NULL DEFAULT 1,
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  total_value NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE TABLE IF NOT EXISTS public.airbnb_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.airbnb_properties(id) ON DELETE CASCADE,
  rental_id UUID REFERENCES public.airbnb_rentals(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('revenue', 'expense')),
  category TEXT NOT NULL DEFAULT 'Geral',
  description TEXT NOT NULL,
  value NUMERIC NOT NULL DEFAULT 0,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE INDEX IF NOT EXISTS idx_airbnb_properties_work_id ON public.airbnb_properties(work_id);
CREATE INDEX IF NOT EXISTS idx_airbnb_properties_status ON public.airbnb_properties(status);
CREATE INDEX IF NOT EXISTS idx_airbnb_rentals_property_id ON public.airbnb_rentals(property_id);
CREATE INDEX IF NOT EXISTS idx_airbnb_rentals_dates ON public.airbnb_rentals(check_in, check_out);
CREATE INDEX IF NOT EXISTS idx_airbnb_transactions_property_id ON public.airbnb_transactions(property_id);
CREATE INDEX IF NOT EXISTS idx_airbnb_transactions_rental_id ON public.airbnb_transactions(rental_id);
CREATE INDEX IF NOT EXISTS idx_airbnb_transactions_type_date ON public.airbnb_transactions(type, date);

DO $$
DECLARE
  t TEXT;
  airbnb_tables TEXT[] := ARRAY['airbnb_properties', 'airbnb_rentals', 'airbnb_transactions'];
BEGIN
  FOREACH t IN ARRAY airbnb_tables
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS "Allow authenticated full access" ON public.%I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "Allow auth all on %s" ON public.%I;', t, t);
    EXECUTE format(
      'CREATE POLICY "Allow authenticated full access" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true);',
      t
    );
    EXECUTE format('DROP POLICY IF EXISTS "Allow anon full access" ON public.%I;', t);
    EXECUTE format(
      'CREATE POLICY "Allow anon full access" ON public.%I FOR ALL TO anon USING (true) WITH CHECK (true);',
      t
    );
  END LOOP;
END $$;
