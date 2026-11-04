ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS total_visits integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lifetime_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_visit_date timestamp with time zone,
  ADD COLUMN IF NOT EXISTS days_since_last_visit integer;