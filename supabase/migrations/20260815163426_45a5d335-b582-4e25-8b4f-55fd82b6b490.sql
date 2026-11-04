ALTER TABLE public.pharma_inventory
  ADD COLUMN IF NOT EXISTS hsn_code text,
  ADD COLUMN IF NOT EXISTS gst_percent numeric NOT NULL DEFAULT 0;

UPDATE public.pharma_inventory i
SET hsn_code = COALESCE(i.hsn_code, p.hsn_code),
    gst_percent = CASE WHEN COALESCE(i.gst_percent,0) = 0 THEN COALESCE(p.gst_percent, 0) ELSE i.gst_percent END
FROM public.pharma_products p
WHERE p.id = i.product_id;