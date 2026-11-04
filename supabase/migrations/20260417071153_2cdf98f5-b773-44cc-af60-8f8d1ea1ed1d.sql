-- Add CGST/SGST/IGST columns to tax_master, keep legacy `rate` for backwards compat
ALTER TABLE public.tax_master
  ADD COLUMN IF NOT EXISTS cgst numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst numeric DEFAULT 0;

-- Make legacy `rate` nullable (no longer mandatory; kept for old invoice references)
ALTER TABLE public.tax_master ALTER COLUMN rate DROP NOT NULL;
ALTER TABLE public.tax_master ALTER COLUMN rate SET DEFAULT 0;

-- Backfill: if legacy rate exists and new fields are zero, push it into cgst+sgst (split evenly) or just cgst
UPDATE public.tax_master
SET cgst = COALESCE(rate, 0) / 2,
    sgst = COALESCE(rate, 0) / 2
WHERE COALESCE(rate, 0) > 0
  AND COALESCE(cgst, 0) = 0
  AND COALESCE(sgst, 0) = 0
  AND COALESCE(igst, 0) = 0;

-- Junction table: many products per tax config
CREATE TABLE IF NOT EXISTS public.tax_master_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_id uuid NOT NULL REFERENCES public.tax_master(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.pharma_products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tax_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_tax_master_products_tax ON public.tax_master_products(tax_id);
CREATE INDEX IF NOT EXISTS idx_tax_master_products_product ON public.tax_master_products(product_id);

ALTER TABLE public.tax_master_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon all tax_master_products" ON public.tax_master_products FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth all tax_master_products" ON public.tax_master_products FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Add per-component tax columns to invoices for separate display on bill
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS cgst_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst_amount numeric DEFAULT 0;

ALTER TABLE public.pharma_bills
  ADD COLUMN IF NOT EXISTS cgst_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst_amount numeric DEFAULT 0;