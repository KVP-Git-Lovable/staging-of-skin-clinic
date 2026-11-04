ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS consultation_type TEXT,
  ADD COLUMN IF NOT EXISTS consultation_reasons TEXT[] DEFAULT '{}'::text[];