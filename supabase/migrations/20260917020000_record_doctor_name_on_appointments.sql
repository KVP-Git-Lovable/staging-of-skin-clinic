-- Keep the doctor's NAME on the appointment, whether or not they are staff.
--
-- Nine doctors who worked here between 2020 and 2026 - Oliver Clement Lobo,
-- Suvir M, Aravind Suprakasan, Varsha Gowda, Nihal Rai, Malcolm Pinto, Swati
-- Prasanna, Suprabha Shetty, Gaurav Shetty - are not in the staff table, and the
-- clinic does not want staff records created for them. Their 3,640 appointments
-- therefore have staff_id = NULL and show no doctor anywhere, even though
-- Salesforce recorded exactly who saw the patient.
--
-- staff_id answers "which staff member is this", which is the right question for
-- booking, permissions and workload. It is the wrong question for a report on
-- 2021, where the answer is simply a name. So record the name too, the same way
-- appointments already denormalizes patient_name.
--
-- This also releases the 3,640 rows that 20260917000000 deliberately left alone.
-- They kept their "(Dr. ...)" suffix because the text was the only record of the
-- doctor; once doctor_name holds it, that is no longer true and the Investigation
-- column can finally be clean for every row.

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS doctor_name text;

COMMENT ON COLUMN public.appointments.doctor_name IS
  'Who saw the patient, as a name. Set from staff when staff_id is filled, otherwise from Salesforce - so a doctor who never had a staff record still appears in lists and reports.';

-- 1. The doctors with no staff record: take the name from the appended suffix.
UPDATE public.appointments
   SET doctor_name = btrim(substring(reason_for_consultation from '\(Dr\.\s([^()]*)\)\s*$'))
 WHERE doctor_name IS NULL
   AND staff_id IS NULL
   AND reason_for_consultation ~ '\(Dr\.\s[^()]*\)\s*$';

-- 2. Everyone else: the staff record is the canonical spelling.
UPDATE public.appointments a
   SET doctor_name = btrim(s.first_name || ' ' || s.last_name)
  FROM public.staff s
 WHERE s.id = a.staff_id
   AND a.doctor_name IS DISTINCT FROM btrim(s.first_name || ' ' || s.last_name);

-- 3. Keep it that way without anyone having to remember.
--
-- Only ever fills in from staff_id; it never blanks a name. An appointment whose
-- doctor is not staff keeps whatever name it was given, which is the entire
-- point - and assigning a real staff member later replaces it with their
-- canonical spelling.
CREATE OR REPLACE FUNCTION public.set_appointment_doctor_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.staff_id IS NOT NULL THEN
    SELECT btrim(s.first_name || ' ' || s.last_name)
      INTO NEW.doctor_name
      FROM public.staff s
     WHERE s.id = NEW.staff_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_appointment_doctor_name ON public.appointments;
CREATE TRIGGER set_appointment_doctor_name
  BEFORE INSERT OR UPDATE OF staff_id ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.set_appointment_doctor_name();

-- 4. Now the suffix really is redundant, so finish the cleanup that
--    20260917000000 could only do half of. The staff_id guard it needed is gone:
--    a row is safe to strip once its doctor is recorded in EITHER column.
UPDATE public.appointments
   SET reason_for_consultation =
         nullif(btrim(regexp_replace(reason_for_consultation, '\s*\(Dr\.\s[^()]*\)\s*$', '')), '')
 WHERE source = 'salesforce'
   AND reason_for_consultation ~ '\(Dr\.\s[^()]*\)\s*$'
   AND (staff_id IS NOT NULL OR btrim(coalesce(doctor_name, '')) <> '');
