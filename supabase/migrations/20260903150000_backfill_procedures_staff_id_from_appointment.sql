-- Backfills procedures.staff_id from the linked appointment's staff_id for
-- Salesforce-imported procedures that were synced before sf-import-clinical
-- started setting staff_id itself (Diagnosis__c has no doctor field of its
-- own - the doctor was only ever resolvable via the linked Appointment__c).
--
-- This makes the fix permanent in the data (not just a display-time
-- fallback in Procedures.tsx), so Reports/Report Builder and anything else
-- reading procedures.staff_id directly picks it up too.
--
-- Safe to re-run: only touches rows where staff_id is currently null, so a
-- second run is a no-op.
UPDATE public.procedures p
SET staff_id = a.staff_id
FROM public.appointments a
WHERE p.appointment_id = a.id
  AND p.staff_id IS NULL
  AND a.staff_id IS NOT NULL;
