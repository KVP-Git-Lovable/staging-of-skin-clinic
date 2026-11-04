-- Add per-batch pricing fields
ALTER TABLE public.pharma_inventory
  ADD COLUMN IF NOT EXISTS mrp numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS selling_price numeric NOT NULL DEFAULT 0;

-- Backfill from product-level pricing
UPDATE public.pharma_inventory inv
SET
  mrp = COALESCE(NULLIF(inv.mrp, 0), p.mrp, 0),
  selling_price = COALESCE(NULLIF(inv.selling_price, 0), p.selling_price, p.mrp, 0)
FROM public.pharma_products p
WHERE inv.product_id = p.id;