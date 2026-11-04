ALTER TABLE public.survey_responses
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS survey_responses_set_updated_at ON public.survey_responses;
CREATE TRIGGER survey_responses_set_updated_at
BEFORE UPDATE ON public.survey_responses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();