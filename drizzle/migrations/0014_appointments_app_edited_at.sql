ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS app_edited_at timestamptz;
UPDATE public.appointments SET app_edited_at = now() WHERE sf_id IS NOT NULL AND updated_by IS NOT NULL;
CREATE OR REPLACE FUNCTION public.stamp_appointment_app_edit()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.app_edited_at := now();
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS stamp_appointment_app_edit ON public.appointments;
CREATE TRIGGER stamp_appointment_app_edit BEFORE UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.stamp_appointment_app_edit();