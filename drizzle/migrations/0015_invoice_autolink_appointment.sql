CREATE OR REPLACE FUNCTION public.autolink_invoice_appointment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _ids uuid[];
BEGIN
  IF NEW.appointment_id IS NULL AND NEW.patient_id IS NOT NULL AND NEW.sf_id IS NULL THEN
    SELECT array_agg(a.id) INTO _ids FROM public.appointments a
    WHERE a.patient_id = NEW.patient_id
      AND coalesce(a.status,'') <> 'Cancelled'
      AND (a.start_time AT TIME ZONE 'Asia/Kolkata')::date = (coalesce(NEW.created_at, now()) AT TIME ZONE 'Asia/Kolkata')::date;
    IF array_length(_ids,1) = 1 THEN NEW.appointment_id := _ids[1]; END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS autolink_invoice_appointment ON public.invoices;
CREATE TRIGGER autolink_invoice_appointment BEFORE INSERT ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.autolink_invoice_appointment();