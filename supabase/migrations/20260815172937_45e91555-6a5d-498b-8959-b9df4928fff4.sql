ALTER TABLE public.pharma_products
  ADD COLUMN IF NOT EXISTS purchase_unit text,
  ADD COLUMN IF NOT EXISTS sale_unit text;

ALTER TABLE public.pharma_inventory
  ADD COLUMN IF NOT EXISTS purchase_unit text,
  ADD COLUMN IF NOT EXISTS purchase_quantity numeric;

ALTER TABLE public.pharma_inventory
  ALTER COLUMN quantity TYPE numeric USING quantity::numeric;

ALTER TABLE public.pharma_bill_items
  ALTER COLUMN quantity TYPE numeric USING quantity::numeric;

ALTER TABLE public.pharma_bill_items
  ADD COLUMN IF NOT EXISTS uom text,
  ADD COLUMN IF NOT EXISTS uom_conversion numeric NOT NULL DEFAULT 1;

UPDATE public.pharma_products
SET purchase_unit = COALESCE(purchase_unit, base_unit, unit),
    sale_unit = COALESCE(sale_unit, base_unit, unit)
WHERE purchase_unit IS NULL OR sale_unit IS NULL;

UPDATE public.pharma_inventory i
SET purchase_unit = COALESCE(i.purchase_unit, p.base_unit, p.unit),
    purchase_quantity = COALESCE(i.purchase_quantity, i.quantity)
FROM public.pharma_products p
WHERE p.id = i.product_id
  AND (i.purchase_unit IS NULL OR i.purchase_quantity IS NULL);