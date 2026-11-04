ALTER TABLE public.services ADD COLUMN IF NOT EXISTS material_percent numeric;
ALTER TABLE public.procedure_services ADD COLUMN IF NOT EXISTS material_percent numeric;