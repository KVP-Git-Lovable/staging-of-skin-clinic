ALTER TABLE public.procedures
  ADD COLUMN IF NOT EXISTS visit_type text NOT NULL DEFAULT 'Single',
  ADD COLUMN IF NOT EXISTS recurring_count integer,
  ADD COLUMN IF NOT EXISTS recurring_dates timestamptz[];