ALTER TABLE public.procedures
  ADD COLUMN IF NOT EXISTS assisted_by_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS lab_tests text;

UPDATE public.procedures
SET assisted_by_ids = ARRAY[assisted_by]
WHERE assisted_by IS NOT NULL AND (assisted_by_ids IS NULL OR cardinality(assisted_by_ids) = 0);