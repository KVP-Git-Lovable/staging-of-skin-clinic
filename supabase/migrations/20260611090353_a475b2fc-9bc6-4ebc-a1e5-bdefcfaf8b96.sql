ALTER TABLE public.pharma_products
  ADD COLUMN IF NOT EXISTS default_frequency text,
  ADD COLUMN IF NOT EXISTS default_duration text,
  ADD COLUMN IF NOT EXISTS default_instructions text;