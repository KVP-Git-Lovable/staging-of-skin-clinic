
ALTER TABLE public.patient_family_members 
  ADD COLUMN name text,
  ALTER COLUMN related_patient_id DROP NOT NULL;

UPDATE public.patient_family_members pfm
SET name = p.first_name || ' ' || p.last_name
FROM public.patients p
WHERE pfm.related_patient_id = p.id AND pfm.name IS NULL;
