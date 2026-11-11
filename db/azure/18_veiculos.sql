-- Veículos da empresa: cadastro, manutenções e notas fiscais de combustível (abastecimentos).
--  * vehicles: placa, marca, modelo, ano, tipo, combustível, chassi/renavam, km atual, responsável, obra,
--    vencimentos (licenciamento e seguro), compra
--  * vehicle_maintenances: cada manutenção (tipo, km, oficina, custo, próxima revisão por data e/ou km)
--  * vehicle_fuel_receipts: cada abastecimento / nota fiscal de combustível (posto, litros, valor, km, nota, arquivo)
-- O km atual do veículo acompanha o maior km lançado nas manutenções e nos abastecimentos (gatilho).
-- Acesso: só Admin e Gestor (o Prestador não usa esta área). Valores (compra, custo, preço do litro, total da nota)
-- são escondidos do Gestor pela API (server/mask.ts).
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plate TEXT NOT NULL,
  brand TEXT,                                  -- marca
  model TEXT NOT NULL,
  year INTEGER CHECK (year BETWEEN 1950 AND 2100),
  color TEXT,
  vehicle_type TEXT,                           -- carro, caminhonete, caminhão, moto, utilitário...
  fuel_type TEXT,
  chassis TEXT,
  renavam TEXT,
  odometer_km INTEGER NOT NULL DEFAULT 0 CHECK (odometer_km >= 0),
  driver_id UUID REFERENCES public.team_members(id) ON DELETE SET NULL,   -- responsável
  work_id UUID REFERENCES public.works(id) ON DELETE SET NULL,            -- obra atual
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'inactive')),
  purchase_date DATE,
  purchase_value NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (purchase_value >= 0),
  insurance_expiry DATE,
  licensing_expiry DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_vehicles_plate ON public.vehicles (upper(btrim(plate)));
CREATE INDEX IF NOT EXISTS idx_vehicles_driver_id ON public.vehicles(driver_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_work_id ON public.vehicles(work_id);

CREATE TABLE IF NOT EXISTS public.vehicle_maintenances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  maintenance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  maintenance_type TEXT,                       -- revisão, troca de óleo, pneus, freios, corretiva...
  description TEXT,
  odometer_km INTEGER CHECK (odometer_km >= 0),
  performed_by TEXT,                           -- oficina / mecânico
  maintenance_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (maintenance_cost >= 0),
  next_due_date DATE,                          -- próxima revisão por data
  next_due_km INTEGER CHECK (next_due_km >= 0),-- ...e/ou por km
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);
CREATE INDEX IF NOT EXISTS idx_vehicle_maintenances_vehicle_id ON public.vehicle_maintenances(vehicle_id);

CREATE TABLE IF NOT EXISTS public.vehicle_fuel_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
  station TEXT,                                -- posto
  fuel_type TEXT,
  liters NUMERIC(10,2) NOT NULL CHECK (liters > 0),
  price_per_liter NUMERIC(10,3) NOT NULL DEFAULT 0 CHECK (price_per_liter >= 0),
  total_value NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_value >= 0),
  odometer_km INTEGER CHECK (odometer_km >= 0),
  invoice_number TEXT,                         -- nº da nota fiscal / cupom
  receipt_url TEXT,                            -- foto ou PDF da nota
  notes TEXT,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);
CREATE INDEX IF NOT EXISTS idx_vehicle_fuel_receipts_vehicle_id ON public.vehicle_fuel_receipts(vehicle_id);

-- km atual do veículo = maior km já lançado
CREATE OR REPLACE FUNCTION public.bump_vehicle_odometer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.odometer_km IS NOT NULL THEN
    UPDATE public.vehicles
       SET odometer_km = GREATEST(odometer_km, NEW.odometer_km)
     WHERE id = NEW.vehicle_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_bump_odometer_maintenance ON public.vehicle_maintenances;
CREATE TRIGGER trg_bump_odometer_maintenance
  AFTER INSERT OR UPDATE OF odometer_km ON public.vehicle_maintenances
  FOR EACH ROW EXECUTE FUNCTION public.bump_vehicle_odometer();
DROP TRIGGER IF EXISTS trg_bump_odometer_fuel ON public.vehicle_fuel_receipts;
CREATE TRIGGER trg_bump_odometer_fuel
  AFTER INSERT OR UPDATE OF odometer_km ON public.vehicle_fuel_receipts
  FOR EACH ROW EXECUTE FUNCTION public.bump_vehicle_odometer();

-- permissões: só a equipe interna (Admin e Gestor)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['vehicles', 'vehicle_maintenances', 'vehicle_fuel_receipts'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_staff_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO obras_authenticated USING (public.is_staff()) WITH CHECK (public.is_staff())',
      t || '_staff_all', t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicles, public.vehicle_maintenances, public.vehicle_fuel_receipts TO obras_authenticated;
