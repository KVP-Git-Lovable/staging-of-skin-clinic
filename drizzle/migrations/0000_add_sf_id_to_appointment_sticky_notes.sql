ALTER TABLE public.appointment_sticky_notes ADD COLUMN IF NOT EXISTS sf_id text;

CREATE UNIQUE INDEX IF NOT EXISTS appointment_sticky_notes_sf_id_key
  ON public.appointment_sticky_notes (sf_id) WHERE sf_id IS NOT NULL;