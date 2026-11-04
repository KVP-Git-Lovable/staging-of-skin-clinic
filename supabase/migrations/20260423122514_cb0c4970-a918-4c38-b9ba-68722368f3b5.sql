-- New child table for multiple unit conversions per product
CREATE TABLE public.pharma_product_units (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.pharma_products(id) ON DELETE CASCADE,
  sub_unit TEXT NOT NULL,
  conversion_value NUMERIC NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_pharma_product_units_product_id ON public.pharma_product_units(product_id);

ALTER TABLE public.pharma_product_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon all pharma_product_units"
  ON public.pharma_product_units FOR ALL TO anon
  USING (true) WITH CHECK (true);

CREATE POLICY "auth all pharma_product_units"
  ON public.pharma_product_units FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_pharma_product_units_updated_at
  BEFORE UPDATE ON public.pharma_product_units
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill from existing single sub-unit data
INSERT INTO public.pharma_product_units (product_id, sub_unit, conversion_value, is_active, is_default, sort_order)
SELECT id, sub_unit, COALESCE(conversion_value, qty_per_unit, 1), true, true, 0
FROM public.pharma_products
WHERE sub_unit IS NOT NULL AND sub_unit <> '' AND COALESCE(conversion_value, qty_per_unit, 1) > 1;