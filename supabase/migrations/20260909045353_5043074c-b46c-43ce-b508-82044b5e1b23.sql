CREATE OR REPLACE FUNCTION public.complete_appointment_on_invoice_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'Paid' AND NEW.appointment_id IS NOT NULL THEN
    UPDATE public.appointments
    SET status = 'Completed'
    WHERE id = NEW.appointment_id
      AND status NOT IN ('Cancelled', 'No Show', 'Completed')
      AND start_time <= now();
  END IF;
  RETURN NEW;
END;
$$;

UPDATE public.appointments
SET status = 'Confirmed'
WHERE status IN ('Completed', 'No Show')
  AND start_time > now();