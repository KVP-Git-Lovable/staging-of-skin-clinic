-- An appointment stores the patient twice: patient_id, the link to the record,
-- and patient_name, a text copy written when it was booked. Nothing kept the
-- copy in step with the record it points at, so the list could read one name
-- while the page behind it read another.
--
-- A family of four sharing one phone number made it visible. The fifth session
-- of Baazi's monthly course - 1rx on 5 May, 2rx on 13 July, 3rx on 10 August,
-- 4rx on 10 September, 5rx on 10 October - was filed under her sister Saher's
-- name, and so was the paid bill for the September session. The list read
-- Saher, the appointment read Baazi, and the row even carried Baazi's photo
-- next to the text "Saher".
--
-- 20260923060000 read exactly these rows the other way: as deliberate bookings
-- made for a family member on someone else's record, and protected them. The
-- course history shows that was wrong - it is one slot in the middle of one
-- patient's own treatment. This migration reverses that reading.

-- 1. The copy is filled from the record, on booking and whenever an appointment
--    or a bill is moved to a different patient.
--
--    Only ever fills in from patient_id; a row whose patient link is empty -
--    a walk-in bill, or an invoice whose patient record was deleted, which sets
--    the link to NULL - keeps the name it was given. That is the whole point:
--    the name outlives the link.
CREATE OR REPLACE FUNCTION public.set_record_patient_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.patient_id IS NOT NULL THEN
    SELECT regexp_replace(trim(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')), '\s+', ' ', 'g')
      INTO NEW.patient_name
      FROM public.patients p
     WHERE p.id = NEW.patient_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Fires only on insert and on a change of patient, so no existing row is
-- rewritten by creating it. It also makes the duplicate-merge dialog correct by
-- construction: it re-points patient_id and left the old name behind.
DROP TRIGGER IF EXISTS appointments_set_patient_name ON public.appointments;
CREATE TRIGGER appointments_set_patient_name
  BEFORE INSERT OR UPDATE OF patient_id ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.set_record_patient_name();

DROP TRIGGER IF EXISTS invoices_set_patient_name ON public.invoices;
CREATE TRIGGER invoices_set_patient_name
  BEFORE INSERT OR UPDATE OF patient_id ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_record_patient_name();

-- 2. A rename now reaches every row on that record, not only the ones that
--    already agreed with it.
--
--    The old version updated a copy only where it still matched the patient's
--    previous name, to preserve what it took to be family bookings. With the
--    trigger above keeping the copies in step there is nothing left for that
--    exception to protect, and all it does now is let a drifted copy survive a
--    rename forever.
CREATE OR REPLACE FUNCTION public.propagate_patient_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _old text := regexp_replace(trim(COALESCE(OLD.first_name,'') || ' ' || COALESCE(OLD.last_name,'')), '\s+', ' ', 'g');
  _new text := regexp_replace(trim(COALESCE(NEW.first_name,'') || ' ' || COALESCE(NEW.last_name,'')), '\s+', ' ', 'g');
BEGIN
  IF _old = _new THEN RETURN NEW; END IF;

  UPDATE appointments SET patient_name = _new, updated_at = updated_at
  WHERE patient_id = NEW.id
    AND COALESCE(patient_name, '') IS DISTINCT FROM _new;

  UPDATE invoices SET patient_name = _new, updated_at = updated_at
  WHERE patient_id = NEW.id
    AND COALESCE(patient_name, '') IS DISTINCT FROM _new;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.propagate_patient_name() IS
  'Keeps appointments.patient_name and invoices.patient_name in step with the '
  'patient record when that record is renamed. Updates every row on the record: '
  'the earlier exception for copies that had drifted is gone, because '
  'set_record_patient_name now stops them drifting in the first place.';

-- 3. The rows that had already drifted, named one at a time.
--
-- Of 56,776 appointments and 47,257 invoices, six carried a name that differed
-- from the record once whitespace is ignored. Four are repaired here. The
-- value comes from the patient record itself, so it is exactly what the trigger
-- above would have written.
--
-- DELIBERATELY NOT TOUCHED: appointment 3500cb3b-2d7b-4909-969e-0a6111101854
-- and invoice 57965f88-b07b-4ffa-aac1-45483be2520a (B-48937), the 19 September
-- "Adan" on Arsh's record. Adan has their own record with three visits on it, so
-- this is either a visit filed on the wrong sibling or a mistyped name, and the
-- clinic is settling which. Every statement below names its target by id so
-- neither can be caught by accident.
-- What each row said before, kept whole, so nothing here is one-way.
CREATE TABLE IF NOT EXISTS public.patient_name_backup_20261006 (
  record_kind text NOT NULL,
  record_id uuid NOT NULL,
  previous_patient_name text,
  patient_id uuid,
  backed_up_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (record_kind, record_id)
);
INSERT INTO public.patient_name_backup_20261006 (record_kind, record_id, previous_patient_name, patient_id) VALUES
  ('appointments', 'c4dfe4e6-f362-40e5-9fed-916d8e7dc229', 'Saher',     '5b038cb6-9434-4848-a058-2306d7b5ffc4'),
  ('appointments', 'c7bb7033-ff22-4d47-b298-e9a756b270cd', 'Safa',      'ef7dfdd3-85f2-49c2-a477-72565ad37eb8'),
  ('appointments', '2993f230-c208-45c5-bf20-4f163925af48', 'Raj Singh', '1d7f60e6-8fc6-4f51-8dcb-a54614192e68'),
  ('invoices',     'cc592373-250f-49b0-b98d-e68866f2425f', 'Saher',     '5b038cb6-9434-4848-a058-2306d7b5ffc4')
ON CONFLICT (record_kind, record_id) DO NOTHING;

UPDATE public.appointments a
SET patient_name = regexp_replace(trim(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')), '\s+', ' ', 'g'),
    updated_at = a.updated_at
FROM public.patients p
WHERE p.id = a.patient_id
  AND a.id IN (
    'c4dfe4e6-f362-40e5-9fed-916d8e7dc229',  -- 10 Oct, "Saher" -> Baazi
    'c7bb7033-ff22-4d47-b298-e9a756b270cd',  -- 21 Sep, "Safa" -> Safah Ayesha
    '2993f230-c208-45c5-bf20-4f163925af48'   -- 29 Oct, "Raj Singh" -> Raju Singh
  );

-- B-48596, the paid 10 September bill for the fourth session of that same
-- course. The name only: no amount, tax, status, payment or line is touched.
UPDATE public.invoices i
SET patient_name = regexp_replace(trim(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')), '\s+', ' ', 'g'),
    updated_at = i.updated_at
FROM public.patients p
WHERE p.id = i.patient_id
  AND i.id = 'cc592373-250f-49b0-b98d-e68866f2425f';
