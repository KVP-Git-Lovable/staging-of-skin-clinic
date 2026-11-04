-- Moves 9 confirmed test/fake patients (and everything tied to them:
-- appointments, invoices, procedures) into the app's existing Trash system,
-- so they're fully recoverable from the Trash UI if any of them turn out
-- to be wrong. Suyog Hegde is deliberately NOT included - kept as the one
-- retained test patient per the clinic's own instruction.
--
-- Confirmed fake, each individually reviewed against the real data:
--   8496920614 (name is literally a phone number, not a real name)
--   Abhishek Shenoy
--   Ajay Prabhu - KVP - TEST (name contains "TEST" outright)
--   Akshat Prabhu
--   Aruna Mali
--   John F Kennedy
--   Paulina (two duplicate records)
--   Rakesh Sharma (registered under an internal kvpcorp.com staff email,
--     not one of the many genuine "Sharma" patients from the April 23
--     bulk import)
--
-- invoices.patient_id is ON DELETE SET NULL (not CASCADE), so invoices are
-- deleted explicitly here rather than relying on cascade from the patient
-- delete - otherwise they'd survive as orphaned, patient-less rows instead
-- of being removed. appointments/procedures do cascade automatically, but
-- are still deleted explicitly here so each row gets backed up to Trash
-- first (a DB-level cascade wouldn't leave a Trash record behind).
--
-- Safe to re-run: once a patient id is gone, every WHERE clause matching
-- it returns zero rows.
BEGIN;

CREATE TEMP TABLE _cleanup_patient_ids (id uuid) ON COMMIT DROP;
INSERT INTO _cleanup_patient_ids (id) VALUES
  ('15e9d403-be18-4bc4-bea1-f39bf82a9524'), -- 8496920614
  ('f9198624-97bf-4d93-be53-104bf95ee5c2'), -- Abhishek Shenoy
  ('e149c8cb-03a2-45b0-b4f5-f26eac3694dd'), -- Ajay Prabhu - KVP - TEST
  ('dd2f71fe-3f7e-4f7a-a097-4cf87d8d6881'), -- Akshat Prabhu
  ('1cb99b3e-4c19-4263-ae54-98a4f1ce8fee'), -- Aruna Mali
  ('2e5994be-e0cb-45c1-a1d2-0ea8fa4fbb7a'), -- John F Kennedy
  ('52c2048c-6861-434e-8cfa-620de31c7cfe'), -- Paulina (1)
  ('497e2846-6bc9-4530-910e-4a42437b0efe'), -- Paulina (2)
  ('26532d20-48cb-43e8-b5c1-ca9b9d94ef7e'); -- Rakesh Sharma (kvpcorp.com)

-- Procedures
INSERT INTO public.trash_items (object_type, record_id, record_label, record_data, deleted_by_name, status)
SELECT 'procedures', pr.id, pr.service_name, to_jsonb(pr), 'test-data-cleanup-20260903', 'trashed'
FROM public.procedures pr
JOIN _cleanup_patient_ids c ON c.id = pr.patient_id;

DELETE FROM public.procedures pr USING _cleanup_patient_ids c WHERE c.id = pr.patient_id;

-- Invoices
INSERT INTO public.trash_items (object_type, record_id, record_label, record_data, deleted_by_name, status)
SELECT 'invoices', i.id, i.invoice_number, to_jsonb(i), 'test-data-cleanup-20260903', 'trashed'
FROM public.invoices i
JOIN _cleanup_patient_ids c ON c.id = i.patient_id;

DELETE FROM public.invoices i USING _cleanup_patient_ids c WHERE c.id = i.patient_id;

-- Appointments
INSERT INTO public.trash_items (object_type, record_id, record_label, record_data, deleted_by_name, status)
SELECT 'appointments', a.id, a.patient_name, to_jsonb(a), 'test-data-cleanup-20260903', 'trashed'
FROM public.appointments a
JOIN _cleanup_patient_ids c ON c.id = a.patient_id;

DELETE FROM public.appointments a USING _cleanup_patient_ids c WHERE c.id = a.patient_id;

-- Patients (last - everything above referencing them is already gone)
INSERT INTO public.trash_items (object_type, record_id, record_label, record_data, deleted_by_name, status)
SELECT 'patients', p.id, trim(p.first_name || ' ' || coalesce(p.last_name, '')), to_jsonb(p), 'test-data-cleanup-20260903', 'trashed'
FROM public.patients p
JOIN _cleanup_patient_ids c ON c.id = p.id;

DELETE FROM public.patients p USING _cleanup_patient_ids c WHERE c.id = p.id;

COMMIT;
