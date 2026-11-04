CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_patients_first_name_trgm
  ON public.patients USING gin (lower(first_name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_patients_last_name_trgm
  ON public.patients USING gin (lower(last_name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_patients_phone_trgm
  ON public.patients USING gin (phone gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_patients_email_trgm
  ON public.patients USING gin (lower(email) gin_trgm_ops);
