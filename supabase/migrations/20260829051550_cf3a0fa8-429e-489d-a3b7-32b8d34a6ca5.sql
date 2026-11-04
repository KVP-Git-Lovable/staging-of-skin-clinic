ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS engagement_score integer,
  ADD COLUMN IF NOT EXISTS engagement_tier text,
  ADD COLUMN IF NOT EXISTS engagement_visit_frequency integer,
  ADD COLUMN IF NOT EXISTS engagement_revenue_value integer,
  ADD COLUMN IF NOT EXISTS engagement_treatment_depth integer,
  ADD COLUMN IF NOT EXISTS engagement_retention_signal integer,
  ADD COLUMN IF NOT EXISTS engagement_compliance integer,
  ADD COLUMN IF NOT EXISTS engagement_updated_at timestamptz;