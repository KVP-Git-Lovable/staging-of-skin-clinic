-- Date imported prescriptions by the visit they belong to, not by the day
-- someone typed them up.
--
-- Diagnosis__c carries no date of its own, so sf-import-clinical used
-- CreatedDate. For 156 of 21,979 linked prescriptions that is not the visit
-- date, because the record was written up afterwards - days in most cases,
-- years in a few. 66 of those then read as duplicates on the patient's page:
-- a prescription with no treatment of its own borrows its label from the
-- appointment it is linked to, so the row shows the visit's service name
-- against a different date, beside the row that legitimately sits on the visit.
--
-- Reported by the clinic on Nisha (9036276451), whose 14 May "Review+ 1rx
-- Peel B" also appeared on 17 June. Salesforce never shows that pairing -
-- it files a prescription under the appointment it is linked to, which is
-- what this migration makes the app do too.
--
-- created_at still holds the Salesforce CreatedDate, so when the record was
-- typed up is not lost; it just stops standing in for when the patient was seen.
-- procedureDate.ts makes the importer agree from now on.

BEGIN;

-- Reversible: every row this touches, exactly as it was.
CREATE TABLE IF NOT EXISTS public.procedures_date_backup_20260921 AS
SELECT p.*
FROM public.procedures p
JOIN public.appointments a ON a.id = p.appointment_id
WHERE p.sf_id IS NOT NULL
  AND p.procedure_date::date <> a.start_time::date;

-- Only Salesforce-imported prescriptions that are linked to an appointment.
-- Anything entered in the app has sf_id IS NULL and is out of scope by
-- construction; a prescription with no appointment has no visit date to adopt
-- and keeps the date it has.
UPDATE public.procedures p
SET procedure_date = a.start_time
FROM public.appointments a
WHERE a.id = p.appointment_id
  AND p.sf_id IS NOT NULL
  AND p.procedure_date::date <> a.start_time::date;

COMMIT;
