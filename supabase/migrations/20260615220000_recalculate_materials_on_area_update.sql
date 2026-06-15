CREATE OR REPLACE FUNCTION public.recalculate_extra_materials_on_area_update()
RETURNS trigger AS $function$
BEGIN
  IF OLD.total_area IS DISTINCT FROM NEW.total_area THEN
    UPDATE public.work_extra_materials
    SET quantity = CASE 
      WHEN COALESCE(NEW.total_area, 0) > 0 AND consumption_per_m2 > 0 THEN consumption_per_m2 * NEW.total_area
      ELSE 1 
    END
    WHERE work_id = NEW.id AND consumption_per_m2 IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$function$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_works_area_update ON public.works;
CREATE TRIGGER on_works_area_update
  AFTER UPDATE OF total_area ON public.works
  FOR EACH ROW EXECUTE FUNCTION public.recalculate_extra_materials_on_area_update();
