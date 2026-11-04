ALTER TABLE public.procedure_attachments
  ADD COLUMN IF NOT EXISTS document_type text;

ALTER TABLE public.procedure_attachments
  ALTER COLUMN procedure_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_procedure_attachments_patient_doctype
  ON public.procedure_attachments(patient_id, document_type);