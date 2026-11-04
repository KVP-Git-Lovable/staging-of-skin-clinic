ALTER TABLE public.survey_template_products
ADD COLUMN IF NOT EXISTS dosage text,
ADD COLUMN IF NOT EXISTS frequency text,
ADD COLUMN IF NOT EXISTS duration text,
ADD COLUMN IF NOT EXISTS instructions text;