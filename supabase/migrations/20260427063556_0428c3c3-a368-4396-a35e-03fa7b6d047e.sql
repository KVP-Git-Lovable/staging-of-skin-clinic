-- Validation trigger to prevent the same staff member from being double-booked
CREATE OR REPLACE FUNCTION public.validate_appointment_no_overlap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  conflict_row RECORD;
BEGIN
  -- Skip if no staff assigned
  IF NEW.staff_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip if this appointment itself is in an exempt status
  IF NEW.status IN ('Cancelled', 'No-show') THEN
    RETURN NEW;
  END IF;

  -- Look for an overlapping appointment for the same staff
  SELECT id, start_time, end_time, patient_name
  INTO conflict_row
  FROM public.appointments
  WHERE staff_id = NEW.staff_id
    AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND status NOT IN ('Cancelled', 'No-show')
    AND start_time < NEW.end_time
    AND end_time > NEW.start_time
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'This doctor already has an appointment from % to % (patient: %). Please pick a different slot.',
      to_char(conflict_row.start_time AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY HH24:MI'),
      to_char(conflict_row.end_time AT TIME ZONE 'Asia/Kolkata', 'HH24:MI'),
      COALESCE(conflict_row.patient_name, 'unknown')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_no_overlap ON public.appointments;
CREATE TRIGGER appointments_no_overlap
  BEFORE INSERT OR UPDATE OF start_time, end_time, staff_id, status
  ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_appointment_no_overlap();