ALTER TABLE public.pharma_products
  ADD COLUMN IF NOT EXISTS base_unit text,
  ADD COLUMN IF NOT EXISTS sub_unit text,
  ADD COLUMN IF NOT EXISTS conversion_value numeric NOT NULL DEFAULT 1;

UPDATE public.pharma_products
SET base_unit = COALESCE(base_unit, unit)
WHERE base_unit IS NULL;

UPDATE public.pharma_products
SET conversion_value = COALESCE(NULLIF(qty_per_unit, 0), 1)
WHERE (conversion_value IS NULL OR conversion_value = 1) AND qty_per_unit IS NOT NULL;