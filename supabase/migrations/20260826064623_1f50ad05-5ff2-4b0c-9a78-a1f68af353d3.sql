-- Add medicine details columns to pharma_products
ALTER TABLE public.pharma_products
  ADD COLUMN IF NOT EXISTS duration text,
  ADD COLUMN IF NOT EXISTS instructions text,
  ADD COLUMN IF NOT EXISTS side_effects text,
  ADD COLUMN IF NOT EXISTS storage_instructions text,
  ADD COLUMN IF NOT EXISTS salesforce_id text UNIQUE;

-- Create index on salesforce_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_pharma_products_salesforce_id
  ON public.pharma_products(salesforce_id);