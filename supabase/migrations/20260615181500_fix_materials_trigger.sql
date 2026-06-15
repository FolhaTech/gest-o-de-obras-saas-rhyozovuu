CREATE OR REPLACE FUNCTION public.recalculate_extra_materials_on_area_update()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.total_area IS DISTINCT FROM NEW.total_area THEN
    UPDATE public.work_extra_materials
    SET quantity = CASE 
      WHEN COALESCE(NEW.total_area, 0) > 0 AND consumption_per_m2 > 0 THEN consumption_per_m2 * NEW.total_area
      ELSE 0
    END
    WHERE work_id = NEW.id AND consumption_per_m2 IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$function$;
