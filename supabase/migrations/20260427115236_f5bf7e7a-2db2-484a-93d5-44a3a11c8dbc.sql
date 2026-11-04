ALTER TABLE public.procedures ADD COLUMN IF NOT EXISTS survey_response_id uuid;
CREATE INDEX IF NOT EXISTS idx_procedures_survey_response_id ON public.procedures(survey_response_id);