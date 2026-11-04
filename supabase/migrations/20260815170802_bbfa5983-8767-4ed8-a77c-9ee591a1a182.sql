ALTER TABLE public.pharma_products
  ADD COLUMN IF NOT EXISTS igst_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cgst_percent numeric NOT NULL DEFAULT 0;

ALTER TABLE public.pharma_inventory
  ADD COLUMN IF NOT EXISTS igst_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cgst_percent numeric NOT NULL DEFAULT 0;