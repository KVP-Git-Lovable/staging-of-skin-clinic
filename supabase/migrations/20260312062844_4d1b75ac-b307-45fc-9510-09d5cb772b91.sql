
-- Price history table for tracking buy/sell price changes over time
CREATE TABLE public.product_prices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.pharma_products(id) ON DELETE CASCADE,
  mrp NUMERIC NOT NULL DEFAULT 0,
  selling_price NUMERIC NOT NULL DEFAULT 0,
  purchase_price NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  effective_from TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  effective_to TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.product_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read product_prices" ON public.product_prices FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert product_prices" ON public.product_prices FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow public update product_prices" ON public.product_prices FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete product_prices" ON public.product_prices FOR DELETE TO anon USING (true);
CREATE POLICY "Auth read product_prices" ON public.product_prices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert product_prices" ON public.product_prices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update product_prices" ON public.product_prices FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth delete product_prices" ON public.product_prices FOR DELETE TO authenticated USING (true);
