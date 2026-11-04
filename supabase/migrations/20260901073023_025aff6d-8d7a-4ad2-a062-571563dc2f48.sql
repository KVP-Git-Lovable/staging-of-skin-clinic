CREATE OR REPLACE FUNCTION public.validate_appointment_no_overlap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  conflict_row RECORD;
BEGIN
  -- Skip historical rows imported from Salesforce: they are a record of what
  -- already happened, not a new booking, and must never be blocked.
  IF NEW.sf_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.staff_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('Cancelled', 'No-show') THEN
    RETURN NEW;
  END IF;

  SELECT id, start_time, end_time, patient_name
  INTO conflict_row
  FROM public.appointments
  WHERE staff_id = NEW.staff_id
    AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND sf_id IS NULL
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

UPDATE public.patients SET sf_clinical_synced_at = NULL WHERE sf_clinical_synced_at IS NOT NULL;