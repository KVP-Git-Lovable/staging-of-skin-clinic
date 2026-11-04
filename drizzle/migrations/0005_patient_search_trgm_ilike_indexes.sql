CREATE INDEX IF NOT EXISTS idx_patients_first_name_raw_trgm
  ON public.patients USING gin (first_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_patients_last_name_raw_trgm
  ON public.patients USING gin (last_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_patients_email_raw_trgm
  ON public.patients USING gin (email gin_trgm_ops);
