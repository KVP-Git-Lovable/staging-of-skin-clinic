-- Track the originating Salesforce record on every table the Salesforce
-- sync writes into, so re-running the sync can tell "already imported"
-- from "new" without scanning free-text notes columns.
--
-- appointments / invoices / procedures: sf_id = the Salesforce record Id
--   (Appointment__c / Billing__c / Diagnosis__c) that produced the row.
-- patient_photos / procedure_attachments: sf_id = the Salesforce
--   ContentVersion Id of the specific file, since one Salesforce
--   Notes_Pictures__c record can carry several attachments.

ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS sf_id text;
ALTER TABLE public.procedures ADD COLUMN IF NOT EXISTS sf_id text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS sf_id text;
ALTER TABLE public.patient_photos ADD COLUMN IF NOT EXISTS sf_id text;
ALTER TABLE public.procedure_attachments ADD COLUMN IF NOT EXISTS sf_id text;

CREATE INDEX IF NOT EXISTS idx_appointments_sf_id ON public.appointments(sf_id) WHERE sf_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_procedures_sf_id ON public.procedures(sf_id) WHERE sf_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_sf_id ON public.invoices(sf_id) WHERE sf_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_patient_photos_sf_id ON public.patient_photos(sf_id) WHERE sf_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_procedure_attachments_sf_id ON public.procedure_attachments(sf_id) WHERE sf_id IS NOT NULL;

-- Backfill sf_id on rows already imported by the earlier 5-patient pilot,
-- whose traceability tag was embedded in a free-text column, so the
-- generalized sync recognizes them as already-imported instead of
-- re-inserting duplicates.
UPDATE public.appointments
SET sf_id = substring(reason_for_consultation from 'sf_appt_id=([a-zA-Z0-9]+)')
WHERE sf_id IS NULL AND reason_for_consultation ~ 'sf_appt_id=';

UPDATE public.invoices
SET sf_id = substring(notes from 'sf_bill_id=([a-zA-Z0-9]+)')
WHERE sf_id IS NULL AND notes ~ 'sf_bill_id=';

UPDATE public.procedures
SET sf_id = substring(review_notes from 'sf_diag_id=([a-zA-Z0-9]+)')
WHERE sf_id IS NULL AND review_notes ~ 'sf_diag_id=';

UPDATE public.patient_photos
SET sf_id = substring(notes from 'sf_cv_id=([a-zA-Z0-9]+)')
WHERE sf_id IS NULL AND notes ~ 'sf_cv_id=';

UPDATE public.procedure_attachments
SET sf_id = substring(notes from 'sf_cv_id=([a-zA-Z0-9]+)')
WHERE sf_id IS NULL AND notes ~ 'sf_cv_id=';
