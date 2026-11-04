
-- Make procedure_id nullable so prescriptions can exist without a procedure (e.g. from survey approval)
ALTER TABLE public.prescriptions ALTER COLUMN procedure_id DROP NOT NULL;

-- Add survey_response_id for traceability
ALTER TABLE public.prescriptions ADD COLUMN survey_response_id uuid REFERENCES public.survey_responses(id) ON DELETE SET NULL;
