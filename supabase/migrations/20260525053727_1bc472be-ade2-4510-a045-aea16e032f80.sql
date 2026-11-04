ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS source_other_text text;

-- Backfill: patients with existing campaign links default to source='Campaign'
UPDATE public.patients p
SET source = 'Campaign'
WHERE (source IS NULL OR source = 'Walk-in')
  AND EXISTS (SELECT 1 FROM public.patient_campaigns pc WHERE pc.patient_id = p.id);