-- Backfills invoices.appointment_id for invoices created before the
-- one-time invoice insert (src/pages/Billing.tsx) started setting it.
-- Without this link, the Appointments list's Bill Amount/Payment Mode
-- columns can't find a matching invoice and show "-" even for
-- appointments that were actually billed.
--
-- Matching is intentionally conservative: an invoice is only linked when
-- there is exactly one appointment for the same patient + doctor
-- (invoices.doctor_id = appointments.staff_id) on the same calendar day
-- as the invoice. Ambiguous cases (2+ same-day appointments for that
-- patient/doctor) and invoices with no doctor_id are left untouched -
-- many NULLs here are legitimate (walk-in/pharmacy-only invoices with no
-- appointment context, or Salesforce-imported invoices whose source
-- Billing__c record had no linked Appointment__c), so guessing would risk
-- mis-linking rather than just leaving "-" in the UI.
--
-- Safe to re-run: only touches rows where appointment_id is currently
-- null, so a second run is a no-op (and picks up any newly-unambiguous
-- matches from appointments added since the last run).

BEGIN;

-- Preview (informational only, for whoever runs this manually):
-- SELECT count(*) FROM public.invoices i
-- WHERE i.appointment_id IS NULL
--   AND i.patient_id IS NOT NULL AND i.doctor_id IS NOT NULL
--   AND EXISTS (
--     SELECT 1 FROM public.appointments a
--     WHERE a.patient_id = i.patient_id AND a.staff_id = i.doctor_id
--       AND a.start_time::date = i.created_at::date
--   );

UPDATE public.invoices i
SET appointment_id = a.id
FROM public.appointments a
WHERE i.appointment_id IS NULL
  AND i.patient_id IS NOT NULL
  AND i.doctor_id IS NOT NULL
  AND a.patient_id = i.patient_id
  AND a.staff_id = i.doctor_id
  AND a.start_time::date = i.created_at::date
  AND NOT EXISTS (
    SELECT 1 FROM public.appointments a2
    WHERE a2.patient_id = i.patient_id
      AND a2.staff_id = i.doctor_id
      AND a2.start_time::date = i.created_at::date
      AND a2.id <> a.id
  );

COMMIT;
