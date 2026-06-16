CREATE OR REPLACE FUNCTION public.recalculate_extra_material_quantity()
RETURNS trigger AS $$
DECLARE
  v_total_area numeric;
BEGIN
  IF NEW.consumption_per_m2 IS NOT NULL THEN
    SELECT COALESCE(total_area, 0) INTO v_total_area FROM public.works WHERE id = NEW.work_id;
    NEW.quantity := NEW.consumption_per_m2 * v_total_area;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_extra_material_consumption_update ON public.work_extra_materials;
CREATE TRIGGER on_extra_material_consumption_update
  BEFORE INSERT OR UPDATE OF consumption_per_m2, work_id
  ON public.work_extra_materials
  FOR EACH ROW
  EXECUTE FUNCTION public.recalculate_extra_material_quantity();
