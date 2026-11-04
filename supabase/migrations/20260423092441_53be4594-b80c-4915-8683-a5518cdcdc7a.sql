ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS sf_id text;
CREATE UNIQUE INDEX IF NOT EXISTS patients_sf_id_unique ON public.patients (sf_id) WHERE sf_id IS NOT NULL;