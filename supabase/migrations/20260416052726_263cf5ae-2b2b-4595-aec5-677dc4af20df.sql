ALTER TABLE public.survey_templates ADD COLUMN approval_status text NOT NULL DEFAULT 'draft';

ALTER TABLE public.survey_responses ADD COLUMN selected_products jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.survey_responses ADD COLUMN selected_services jsonb DEFAULT '[]'::jsonb;