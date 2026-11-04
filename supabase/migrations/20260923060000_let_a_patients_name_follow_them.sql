-- A patient's name, corrected on their record, never reached their bookings.
--
-- A patient booked as "Sourab Ali" was corrected to "Saharap Ali" on the
-- patient record, and the appointment list went on showing the old name.
--
-- WHY
--
-- appointments.patient_name is a copy of the name taken when the row was
-- written: the importer does `patient_name: p.name` (sf-import-clinical
-- index.ts:375, 573, 625), reading the local patient's name at that moment.
-- Nothing updated those copies afterwards, and the lists, the invoice PDF and
-- global search all read the copy rather than the patient record. So editing a
-- patient could never show up anywhere it mattered.
--
-- It was not one patient: 874 appointments and 724 invoices were showing a
-- name their patient record no longer had, across 246 patients.
--
-- WHAT RENAMED THEM
--
-- Only one of the 246 was a manual correction. 245 had a name on 21 September
-- that exactly matched what their appointments still showed, and 260 patient
-- names changed after that date in batches. That is sf-refresh-patient-names
-- doing its job: the 23 April bulk load created patients with the names in
-- that file, sf_link_patients_bulk attached Salesforce ids by matching phone
-- numbers and never touched names, so thousands of patients carried the bulk
-- file's name while Salesforce held the real one.
--
-- Which means the patient record holds the correct name and the copies are the
-- stale ones. Some differences look like different people entirely (Ashok ->
-- Suma Rai) because the April file often held the phone's owner rather than
-- the patient; the appointment copy descends from that same April name, so it
-- agreeing with the old value proves nothing about which is right.
--
-- WHAT THIS DOES
--
-- Copies the name from the patient record onto appointments and invoices, and
-- adds a trigger so the next correction arrives on its own.
--
-- It does NOT touch patients.first_name/last_name, patient_id links, invoice
-- amounts, invoice numbers or line items - verified after running: 0 links and
-- 0 amounts changed, 871 appointment names and 722 invoice names corrected.
-- Previous values are kept whole in appointment_name_backup_20260923 and
-- invoice_name_backup_20260923.
--
-- LEFT ALONE ON PURPOSE
--
-- Three bookings made for a family member on someone else's record - "Adan" on
-- Arsh's, "Saher" on Baazi's, "Safa" on Safah Ayesha's. Those names are not
-- stale, they say who the visit was for, and overwriting them would erase
-- that. The rule below spots them: a record whose appointments carry two names
-- that are not variants of one another is a shared record, not a renamed one.
--
-- For the same reason the screens still show this stored copy in preference to
-- the joined patient name. The copy is now correct AND carries the family
-- bookings; preferring the join would print "Arsh" over Adan's appointment.

WITH shared_record AS (
  SELECT a.patient_id
  FROM appointments a
  JOIN appointments b ON b.patient_id = a.patient_id AND b.patient_name <> a.patient_name
  WHERE similarity(lower(trim(a.patient_name)), lower(trim(b.patient_name))) < 0.4
  GROUP BY a.patient_id
)
UPDATE public.appointments a
SET patient_name = regexp_replace(trim(p.first_name || ' ' || COALESCE(p.last_name,'')), '\s+', ' ', 'g'),
    updated_at = a.updated_at
FROM public.patients p
WHERE p.id = a.patient_id
  AND a.patient_id NOT IN (SELECT patient_id FROM shared_record)
  AND lower(regexp_replace(trim(COALESCE(a.patient_name,'')), '\s+', ' ', 'g'))
   <> lower(regexp_replace(trim(p.first_name || ' ' || COALESCE(p.last_name,'')), '\s+', ' ', 'g'));

WITH shared_record AS (
  SELECT a.patient_id
  FROM appointments a
  JOIN appointments b ON b.patient_id = a.patient_id AND b.patient_name <> a.patient_name
  WHERE similarity(lower(trim(a.patient_name)), lower(trim(b.patient_name))) < 0.4
  GROUP BY a.patient_id
)
UPDATE public.invoices i
SET patient_name = regexp_replace(trim(p.first_name || ' ' || COALESCE(p.last_name,'')), '\s+', ' ', 'g'),
    updated_at = i.updated_at
FROM public.patients p
WHERE p.id = i.patient_id
  AND i.patient_id NOT IN (SELECT patient_id FROM shared_record)
  AND lower(regexp_replace(trim(COALESCE(i.patient_name,'')), '\s+', ' ', 'g'))
   <> lower(regexp_replace(trim(p.first_name || ' ' || COALESCE(p.last_name,'')), '\s+', ' ', 'g'));

-- And from here on the copies keep themselves in step, so this is a fix rather
-- than one more cleanup someone has to remember to re-run.
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

  -- Only copies that were in step with the record follow it. A copy that
  -- already said something else was deliberate - a family member's booking -
  -- and is left exactly as it is.
  UPDATE appointments SET patient_name = _new, updated_at = updated_at
  WHERE patient_id = NEW.id
    AND lower(regexp_replace(trim(COALESCE(patient_name,'')), '\s+', ' ', 'g')) = lower(_old);

  UPDATE invoices SET patient_name = _new, updated_at = updated_at
  WHERE patient_id = NEW.id
    AND lower(regexp_replace(trim(COALESCE(patient_name,'')), '\s+', ' ', 'g')) = lower(_old);

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS patients_propagate_name ON public.patients;
CREATE TRIGGER patients_propagate_name
AFTER UPDATE OF first_name, last_name ON public.patients
FOR EACH ROW EXECUTE FUNCTION public.propagate_patient_name();

COMMENT ON FUNCTION public.propagate_patient_name() IS
  'Keeps appointments.patient_name and invoices.patient_name in step with the '
  'patient record. Only updates copies that matched the previous name, so a '
  'booking deliberately made in someone else''s name is preserved.';
