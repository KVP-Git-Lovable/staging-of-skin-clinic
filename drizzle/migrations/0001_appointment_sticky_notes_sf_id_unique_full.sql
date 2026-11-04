DROP INDEX IF EXISTS public.appointment_sticky_notes_sf_id_key;

ALTER TABLE public.appointment_sticky_notes
  ADD CONSTRAINT appointment_sticky_notes_sf_id_key UNIQUE (sf_id);